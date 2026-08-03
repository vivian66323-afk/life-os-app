/* Life OS — the shared studio backend (Supabase).
 *
 * WHAT THIS IS FOR. Ten people in one studio: everything filed 工作 is one list
 * they all read, while 家庭 and anything unfiled stays readable only by its
 * author. Enforced by Row Level Security in the database — see
 * docs/supabase/001_init.sql and ADR-0008/0009.
 *
 * LOCAL-FIRST, NON-NEGOTIABLY (ADR-0011). This file never becomes the write
 * path. A thought is written to localStorage and is safe there; sync happens
 * afterwards, and every failure mode here — offline, signed out, project down,
 * wrong password — must leave the app exactly as usable as it was before anyone
 * had heard of a server. Thoughts arrive in lifts and basements; a capture that
 * needs a network is a capture that loses thoughts.
 *
 * NO SDK. Same reason gcal.js has none: plain fetch against a documented HTTP
 * API, no third-party script, no build step (ADR-0001).
 *
 * WHOSE VERSION WINS. Not a timestamp comparison — comparing a phone's clock to
 * the server's means a phone with a wrong clock silently loses edits. Rows carry
 * `dirty`: changed here, not yet accepted there. Dirty rows are pushed, clean
 * rows take the server's copy. See LOSModel.touch.
 */
window.LOSCloud = (function () {
  'use strict';

  var SESSION_KEY = 'los_cloud_session';

  /* Columns are the app's names except where SQL keywords force a rename — `at`
   * and `on` are reserved, and a column that must be quoted forever is one that
   * will one day be quoted wrongly. The mapping lives here and nowhere else:
   * knowing how the store spells things is exactly this layer's job. */
  var TO_ROW = {
    id: 'id', title: 'title', meta: 'meta', section: 'section',
    role: 'hat', scope: 'scope', at: 'at_time', on: 'on_date',
    seq: 'seq', done: 'done'
  };

  var ACTIVE_KEY = 'los_cloud_ws';

  var session = null;      // { token, refresh, expiresAt, userId, email }
  var names = {};          // userId -> display name, for rows that are not yours
  var lastError = null;

  /* Studios this account belongs to. ADR-0014.
   *
   * wsMode is the honest answer to "has 003 been applied?" — null until asked,
   * then true or false. It exists because the app is deployed BEFORE the
   * migration is run, deliberately: sending workspace_id to a database with no
   * such column fails the entire write batch, so until the table is there the
   * app must behave exactly as it did before anyone had heard of workspaces. */
  var lastSyncAt = 0;      // when a round trip last succeeded
  var wsMode = null;
  var isPlatform = false;   // runs the platform; arranges studios, reads no task
  var myWs = [];           // [{ id, name, admin, role }]

  function conf(k) { return (window.LOSConfig && window.LOSConfig[k]) || ''; }
  function configured() { return !!(conf('supabaseUrl') && conf('supabaseKey')); }

  // ---- session --------------------------------------------------------------

  function loadSession() {
    if (session) return session;
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch (e) { session = null; }
    return session;
  }

  function storeSession(s) {
    session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* private mode — memory only */ }
  }

  function signedIn() { return !!loadSession(); }
  function me() { var s = loadSession(); return s ? s.userId : ''; }
  function email() { var s = loadSession(); return s ? s.email : ''; }
  function nameOf(id) { return names[id] || ''; }

  function absorb(data) {
    if (!data || !data.access_token) return null;
    var u = data.user || {};
    storeSession({
      token: data.access_token,
      refresh: data.refresh_token || '',
      // A minute of slack, so a request never leaves with a token that expires
      // in flight.
      expiresAt: Date.now() + ((Number(data.expires_in) || 3600) - 60) * 1000,
      userId: u.id || '',
      email: u.email || ''
    });
    return session;
  }

  // ---- signing in with Google ------------------------------------------------

  /* Ten people, no passwords to distribute and nobody mistyping an address.
   *
   * A full-page redirect, not a popup — for the reason gcal.js documents at
   * length: on an iPhone, in a home-screen app or any in-app browser, the popup
   * flow produces a bare 400. A redirect is the one thing every browser does.
   *
   * Supabase hands the session back in the URL fragment, which is never sent to
   * a server — not to GitHub Pages, not to anyone — so the token stays on the
   * device. */
  function appUrl() {
    return window.location.origin + window.location.pathname;
  }

  function signInWithGoogle() {
    if (!configured()) return;
    window.location.assign(
      conf('supabaseUrl') + '/auth/v1/authorize?provider=google&redirect_to='
      + encodeURIComponent(appUrl())
    );
  }

  /* Reads the session Supabase left in the fragment, then scrubs it so a
   * credential is not left in the address bar, in history, or in the next
   * screenshot.
   *
   * MUST RUN BEFORE LOSCal.absorbRedirect(). Both flows come back with
   * `access_token` in the fragment, and gcal's version wipes the fragment before
   * it checks whether the response was even meant for it. The tell is
   * `refresh_token`: Supabase sends one, Google's implicit flow never does. If it
   * is absent this returns false and leaves the fragment completely alone. */
  function absorbRedirect() {
    var hash = window.location.hash || '';
    if (hash.indexOf('refresh_token') === -1) return false;

    var p = new URLSearchParams(hash.replace(/^#/, ''));
    var access = p.get('access_token');
    var refresh = p.get('refresh_token');

    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
    if (!access || !refresh) { lastError = 'no-token'; return false; }

    storeSession({
      token: access,
      refresh: refresh,
      expiresAt: Date.now() + ((Number(p.get('expires_in')) || 3600) - 60) * 1000,
      // Filled in by whoAmI() below; the fragment does not carry the user.
      userId: '',
      email: ''
    });
    return true;
  }

  /* The fragment gives a token but not who it belongs to, and every read policy
   * turns on `owner_id = auth.uid()` — so the app cannot sync until it knows. */
  function whoAmI() {
    var s = loadSession();
    if (!s || s.userId) return Promise.resolve(s);
    return fetch(conf('supabaseUrl') + '/auth/v1/user', {
      headers: { apikey: conf('supabaseKey'), Authorization: 'Bearer ' + s.token }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) {
        if (!u || !u.id) { storeSession(null); return null; }
        s.userId = u.id;
        s.email = u.email || '';
        storeSession(s);
        return loadNames().then(function () { return s; });
      })
      ['catch'](function () {
        /* Offline right after the redirect. The token is good, so keep it — the
         * next launch with signal finishes the job rather than making them sign
         * in again. */
        return null;
      });
  }

  // ---- transport ------------------------------------------------------------

  function authFetch(path, body) {
    return fetch(conf('supabaseUrl') + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: conf('supabaseKey'), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json()['catch'](function () { return {}; }).then(function (data) {
        if (!r.ok) {
          var e = new Error((data && (data.error_description || data.msg || data.message)) || ('http-' + r.status));
          e.status = r.status;
          throw e;
        }
        return data;
      });
    });
  }

  /* A valid access token, refreshing first if this one is spent. Resolves to ''
   * when there is no usable session — callers treat that as "stay local", never
   * as an error worth showing. */
  function token() {
    var s = loadSession();
    if (!s) return Promise.resolve('');
    if (s.expiresAt > Date.now()) return Promise.resolve(s.token);
    if (!s.refresh) { storeSession(null); return Promise.resolve(''); }

    return authFetch('token?grant_type=refresh_token', { refresh_token: s.refresh })
      .then(function (data) { return absorb(data) ? session.token : ''; })
      ['catch'](function (e) {
        // A rejected refresh token is permanent: the session is over. Anything
        // else (offline, 500) is temporary and must not sign the person out.
        if (e && (e.status === 400 || e.status === 401)) storeSession(null);
        return '';
      });
  }

  function rest(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      if (!t) throw new Error('signed-out');
      var headers = {
        apikey: conf('supabaseKey'),
        Authorization: 'Bearer ' + t,
        'Content-Type': 'application/json'
      };
      if (opts.prefer) headers.Prefer = opts.prefer;
      return fetch(conf('supabaseUrl') + '/rest/v1/' + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      }).then(function (r) {
        if (r.status === 401) { storeSession(null); throw new Error('signed-out'); }
        if (!r.ok) {
          return r.text()['catch'](function () { return ''; }).then(function (txt) {
            var e = new Error('http-' + r.status + (txt ? ' ' + txt.slice(0, 200) : ''));
            e.status = r.status;
            throw e;
          });
        }
        if (r.status === 204) return null;
        return r.json()['catch'](function () { return null; });
      });
    });
  }

  // ---- row conversion -------------------------------------------------------

  function toRow(t, ownerId) {
    var row = {};
    for (var k in TO_ROW) if (TO_ROW.hasOwnProperty(k)) row[TO_ROW[k]] = t[k];
    row.owner_id = ownerId;
    row.deleted_at = null;
    /* When the thought was HAD, not when it happened to be uploaded. Left to the
     * column default, a thought written three days ago comes back from the first
     * sync looking brand new — which quietly empties 需要你 and makes "放了 N
     * 天了" lie. The `|| Date.now()` matters: a createdAt of 0 would otherwise
     * become 1970 and stamp the row as twenty thousand days overdue. */
    row.created_at = new Date(t.createdAt || Date.now()).toISOString();
    /* Only once the column exists. A private thought belongs to a person rather
     * than a company, so it carries no studio at all — and the write policy
     * requires exactly that pairing. */
    if (wsMode === true) {
      row.workspace_id = (t.scope === LOSModel.SCOPES.COMPANY && t.workspaceId)
        ? t.workspaceId : null;
    }
    return row;
  }

  function fromRow(row) {
    var props = {
      dirty: false,
      ownerId: row.owner_id || '',
      workspaceId: row.workspace_id || ''
    };
    for (var k in TO_ROW) if (TO_ROW.hasOwnProperty(k)) props[k] = row[TO_ROW[k]];
    props.updatedAt = row.updated_at ? Date.parse(row.updated_at) : Date.now();
    /* createdAt drives "放了 N 天了", so it comes from the server's created_at
     * rather than being invented at pull time — otherwise every row looks like
     * it was thought of the moment this device happened to sync. */
    props.createdAt = row.created_at ? Date.parse(row.created_at) : Date.now();
    return LOSModel.normalizeTask(LOSModel.createTask(props));
  }

  // ---- merge (pure) ---------------------------------------------------------

  /* Reconciles what the server has with what this device has. Pure and
   * synchronous so it can be tested exhaustively without a network — this is
   * the function that can lose someone's work, so it is the one worth pinning
   * down hardest.
   *
   * Rules, in order:
   *   - a row this device deleted stays deleted, and the deletion is pushed
   *   - a dirty row keeps the local version and is pushed
   *   - a clean row takes the server's version
   *   - a row the server has deleted is removed here
   *   - a local row the server has never seen is pushed, if it is yours
   *   - a row belonging to someone else is never pushed and never editable
   */
  function merge(local, remote, graves, myId) {
    var byId = {};
    local.forEach(function (t) { byId[t.id] = t; });
    var buried = {};
    (graves || []).forEach(function (g) { buried[g.id] = g; });

    var tasks = [];
    var pushes = [];
    var seen = {};

    (remote || []).forEach(function (row) {
      seen[row.id] = true;
      var mine = byId[row.id];

      // Deleted here: it must not come back, and the server must be told.
      if (buried[row.id]) return;

      // Deleted there: it goes, unless this device has an unsent change — an
      // edit you made offline is not something to throw away silently.
      if (row.deleted_at) {
        if (mine && mine.dirty && row.owner_id === myId) { tasks.push(mine); pushes.push(mine); }
        return;
      }

      if (mine && mine.dirty) { tasks.push(mine); pushes.push(mine); return; }
      tasks.push(fromRow(row));
    });

    local.forEach(function (t) {
      if (seen[t.id] || buried[t.id]) return;
      // Somebody else's row that the server no longer offers us: it was deleted,
      // or refiled 個人 and is no longer ours to see. Either way it is not ours
      // to keep a copy of.
      if (t.ownerId && t.ownerId !== myId) return;
      tasks.push(t);
      /* Pushed whether or not it is dirty. Deletion is SOFT — a row deleted
       * anywhere still exists with deleted_at set — so "the server has never
       * offered us this row" can only mean it never arrived. Pushing only dirty
       * rows here left a thought that had lost its dirty flag stranded on one
       * phone forever, and an upsert costs nothing to repeat. */
      pushes.push(t);
    });

    return { tasks: tasks, pushes: pushes };
  }

  // ---- sync -----------------------------------------------------------------

  /* One round trip. Resolves to { tasks, graves, changed } — never rejects, and
   * on any failure returns the state it was given, untouched. The caller cannot
   * be made worse off by calling this. */
  function sync(state) {
    var untouched = { tasks: state.tasks, graves: state.graves || [], changed: false };
    if (!configured() || !signedIn()) return Promise.resolve(untouched);
    // A Google redirect leaves a token but no identity, and every read policy
    // turns on knowing who we are.
    return whoAmI()
      .then(function () { return me() ? loadWorkspaces() : null; })
      .then(function () { return me() ? loadPlatform() : null; })
      .then(function () { return me() ? claimInvites() : 0; })
      .then(function (claimed) {
        // Just let in by an invitation: the roster we loaded a moment ago is
        // already out of date.
        return claimed ? loadWorkspaces() : null;
      })
      .then(function () { return me() ? syncAs(state, me()) : untouched; })
      ['catch'](function (e) {
        lastError = (e && e.message) || 'sync-failed';
        return untouched;
      });
  }

  function syncAs(state, myId) {
    lastError = null;

    return rest('tasks?select=*')
      .then(function (rows) {
        var out = merge(state.tasks, rows || [], state.graves, myId);

        /* Anything written before this device signed in has no owner. It is the
         * person's own work — claim it, so years of thoughts are not stranded on
         * one phone. Their 家庭 rows go up too; RLS means only they can ever
         * read them back. */
        out.pushes.forEach(function (t) { if (!t.ownerId) t.ownerId = myId; });
        var send = out.pushes.filter(function (t) { return t.ownerId === myId; });

        if (wsMode === true) {
          /* A 公司 row written before this device knew about studios has no
           * workspace yet. It joins the one being looked at now. */
          var active = activeWs();
          send.forEach(function (t) {
            if (t.scope === LOSModel.SCOPES.COMPANY && !t.workspaceId) t.workspaceId = active;
          });
          /* A 公司 row with nowhere to go is HELD BACK rather than sent. The
           * write policy would reject it, and PostgREST rejects the whole batch
           * as one — so one unassignable row would stop every other thought on
           * the phone from syncing. It stays dirty and goes up the moment its
           * author is let into a studio. */
          send = send.filter(function (t) {
            return t.scope !== LOSModel.SCOPES.COMPANY || !!t.workspaceId;
          });
        }

        var jobs = [];
        if (send.length) {
          jobs.push(rest('tasks', {
            method: 'POST',
            prefer: 'resolution=merge-duplicates,return=minimal',
            body: send.map(function (t) { return toRow(t, myId); })
          }).then(function () {
            // Only now is it safe to call these clean.
            send.forEach(function (t) { t.dirty = false; });
          }));
        }

        var unsent = (state.graves || []).filter(function (g) { return !g.pushed; });
        if (unsent.length) {
          jobs.push(rest('tasks?id=in.(' + unsent.map(function (g) {
            return '"' + g.id + '"';
          }).join(',') + ')', {
            method: 'PATCH',
            prefer: 'return=minimal',
            body: { deleted_at: new Date().toISOString() }
          }).then(function () {
            unsent.forEach(function (g) { g.pushed = true; });
          })['catch'](function () { /* retried next sync */ }));
        }

        jobs.push(loadNames());

        return Promise.all(jobs).then(function () {
          lastSyncAt = Date.now();
          return { tasks: out.tasks, graves: state.graves || [], changed: true };
        });
      })
      ['catch'](function (e) {
        lastError = (e && e.message) || 'sync-failed';
        return { tasks: state.tasks, graves: state.graves || [], changed: false };
      });
  }

  function activeWs() {
    var id = '';
    try { id = localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) {}
    for (var i = 0; i < myWs.length; i++) if (myWs[i].id === id) return id;
    return myWs.length ? myWs[0].id : '';
  }

  function setActiveWs(id) {
    try { localStorage.setItem(ACTIVE_KEY, id || ''); } catch (e) {}
  }

  function activeWorkspace() {
    var id = activeWs();
    for (var i = 0; i < myWs.length; i++) if (myWs[i].id === id) return myWs[i];
    return null;
  }

  /* PGRST205 is PostgREST saying "no such table". That is not an error here —
   * it is a database that has not run 003 yet answering honestly, and the app
   * carries on as the single-studio version it was yesterday. */
  function loadWorkspaces() {
    return rest('memberships?select=workspace_id,role,admin,workspaces(id,name)')
      .then(function (rows) {
        wsMode = true;
        myWs = (rows || []).map(function (m) {
          return {
            id: m.workspace_id,
            name: (m.workspaces && m.workspaces.name) || '',
            admin: !!m.admin,
            role: m.role || 'staff'
          };
        });
      })
      ['catch'](function (e) {
        if (e && /PGRST205|schema cache/.test(e.message || '')) {
          wsMode = false; myWs = []; return;
        }
        throw e;
      });
  }

  /* An invitation is consumed at signup by a trigger, which does nothing for
   * somebody who already had an account — i.e. everyone who signed in before the
   * studio existed. Idempotent, one indexed lookup, and it can only ever act on
   * the caller's own address. */
  /* Whether this account runs the platform. The policy lets you see only your
   * own row, so asking is the whole check — there is no list to leak. */
  function loadPlatform() {
    if (wsMode !== true) { isPlatform = false; return Promise.resolve(false); }
    return rest('platform_admins?select=user_id&user_id=eq.' + me())
      .then(function (rows) { isPlatform = !!(rows && rows.length); return isPlatform; })
      ['catch'](function () { isPlatform = false; return false; });
  }

  /* Every studio, with how many people are in each. Deliberately no task data:
   * arranging who is where is the whole of this authority (ADR-0015). */
  function allStudios() {
    if (!isPlatform) return Promise.resolve([]);
    return rest('workspaces?select=id,name,memberships(user_id)')
      .then(function (rows) {
        return (rows || []).map(function (w) {
          return { id: w.id, name: w.name, people: (w.memberships || []).length };
        });
      })['catch'](function () { return []; });
  }

  function createStudio(name) {
    return rest('workspaces', {
      method: 'POST', prefer: 'return=representation', body: { name: String(name).trim() }
    });
  }

  /* Invites the first admin of a studio. A new studio has no members, so its
   * boss cannot be invited by one — the invitation itself has to carry it. */
  function inviteAdmin(ws, mail) {
    return rest('invites', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
      body: { workspace_id: ws, email: String(mail).trim().toLowerCase(),
              role: 'director', admin: true }
    });
  }

  function claimInvites() {
    if (wsMode !== true) return Promise.resolve(0);
    return rest('rpc/claim_invites', { method: 'POST', body: {} })
      .then(function (n) { return Number(n) || 0; })
      ['catch'](function () { return 0; });
  }

  // Who is who, so a shared row can say whose it is.
  function loadNames() {
    return rest('profiles?select=id,display_name')
      .then(function (rows) {
        (rows || []).forEach(function (p) { names[p.id] = p.display_name || ''; });
      })['catch'](function () { /* names are a nicety, never a blocker */ });
  }

  /* Your own name, as the studio reads it. Google's own full_name is a starting
   * point, not an answer: on a shared list what people need is the name their
   * colleagues use, which is often neither the Google account name nor the part
   * before the @. 002 narrowed the UPDATE privilege to this one column, so this
   * cannot touch anything else even if it tried. */
  function setDisplayName(name) {
    var id = me();
    if (!id) return Promise.reject(new Error('signed-out'));
    return rest('profiles?id=eq.' + id, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { display_name: name }
    }).then(function () { names[id] = name; });
  }

  /* The people you share a studio with. Names come from profiles, which the
   * read policy already limits to exactly that set — so this asks for everyone
   * it is allowed to see rather than filtering here. */
  function roster() {
    return rest('profiles?select=id,display_name')
      .then(function (rows) {
        (rows || []).forEach(function (p) { names[p.id] = p.display_name || ''; });
        return (rows || []).map(function (p) {
          return { id: p.id, name: p.display_name || '', me: p.id === me() };
        });
      })
      ['catch'](function () { return []; });
  }

  function pendingInvites(ws) {
    if (wsMode !== true || !ws) return Promise.resolve([]);
    return rest('invites?select=email,role&workspace_id=eq.' + ws)
      ['catch'](function () { return []; });
  }

  function invite(ws, mail) {
    if (wsMode !== true) return Promise.reject(new Error('no-workspaces'));
    if (!ws) return Promise.reject(new Error('no-workspace'));
    return rest('invites', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { workspace_id: ws, email: String(mail).trim().toLowerCase() }
    });
  }

  function uninvite(ws, mail) {
    return rest('invites?workspace_id=eq.' + ws + '&email=eq.' + encodeURIComponent(mail), {
      method: 'DELETE', prefer: 'return=minimal'
    });
  }

  return {
    configured: configured,
    setDisplayName: setDisplayName,
    workspaceMode: function () { return wsMode === true; },
    workspaces: function () { return myWs.slice(); },
    activeWorkspace: activeWorkspace,
    setActiveWorkspace: setActiveWs,
    roster: roster,
    pendingInvites: pendingInvites,
    invite: invite,
    uninvite: uninvite,
    signedIn: signedIn,
    signInWithGoogle: signInWithGoogle,
    absorbRedirect: absorbRedirect,
    whoAmI: whoAmI,
    me: me,
    email: email,
    nameOf: nameOf,
    lastError: function () { return lastError; },
    lastSync: function () { return lastSyncAt; },
    isPlatformAdmin: function () { return isPlatform; },
    allStudios: allStudios,
    createStudio: createStudio,
    inviteAdmin: inviteAdmin,

    signIn: function (mail, password) {
      if (!configured()) return Promise.reject(new Error('not-configured'));
      return authFetch('token?grant_type=password', { email: mail, password: password })
        .then(function (data) {
          if (!absorb(data)) throw new Error('no-token');
          return loadNames().then(function () { return session; });
        });
    },

    /* Signs out of this device only. Local data is deliberately left alone: it
     * is the person's own, it is what the app runs on, and deleting it here
     * would mean signing out could destroy a thought. */
    signOut: function () {
      var s = loadSession();
      if (s && configured()) {
        fetch(conf('supabaseUrl') + '/auth/v1/logout', {
          method: 'POST',
          headers: { apikey: conf('supabaseKey'), Authorization: 'Bearer ' + s.token }
        })['catch'](function () {});
      }
      names = {};
      storeSession(null);
    },

    sync: sync,
    merge: merge   // exported for tests
  };
})();
