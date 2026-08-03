/* Life OS — application logic.
 *
 * Executable form of the frozen prototypes:
 *   Level 1 Starter      (../prototype/01_Starter.md)     — one thing, today, capture, closure
 *   Level 2 Professional (../prototype/02_Professional.md) — the identity lens
 *
 * Level 2 adds exactly two rings over Starter, as that spec requires: the lens
 * (hats), and a Needs-You / Balance band. The Starter core is untouched — ignore
 * the hats and the app behaves exactly as Level 1 did.
 *
 * Boundaries:
 *   - Task and Role shapes come from model.js  (LOSModel).
 *   - Persistence goes only through storage.js (LOSStorage).
 *   - Wording comes only from strings.js       (LOSStrings).
 * This file never touches localStorage, never hard-codes a task shape, and
 * never contains a user-facing English string.
 */
(function () {
  var S = LOSModel.SECTIONS;
  var SC = LOSModel.SCOPES;
  var T = window.LOSStrings;

  var ALL = 'all';
  // "Rising risk": something open long enough that it has started to rot.
  var NEEDS_AFTER_DAYS = 2;
  var DAY = 86400000;

  var state = { tasks: [], roles: [], graves: [] };
  var lens = ALL;              // deliberately not persisted — "All" is the default view
  /* One switch for the whole list, never per row. Not persisted either: an app
   * that reopens in 編輯 mode is an app whose next tap changes something the
   * person only meant to read. */
  var editMode = false;
  // Which row's red ⊖ has been tapped, and is therefore showing its confirm.
  var delArmed = null;
  var isFirstRun = false;
  var firstRender = true;
  var clearTimer = null;

  /* Local first, always. save() is what makes a thought safe; the push that
   * follows is a courtesy to the other nine people and must never be something
   * capture waits for. */
  var syncTimer = null;
  function persist() {
    LOSStorage.save(state);
    if (!window.LOSCloud || !LOSCloud.signedIn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncNow(); }, 1500);
  }

  var syncing = false;
  function syncNow() {
    if (syncing || !window.LOSCloud || !LOSCloud.signedIn()) return Promise.resolve();
    syncing = true;
    renderAcct();
    return LOSCloud.sync(state).then(function (out) {
      state.tasks = out.tasks;
      state.graves = out.graves;
      syncing = false;
      // Coming back from Google, this is the first moment we know who they are.
      askNameOnce();
      /* And the first moment the studio is knowable. Hanging this off
       * askNameOnce() meant anyone who had already answered that question saw an
       * empty studio block — the roster was only ever fetched on the one path
       * that skips itself the second time. */
      if (acctOpen) loadStudio();
      // Writes back whatever the round trip settled: cleared dirty flags,
      // claimed owners, buried graves.
      LOSStorage.save(state);
      render();
    })['catch'](function () { syncing = false; render(); });
  }

  // The one place a task is mutated from. Missing a call here means an edit that
  // never leaves the phone, so every mutation site goes through it.
  function touch(t) { return LOSModel.touch(t); }

  function myName() {
    if (!window.LOSCloud || !LOSCloud.signedIn()) return '';
    return LOSCloud.nameOf(LOSCloud.me()) || (LOSCloud.email() || '').split('@')[0];
  }

  function isMine(t) {
    if (!window.LOSCloud || !LOSCloud.signedIn()) return true;
    return !t.ownerId || t.ownerId === LOSCloud.me();
  }

  // ---- elements -------------------------------------------------------------
  var stage       = document.getElementById('stage');
  var daymetaEl   = document.getElementById('daymeta');
  var greetingEl  = document.getElementById('greeting');
  var lensEl      = document.getElementById('lens');
  var gliderEl    = document.getElementById('glider');
  var captionEl   = document.getElementById('caption');
  var captionRowEl = document.getElementById('captionRow');
  var editBtn     = document.getElementById('editToggle');
  var scopeSwEl   = document.getElementById('scopeSwitch');
  var captureBox  = document.querySelector('.capture');
  var acctBtn     = document.getElementById('acct');
  var acctBoxEl   = document.getElementById('acctBox');
  var welcomeEl   = document.getElementById('welcome');
  var onethingEl  = document.getElementById('onething');
  var needsSecEl  = document.getElementById('needsSection');
  var needsEl     = document.getElementById('needs');
  var schedSecEl  = document.getElementById('schedSection');
  var schedEl     = document.getElementById('sched');
  var todaySecEl  = document.getElementById('todaySection');
  var todayEl     = document.getElementById('today');
  var todoSecEl   = document.getElementById('todoSection');
  var todoEl      = document.getElementById('todo');
  var laterEl     = document.getElementById('later');
  var laterListEl = document.getElementById('laterList');
  var laterCntEl  = document.getElementById('laterCount');
  var balanceEl   = document.getElementById('balance');
  var silenceEl   = document.querySelector('.silence');
  var input       = document.getElementById('captureInput');
  var plusBtn     = document.getElementById('capturePlus');
  var wheelEl     = document.getElementById('timeWheel');
  var wheelAP     = document.getElementById('wheelAP');
  var wheelH      = document.getElementById('wheelH');
  var wheelM      = document.getElementById('wheelM');
  var wheelClear  = document.getElementById('wheelClear');
  var dateStripEl = document.getElementById('dateStrip');

  // ---- roles ----------------------------------------------------------------
  function roleById(id) {
    for (var i = 0; i < state.roles.length; i++) {
      if (state.roles[i].id === id) return state.roles[i];
    }
    return null;
  }

  // ---- dates ----------------------------------------------------------------
  function ymd(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2)
         + '-' + ('0' + d.getDate()).slice(-2);
  }
  function todayKey() { return ymd(new Date()); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d; }

  // '' means today, which is what almost every thought means.
  function dateOf(t) { return t.on || todayKey(); }
  function isToday(t) { return dateOf(t) === todayKey(); }
  function isFuture(t) { return dateOf(t) > todayKey(); }

  function withinWeek(t) {
    // 待辦事項 has no date by definition — dateOf() falls back to today, which
    // would drag the entire backlog into a view whose whole promise is "things
    // with a date in the next seven days".
    if (t.section === S.TODO) return false;
    var k = dateOf(t);
    return k >= todayKey() && k <= ymd(addDays(7));
  }

  function isView(id) {
    for (var i = 0; i < LOSModel.VIEWS.length; i++) {
      if (LOSModel.VIEWS[i].id === id) return true;
    }
    return false;
  }

  /* A hat filters by identity; a view asks a question across all of them.
   * A task with no hat belongs to the whole life, so a hat never hides
   * something it was never given. */
  function inLens(t) {
    if (lens === ALL) return true;
    // 待辦事項 is a place now, not the question "what is still open" — that
    // question repeated every row on the page and answered nothing.
    if (lens === 'todo') return t.section === S.TODO;
    if (lens === 'week') return withinWeek(t);
    return t.role === lens;
  }

  /* Which half of the world is on screen. Unlike the hat lens this IS persisted
   * — see the note in storage.js: 全部 cannot be captured into, so defaulting to
   * it would open the app in a state where a thought cannot be written down. */
  function scopeNow() { return state.scope || 'all'; }
  function canCapture() { return scopeNow() !== 'all'; }

  function inScope(t) {
    var sc = scopeNow();
    if (sc === 'all') return true;
    if (sc === 'company') return t.scope === SC.COMPANY;
    return t.scope !== SC.COMPANY;
  }

  function buildScopeSwitch() {
    scopeSwEl.textContent = '';
    [['all', 'scopeAll'], ['company', 'scopeCompany'], ['private', 'scopePrivate']]
      .forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = pair[0];
        b.setAttribute('data-scope', pair[0]);
        b.textContent = T.get(pair[1]);
        scopeSwEl.appendChild(b);
      });
  }

  function renderScopeSwitch() {
    var sc = scopeNow();
    var btns = scopeSwEl.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-scope') === sc;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', String(on));
    }
    /* Closed, and visibly so. The field is disabled rather than left to accept
     * text that would then have nowhere to go — a capture field that swallows
     * what you typed is the exact failure this product exists to prevent. */
    var lock = !canCapture();
    if (captureBox) captureBox.classList.toggle('locked', lock);
    input.disabled = lock;
    input.setAttribute('placeholder', T.get(lock ? 'captureLocked' : 'capture'));
  }

  function ageDays(t) {
    return t.createdAt ? Math.floor((Date.now() - t.createdAt) / DAY) : 0;
  }

  // Derived, not a flag someone has to remember to set: anything still open
  // after a couple of days has started to need you.
  function needsYou(t) {
    // Something dated for the future isn't rotting, it's scheduled. And a
    // colleague's ageing thought is their business — being nagged about work you
    // cannot even tick off is how a shared list becomes noise.
    return isMine(t)
      && !t.done
      && !isFuture(t)
      && (t.section === S.TODAY || t.section === S.ONE)
      && ageDays(t) >= NEEDS_AFTER_DAYS;
  }

  /* Yesterday's plan is not today's.
   *
   * An empty `on` means today — which is right for a thought written this
   * morning and quietly wrong for one written on Friday: every morning it was
   * relabelled as today's problem, kept its Friday time, and sat there being
   * nagged about. Three of them at 15:50, 18:00 and 20:00 on a day none of
   * those times belong to.
   *
   * So a thought whose day has gone and was never ticked off returns to
   * 待辦事項 — unscheduled, because whatever it was scheduled for is over —
   * carrying the date it was for so it does not read as though it was never
   * planned. Done ones are left exactly where they are; a finished day should
   * stay finished. */
  function rollOverStale() {
    var today = todayKey();
    var moved = 0;
    state.tasks.forEach(function (t) {
      if (t.done) return;
      if (t.section !== S.TODAY && t.section !== S.ONE) return;
      // The day it was for: its own date, or the day it was written.
      var day = t.on || (t.createdAt ? ymd(new Date(t.createdAt)) : today);
      if (day >= today) return;
      t.wasFor = day;
      t.section = S.TODO;
      t.at = '';   // that time belonged to that day
      t.on = '';
      touch(t);
      moved++;
    });
    if (moved) persist();
    return moved;
  }

  // ---- header (real clock) --------------------------------------------------
  function renderHeader() {
    var now = new Date();
    daymetaEl.textContent = now.toLocaleDateString(T.t.locale,
      { weekday: 'long', day: 'numeric', month: 'long' });
    var h = now.getHours();
    greetingEl.textContent = h < 12 ? T.get('morning')
                           : (h < 18 ? T.get('afternoon') : T.get('evening'));
  }

  // ---- lens -----------------------------------------------------------------
  function buildLens() {
    // Rebuilt from state.roles so renaming a hat needs no markup change.
    var btns = lensEl.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) lensEl.removeChild(btns[i]);

    function add(id, label) {
      var b = document.createElement('button');
      b.setAttribute('data-role', id);
      b.textContent = label;
      lensEl.appendChild(b);
    }
    add(ALL, T.get('all'));
    state.roles.forEach(function (r) { add(r.id, r.label); });
    LOSModel.VIEWS.forEach(function (v) { add(v.id, v.label); });

    lensEl.hidden = state.roles.length === 0;
    captionRowEl.hidden = lensEl.hidden;
  }

  function renderLens() {
    if (lensEl.hidden) return;
    var btns = lensEl.querySelectorAll('button');
    var active = null;
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-role') === lens;
      btns[i].classList.toggle('active', on);
      btns[i].setAttribute('aria-pressed', String(on));
      if (on) active = btns[i];
    }
    // No glider to move: with the tabs wrapping onto two rows a single sliding
    // element cannot track them, so .active carries the highlight in CSS.
    var r = roleById(lens);
    var caption = T.get('captionAll');
    if (lens === 'todo') caption = T.get('captionTodo');
    else if (lens === 'week') caption = T.get('captionWeek');
    else if (r) caption = T.get('captionRole', { role: r.label });
    captionEl.innerHTML = '';
    captionEl.appendChild(document.createTextNode(caption));
    if (editMode) {
      var help = document.createElement('div');
      help.className = 'edit-help';
      help.textContent = T.get('editHelp');
      captionEl.appendChild(help);
    }
  }

  // ---- edit mode ------------------------------------------------------------
  function renderEditBtn() {
    editBtn.textContent = T.get(editMode ? 'editDone' : 'edit');
    editBtn.classList.toggle('on', editMode);
    editBtn.setAttribute('aria-pressed', String(editMode));
    stage.classList.toggle('editing', editMode);
  }

  // ---- the studio account ---------------------------------------------------
  /* Closed by default and never blocking. Signed out, the app is exactly what it
   * was before any of this existed — which is the whole point of ADR-0011. */
  var acctOpen = false;
  var acctMsg = '';
  var acctBad = false;
  var acctBusy = false;
  /* The studio, its people, and who has been invited but not arrived. Loaded
   * when the panel opens rather than on every render — it is three requests
   * nobody needs until they look. */
  var wsRoster = [];
  var wsInvites = [];
  var pfStudios = [];
  var pfPicked = '';

  function loadStudio() {
    if (!window.LOSCloud || !LOSCloud.signedIn() || !LOSCloud.workspaceMode()) return;
    var ws = LOSCloud.activeWorkspace();
    Promise.all([LOSCloud.roster(), LOSCloud.pendingInvites(ws ? ws.id : '')])
      .then(function (out) {
        wsRoster = out[0] || [];
        wsInvites = out[1] || [];
        renderAcct();
      })['catch'](function () {});
    if (LOSCloud.isPlatformAdmin()) {
      LOSCloud.allStudios().then(function (rows) { pfStudios = rows; renderAcct(); });
    }
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderAcct() {
    if (!window.LOSCloud || !LOSCloud.configured()) {
      acctBtn.hidden = true;
      acctBoxEl.hidden = true;
      return;
    }
    var inn = LOSCloud.signedIn();
    acctBtn.hidden = false;
    /* Two lines when signed in — the studio name over the address it belongs to.
     * The name is what colleagues read on the shared list, and the email is how
     * you tell two accounts apart when you have both. Signed out it collapses to
     * one word, because there is nothing else true to say. */
    acctBtn.textContent = '';
    if (!inn) {
      acctBtn.appendChild(el('span', 'acctname', T.get('signIn')));
    } else {
      acctBtn.appendChild(el('span', 'acctname',
        syncing ? T.get('syncing') : (myName() || T.get('signedIn'))));
      var mail = LOSCloud.email();
      if (mail) acctBtn.appendChild(el('span', 'acctmail', mail));
    }
    acctBtn.classList.toggle('on', acctOpen);
    acctBoxEl.hidden = !acctOpen;
    if (!acctOpen) return;

    acctBoxEl.textContent = '';
    acctBoxEl.appendChild(el('h4', null, T.get('acctTitle')));

    if (!inn) {
      acctBoxEl.appendChild(el('p', null, T.get('acctBody')));

      /* Google first, and big. Ten people means ten passwords to distribute and
       * ten chances to mistype an address — which is exactly what went wrong on
       * the first attempt. */
      var g = el('button', 'primary wide', T.get('signInGoogle'));
      g.type = 'button';
      g.setAttribute('data-google', '');
      acctBoxEl.appendChild(g);

      // Kept, quietly, as the way in if Google is ever misconfigured.
      acctBoxEl.appendChild(el('div', 'acctalt', T.get('orPassword')));

      var mail = el('input');
      mail.type = 'email';
      mail.id = 'acctEmail';
      mail.autocapitalize = 'off';
      mail.setAttribute('placeholder', T.get('acctEmail'));
      var pw = el('input');
      pw.type = 'password';
      pw.id = 'acctPw';
      pw.setAttribute('placeholder', T.get('acctPassword'));
      acctBoxEl.appendChild(mail);
      acctBoxEl.appendChild(pw);

      var row = el('div', 'acctrow');
      var go = el('button', 'primary', T.get(acctBusy ? 'signingIn' : 'signIn'));
      go.type = 'button';
      go.setAttribute('data-signin', '');
      go.disabled = acctBusy;
      row.appendChild(go);
      acctBoxEl.appendChild(row);
    } else {
      acctBoxEl.appendChild(el('p', null, T.get('signedInAs', { email: LOSCloud.email() })));

      /* The name colleagues read. Google's own account name is a starting point,
       * not an answer — on a shared list what matters is the name the studio uses
       * for you, which is often neither that nor the part before the @. */
      acctBoxEl.appendChild(el('div', 'acctlabel', T.get('myName')));
      var nm = el('input');
      nm.type = 'text';
      nm.id = 'acctName';
      nm.value = myName();
      nm.setAttribute('placeholder', T.get('myName'));
      acctBoxEl.appendChild(nm);
      acctBoxEl.appendChild(el('div', 'acctalt', T.get('myNameNote')));

      var nrow = el('div', 'acctrow');
      var savebtn = el('button', 'primary', T.get('save'));
      savebtn.type = 'button';
      savebtn.setAttribute('data-savename', '');
      nrow.appendChild(savebtn);
      acctBoxEl.appendChild(nrow);

      if (LOSCloud.workspaceMode()) renderStudio();
      if (LOSCloud.isPlatformAdmin()) renderPlatform();

      /* When it last synced by itself. The button beside it kept being read as
       * "press this or nothing arrives", which is the opposite of true. */
      acctBoxEl.appendChild(el('div', 'acctalt', T.get('syncAuto') + ' ' + syncedAgo()));

      var row2 = el('div', 'acctrow');
      var now = el('button', null, T.get('syncNow'));
      now.type = 'button';
      now.setAttribute('data-sync', '');
      var out = el('button', 'spacer', T.get('signOut'));
      out.type = 'button';
      out.setAttribute('data-signout', '');
      row2.appendChild(now);
      row2.appendChild(out);
      acctBoxEl.appendChild(row2);
    }

    var why = !acctMsg && inn && LOSCloud.lastError() ? T.get('syncFailed') : acctMsg;
    if (why) {
      var m = el('div', 'msg' + (acctBad || !acctMsg ? ' bad' : ''), why);
      acctBoxEl.appendChild(m);
    }
  }

  /* Opens the account panel on the name field the first time this device knows
   * who is signed in. One prompt, once — not a modal that has to be dismissed,
   * because it must never stand between somebody and writing a thought down. */
  function askNameOnce() {
    if (!window.LOSCloud || !LOSCloud.signedIn() || !LOSCloud.me()) return;
    if (state.nameAsked) return;
    state.nameAsked = true;
    LOSStorage.save(state);
    acctOpen = true;
    acctMsg = '';
    renderAcct();
    loadStudio();
    var nm = document.getElementById('acctName');
    if (nm) { try { nm.focus(); nm.select(); } catch (e) {} }
  }

  /* Everything about the studio you are in: which one, who else is in it, and —
   * for an admin — the one field that lets somebody else in. Hidden entirely
   * before 003 has been applied, because none of it exists yet. */
  function renderStudio() {
    var list = LOSCloud.workspaces();
    var ws = LOSCloud.activeWorkspace();

    acctBoxEl.appendChild(el('div', 'acctlabel', T.get('studio')));

    if (!ws) {
      /* Not in a studio. Says so plainly, and says what it costs — the app still
       * works, and their 工作 rows are simply not shared yet. Silence here reads
       * as the app being broken. */
      acctBoxEl.appendChild(el('p', null, T.get('noStudio')));
      return;
    }

    if (list.length > 1) {
      // Only when there is a choice. One studio needs no switch.
      var sw = el('div', 'wsswitch');
      list.forEach(function (w) {
        var b = el('button', w.id === ws.id ? 'active' : null, w.name || T.get('studio'));
        b.type = 'button';
        b.setAttribute('data-ws', w.id);
        sw.appendChild(b);
      });
      acctBoxEl.appendChild(sw);
    } else {
      acctBoxEl.appendChild(el('p', null, ws.name || T.get('studio')));
    }

    if (wsRoster.length) {
      acctBoxEl.appendChild(el('div', 'acctlabel', T.get('members')));
      var ul = el('div', 'wsroster');
      wsRoster.forEach(function (m) {
        ul.appendChild(el('div', 'wsperson' + (m.me ? ' mine' : ''), m.name || m.id));
      });
      acctBoxEl.appendChild(ul);
    }

    if (!ws.admin) return;

    acctBoxEl.appendChild(el('div', 'acctlabel', T.get('inviteLabel')));
    var mail = el('input');
    mail.type = 'email';
    mail.id = 'inviteEmail';
    mail.autocapitalize = 'off';
    mail.setAttribute('placeholder', T.get('acctEmail'));
    acctBoxEl.appendChild(mail);
    acctBoxEl.appendChild(el('div', 'acctalt', T.get('inviteNote')));

    var irow = el('div', 'acctrow');
    var ibtn = el('button', 'primary', T.get('inviteBtn'));
    ibtn.type = 'button';
    ibtn.setAttribute('data-invite', '');
    irow.appendChild(ibtn);
    acctBoxEl.appendChild(irow);

    /* Invited but never arrived. Set 03 S2.3: a mistyped address and a person
     * who has not got round to it look identical from the other side, and the
     * only place the difference is visible is here. */
    if (wsInvites.length) {
      acctBoxEl.appendChild(el('div', 'acctlabel', T.get('pending')));
      wsInvites.forEach(function (iv) {
        var line = el('div', 'wsperson');
        line.appendChild(document.createTextNode(iv.email));
        var x = el('button', 'wsdrop', T.get('withdraw'));
        x.type = 'button';
        x.setAttribute('data-uninvite', iv.email);
        line.appendChild(x);
        acctBoxEl.appendChild(line);
      });
    }
  }

  /* The tier above the studios. Arranging only — there is deliberately nothing
   * here that shows a task, because the authority does not include reading one
   * (ADR-0015), and a screen that implied otherwise would be lying about what
   * the database will actually hand over. */
  function renderPlatform() {
    acctBoxEl.appendChild(el('div', 'acctlabel', T.get('platform')));
    acctBoxEl.appendChild(el('p', null, T.get('platformNote')));

    pfStudios.forEach(function (w) {
      var line = el('div', 'wsperson' + (w.id === pfPicked ? ' picked' : ''));
      line.setAttribute('data-pick', w.id);
      line.appendChild(document.createTextNode(w.name));
      line.appendChild(el('span', 'wscount', T.get('studioPeople', { n: w.people })));
      acctBoxEl.appendChild(line);
    });

    var nw = el('input');
    nw.type = 'text';
    nw.id = 'newStudio';
    nw.setAttribute('placeholder', T.get('newStudio'));
    acctBoxEl.appendChild(nw);
    var r1 = el('div', 'acctrow');
    var mk = el('button', null, T.get('createStudio'));
    mk.type = 'button';
    mk.setAttribute('data-newstudio', '');
    r1.appendChild(mk);
    acctBoxEl.appendChild(r1);

    if (!pfPicked) return;

    var bm = el('input');
    bm.type = 'email';
    bm.id = 'bossEmail';
    bm.autocapitalize = 'off';
    bm.setAttribute('placeholder', T.get('bossEmail'));
    acctBoxEl.appendChild(bm);
    var r2 = el('div', 'acctrow');
    var bb = el('button', 'primary', T.get('makeBoss'));
    bb.type = 'button';
    bb.setAttribute('data-makeboss', '');
    r2.appendChild(bb);
    acctBoxEl.appendChild(r2);
  }

  function syncedAgo() {
    var at = window.LOSCloud && LOSCloud.lastSync ? LOSCloud.lastSync() : 0;
    if (!at) return T.get('syncedNever');
    var mins = Math.floor((Date.now() - at) / 60000);
    if (mins < 1) return T.get('syncedJust');
    if (mins < 60) return T.get('syncedMin', { n: mins });
    return T.get('syncedHour', { n: Math.floor(mins / 60) });
  }

  function setAcctMsg(text, bad) {
    acctMsg = text || '';
    acctBad = !!bad;
    renderAcct();
  }

  function doSignIn() {
    var mail = document.getElementById('acctEmail');
    var pw = document.getElementById('acctPw');
    if (!mail || !pw || !mail.value.trim() || !pw.value) {
      setAcctMsg(T.get('needBoth'), true);
      return;
    }
    acctBusy = true;
    setAcctMsg('');
    LOSCloud.signIn(mail.value.trim(), pw.value)
      .then(function () {
        acctBusy = false;
        setAcctMsg('');
        /* Everything already on this phone becomes theirs and uploads — see the
         * v5 migration. Which is why the panel says what is about to be shared
         * BEFORE the password field, not after. */
        return syncNow();
      })
      /* Deliberately left open. The sync inside askNameOnce() has already opened
       * it on the name field, and closing it here fought that — the panel now
       * holds the name, 立刻同步 and 登出, all of which are worth seeing the
       * moment you get in. */
      .then(function () { askNameOnce(); renderAcct(); })
      ['catch'](function (e) {
        acctBusy = false;
        var why = (e && e.message) || '';
        setAcctMsg(/invalid|credential|grant/i.test(why) ? T.get('badCreds')
          : T.get('signInFailed', { why: why }), true);
      });
  }

  function setEditMode(on) {
    editMode = !!on;
    // Leaving 編輯 closes whatever was open, so nothing stays half-edited behind
    // a mode the person has already stepped out of.
    if (!editMode) {
      delArmed = null;
      editingText = null;
      editing = null;
      editingDate = null;
    }
    render();
  }

  // ---- task row -------------------------------------------------------------
  function tagFor(t, opts) {
    var r = roleById(t.role);
    var editable = !!(opts && opts.editable);
    // Reading: no hat, no tag. Editing: an unhatted thought still needs a slot,
    // or the one thought that most needs filing is the one you cannot file.
    if (!r && !editable) return null;
    var tag = document.createElement('button');
    tag.className = 'tag' + (r ? ' ' + r.cls : ' none');
    tag.type = 'button';
    if (editable) {
      /* Tapping a hat moves the thought to the next one. This is also how it
       * moves between 公司 and 個人 — the hat is what decides who may read it,
       * so there is deliberately no second control for visibility to fall out
       * of sync with. */
      tag.setAttribute('data-cycle', t.id);
    }
    tag.setAttribute('title', r ? r.label : T.get('noRole'));
    var dot = document.createElement('span');
    dot.className = 'dot';
    tag.appendChild(dot);
    tag.appendChild(document.createTextNode(r ? r.label : T.get('noRole')));
    return tag;
  }

  function taskRow(t, opts) {
    opts = opts || {};
    /* Somebody else's thought. Shown — that is what a shared list is for — but
     * inert: the database will refuse the write, and a control that fails
     * silently teaches people the app is broken. Editing is gated on `mine`
     * everywhere below, not just visually. */
    var mine = isMine(t);
    var row = document.createElement('div');
    row.className = 'task clearable' + (t.done ? ' done' : '')
      + (opts.needs ? ' needs' : '') + (mine ? '' : ' foreign');
    row.setAttribute('data-id', t.id);

    var editable = editMode && mine;

    /* The circle on the left does one of two jobs, and never both at once.
     *
     * Reading: it completes the thought (and strikes it through). In 編輯 mode it
     * becomes a red ⊖ — the iOS pattern, which is the one already in people's
     * hands. Deliberately a second tap to confirm: a thumb brushing a row while
     * scrolling must not be able to lose a thought, and that is the one failure
     * this whole app exists to prevent. */
    var check = document.createElement('button');
    check.className = 'check';
    if (editable) {
      check.className = 'check del';
      check.setAttribute('data-delarm', t.id);
      check.setAttribute('aria-label', T.get('del'));
      check.textContent = '−';
    } else if (mine) {
      check.setAttribute('data-check', '');
      check.setAttribute('aria-label', T.get('complete'));
    } else {
      check.disabled = true;
      check.setAttribute('aria-disabled', 'true');
      check.setAttribute('aria-label', T.get('complete'));
    }

    var body = document.createElement('div');
    body.className = 'task-body';
    if (editable && editingText === t.id) {
      // In place: the row becomes the editor. Nothing opens, nothing to come
      // back from, and the thought stays where you were looking at it.
      var field = document.createElement('input');
      field.className = 'task-edit';
      field.type = 'text';
      field.value = t.title;
      field.setAttribute('data-edit-field', t.id);
      field.setAttribute('aria-label', T.get('editHint'));
      body.appendChild(field);
    } else {
      var title = document.createElement('div');
      title.className = 'task-title';
      // Only a control while 編輯 is on. Outside it, a tap on the words does
      // nothing at all — which is what reading a list should cost.
      if (editable) title.setAttribute('data-edit', t.id);
      title.textContent = t.title;
      body.appendChild(title);
    }

    /* Under the title, like a byline. It was a pill on the right, where it
     * competed with the time and the hat for the narrowest part of the row; a
     * name belongs with the words it is attached to. */
    if (!mine || opts.whose) {
      var who = mine ? myName() : LOSCloud.nameOf(t.ownerId);
      body.appendChild(el('div', 'whose' + (mine ? ' mine' : ''), who || T.get('someone')));
    }

    var stale = t.wasFor ? t.wasFor.split('-') : null;
    var metaText = t.meta
      || (stale ? T.get('wasFor', { y: Number(stale[0]), m: Number(stale[1]), d: Number(stale[2]) })
                : (opts.needs ? T.get('needsMeta', { n: ageDays(t) }) : ''));
    if (metaText) {
      var meta = document.createElement('div');
      meta.className = 'task-meta';
      meta.textContent = metaText;
      body.appendChild(meta);
    }

    row.appendChild(check);
    row.appendChild(body);

    // Delete lives in 編輯 mode, on every row. A destructive control has no
    // business under your thumb on a list you scroll past daily — but once you
    // have deliberately said "I am editing", hunting for it is the worse cost.
    if (editingText === t.id) {
      var del = document.createElement('button');
      del.className = 'row-del';
      del.type = 'button';
      del.setAttribute('data-del', t.id);
      del.textContent = T.get('del');
      row.appendChild(del);
      return row;
    }

    // Armed by the red ⊖. The confirm sits at the far right, as far from the
    // circle you just tapped as the row allows.
    if (delArmed === t.id) {
      var sure = document.createElement('button');
      sure.className = 'row-del armed';
      sure.type = 'button';
      sure.setAttribute('data-del', t.id);
      sure.textContent = T.get('del');
      row.appendChild(sure);
      return row;
    }

    /* Date and time. Reading: shown only when they say something — a date that
     * is not today, a time that was set. Editing: both slots are always there,
     * because a time you cannot reach is a time you cannot change, and an
     * unscheduled thought is exactly the one that needs a time putting on it. */
    if (!isToday(t)) {
      var dp = t.on.split('-');
      var dd = document.createElement('button');
      dd.className = 'task-date';
      dd.type = 'button';
      if (editable) dd.setAttribute('data-date', t.id);
      dd.textContent = T.get('dateFmt', { m: Number(dp[1]), d: Number(dp[2]) });
      row.appendChild(dd);
    } else if (editable) {
      var dslot = document.createElement('button');
      dslot.className = 'task-date empty';
      dslot.type = 'button';
      dslot.setAttribute('data-date', t.id);
      dslot.textContent = T.get('noDate');
      row.appendChild(dslot);
    }

    if (t.at) {
      var tm = document.createElement('button');
      tm.className = 'task-time set';
      tm.type = 'button';
      if (editable) tm.setAttribute('data-time', t.id);
      tm.textContent = t.at;
      tm.setAttribute('title', T.get('setTime'));
      row.appendChild(tm);
    } else if (editable && t.section !== S.TODO) {
      /* 待辦事項 means "not scheduled", so an empty time slot there offers a
       * button whose only effect is to move the row out of the band you are
       * looking at. The date strip is left as the way to schedule it — one way
       * out is enough, and a date is the decision people actually make first. */
      var tslot = document.createElement('button');
      tslot.className = 'task-time empty';
      tslot.type = 'button';
      tslot.setAttribute('data-time', t.id);
      tslot.textContent = T.get('noTime');
      row.appendChild(tslot);
    }

    /* The hat. Inside a hat every row would wear the same tag — noise, so it is
     * dropped there. Everywhere else it is shown: 待辦事項 and 未來一周規劃 both
     * cut across the hats, so which hat a row wears is exactly what you cannot
     * work out from where it sits. */
    if (lens === ALL || isView(lens)) {
      var tag = tagFor(t, { editable: editable });
      if (tag) row.appendChild(tag);
    }
    /* Whose it is. Shown on EVERY row — including your own — as soon as the list
     * holds more than one person's work. Labelling only other people's rows
     * looked tidier and was worse: on a shared 今天 with two things at 20:00, the
     * unlabelled ones are the ones you cannot account for. When the list is only
     * yours, no names appear at all; a name on every line of your own list says
     * nothing. */
    return row;
  }

  // ---- schedule (read-only) -------------------------------------------------
  /* Events are context, never tasks — no checkbox is built here, deliberately.
   * See gcal.js. Kept in its own array so it can never mix with state.tasks and
   * accidentally get saved, completed, or counted as work. */
  var events = [];

  function renderSchedule() {
    var visible = events.filter(function (ev) {
      return lens === ALL || ev.role === lens || !ev.role;
    });

    schedEl.textContent = '';
    visible.forEach(function (ev) {
      var row = document.createElement('div');
      row.className = 'sched-item';

      var time = document.createElement('span');
      time.className = 'sched-time';
      time.textContent = ev.allDay || !ev.at
        ? T.get('allDay')
        : ev.at.toLocaleTimeString(T.t.locale, { hour: '2-digit', minute: '2-digit', hour12: false });

      var title = document.createElement('span');
      title.className = 'sched-title';
      title.textContent = ev.title;

      row.appendChild(time);
      row.appendChild(title);
      if (lens === ALL) {
        var tag = tagFor({ role: ev.role });
        if (tag) { tag.removeAttribute('data-cycle'); row.appendChild(tag); }
      }
      schedEl.appendChild(row);
    });

    schedSecEl.hidden = visible.length === 0;
  }

  /* Shown only before the calendar has ever been linked on this device. Until
   * it is tapped, no Google script is fetched and no request is made — a
   * feature you have not asked for should cost you nothing. */
  /* Turns an internal failure code into something worth reading. A silent
   * failure is what made this feature take four attempts to land. */
  function calReason(code) {
    if (code === 'state-lost' || code === 'state-mismatch') return T.get('calWhyStateLost');
    if (code === 'access_denied') return T.get('calWhyDenied');
    if (code === 'unauthorized') return T.get('calWhyAuth');
    if (code && code.indexOf('http-') === 0) return T.get('calWhyNet');
    return code || '';
  }

  function setCalStatus(text, bad) {
    var el = document.getElementById('calStatus');
    if (!text) { if (el) el.parentNode.removeChild(el); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'calStatus';
      el.className = 'cal-status';
      el.setAttribute('role', 'status');
      document.getElementById('calBox').appendChild(el);
    }
    el.className = 'cal-status' + (bad ? ' bad' : '');
    el.textContent = text;
  }

  function renderConnect() {
    var existing = document.getElementById('calConnect');
    if (existing) existing.parentNode.removeChild(existing);
    /* Shown whenever there is no usable token — NOT merely when the device has
     * never linked. Keying this off linked() created a dead end: once linked,
     * an expired token meant no schedule and no button to fix it. */
    if (!window.LOSCal || !LOSCal.configured() || LOSCal.connected()) return;

    var btn = document.createElement('button');
    btn.id = 'calConnect';
    btn.className = 'cal-connect';
    btn.type = 'button';
    btn.textContent = T.get('calConnect');
    // Leaves the app entirely; Google brings it back with a token. No popup,
    // because a popup is exactly what iOS broke.
    btn.addEventListener('click', function () {
      btn.disabled = true;
      LOSCal.connect();
    });
    document.getElementById('calBox').appendChild(btn);
  }

  function loadSchedule() {
    renderConnect();
    if (!window.LOSCal || !LOSCal.configured()) return;

    if (!LOSCal.connected()) {
      // Say why the last attempt failed, rather than showing the same button
      // again as if nothing had happened.
      var why = LOSCal.lastError();
      setCalStatus(why ? T.get('calFail', { why: calReason(why) }) : '', !!why);
      return;
    }

    LOSCal.today().then(function (list) {
      events = list;
      renderSchedule();
      var err = LOSCal.lastError();
      if (err) setCalStatus(T.get('calFail', { why: calReason(err) }), true);
      else setCalStatus(list.length ? T.get('calOk', { n: list.length })
                                    : T.get('calNone'), false);
      // Silence Mode means "nothing needs you" — a day with appointments in it
      // is not that day, so don't let the schedule sit under a cleared stage.
      if (events.length) stage.classList.remove('is-clear');
    });
  }

  // ---- balance nudge --------------------------------------------------------
  // A hat is "quiet" when it has nothing open at all while another is busy.
  function quietRole() {
    if (lens !== ALL || state.roles.length < 2) return null;
    var open = {}, busiest = 0;
    state.roles.forEach(function (r) { open[r.id] = 0; });
    state.tasks.forEach(function (t) {
      if (!t.done && open[t.role] != null) open[t.role]++;
    });
    state.roles.forEach(function (r) { busiest = Math.max(busiest, open[r.id]); });
    if (busiest < 2) return null;
    for (var i = 0; i < state.roles.length; i++) {
      if (open[state.roles[i].id] === 0) return state.roles[i];
    }
    return null;
  }

  // ---- render (state -> DOM) ------------------------------------------------
  /* Fills a list, split into 公司 / 個人 when the split says something.
   *
   * A heading over the entire list says nothing, so a group appears only when
   * both groups have rows. What the two headings buy is a legible answer to
   * "who else can see this?" — everything under 公司 is what the whole company
   * reads, and the gap between the groups is the line those rows cannot cross. */
  function fillList(el, tasks, opts) {
    el.textContent = '';
    var company = tasks.filter(function (t) { return t.scope === SC.COMPANY; });
    var mine    = tasks.filter(function (t) { return t.scope !== SC.COMPANY; });
    var split   = opts && opts.groupByScope && company.length && mine.length;

    if (!split) {
      tasks.forEach(function (t) { el.appendChild(taskRow(t, opts)); });
      return;
    }
    [['scopeCompany', 'scopeCompanyNote', 'company', company],
     ['scopePrivate', 'scopePrivateNote', 'private', mine]].forEach(function (g) {
      var head = document.createElement('div');
      head.className = 'scope-label ' + g[2];
      head.appendChild(document.createTextNode(T.get(g[0])));
      var note = document.createElement('span');
      note.className = 'scope-note';
      note.textContent = T.get(g[1]);
      head.appendChild(note);
      el.appendChild(head);
      g[3].forEach(function (t) { el.appendChild(taskRow(t, opts)); });
    });
  }

  function render() {
    renderHeader();
    renderLens();
    renderEditBtn();
    renderScopeSwitch();
    renderAcct();
    renderSchedule();
    renderWheel();
    renderDateStrip();
    renderBulkCal();

    var visible = state.tasks.filter(function (t) { return inLens(t) && inScope(t); });

    // Within a band: timed thoughts in clock order first, then untimed ones in
    // the order they were captured. A time is a commitment; the rest is a list.
    visible.sort(function (x, y) {
      var dx = dateOf(x), dy = dateOf(y);
      if (dx !== dy) return dx < dy ? -1 : 1;
      if (!!x.at !== !!y.at) return x.at ? -1 : 1;
      if (x.at && y.at && x.at !== y.at) return x.at < y.at ? -1 : 1;
      return (x.createdAt || 0) - (y.createdAt || 0);
    });

    /* Something dated for next Tuesday is not today's problem, so it does not
     * sit in Today shouting. It waits under Later with its date on it, and
     * shows up properly under 未來一周規劃. Inside that view, of course, the
     * whole point is to see them. */
    var showFuture = (lens === 'week');
    var dated  = function (t) { return showFuture || !isFuture(t); };
    var ones   = visible.filter(function (t) { return t.section === S.ONE && isMine(t) && dated(t); });
    /* Someone else's 最重要的一件事 joins 今天 rather than replacing yours. There
     * is one headline on this screen and it belongs to the person reading it. */
    var todays = visible.filter(function (t) {
      return (t.section === S.TODAY || (t.section === S.ONE && !isMine(t))) && dated(t);
    });
    // Captured, not scheduled. A date can only get here by way of 編輯, and
    // setting one promotes the thought out of this band — so it stays honest.
    var todos  = visible.filter(function (t) { return t.section === S.TODO; });
    var laters = visible.filter(function (t) {
      if (t.section === S.TODO) return false;
      return t.section === S.LATER || (!showFuture && isFuture(t) && t.section !== S.LATER);
    });

    /* 公司 / 個人 is shown where the answer changes what you do: the shared
     * lists. Inside a hat every row has the same answer, and 今天 is a single
     * short list you read top to bottom — splitting either would be filing for
     * filing's sake. */
    /* The 公司 / 個人 headings answer a question the switch already answers when
     * it is set to one side, so they appear only under 全部. */
    var bothOnScreen = scopeNow() === 'all';
    /* Signed in? Then every row says whose it is.
     *
     * This used to appear only when more than one person's work was on screen —
     * my own judgement that a name on every line of your own list says nothing.
     * It was wrong twice over: it hid the feature from the only person able to
     * check that it worked, and it meant the day a colleague finally appeared,
     * the whole list changed shape at once. Signed out there is no name to show
     * and none appears. */
    var whose = !!(window.LOSCloud && LOSCloud.signedIn());

    var groupTodo = { groupByScope: bothOnScreen, whose: whose };
    var groupWeek = { groupByScope: bothOnScreen && lens === 'week', whose: whose };

    var needs = ones.concat(todays).filter(needsYou);
    var needsIds = {};
    needs.forEach(function (t) { needsIds[t.id] = true; });

    // the one thing (single) — promoted out if it has gone stale
    var one = ones.filter(function (t) { return !needsIds[t.id]; })[0];
    if (one) {
      onethingEl.hidden = false;
      onethingEl.classList.toggle('done', !!one.done);
      onethingEl.setAttribute('data-id', one.id);
      onethingEl.querySelector('.ot-text').textContent = one.title;
      var slot = onethingEl.querySelector('.ot-title');
      var old = slot.querySelector('.tag');
      if (old) slot.removeChild(old);
      if (lens === ALL) {
        var otTag = tagFor(one, { editable: editMode });
        if (otTag) slot.appendChild(otTag);
      }
    } else {
      onethingEl.hidden = true;
      onethingEl.removeAttribute('data-id');
    }

    needsEl.textContent = '';
    needs.forEach(function (t) { needsEl.appendChild(taskRow(t, { needs: true })); });
    needsSecEl.hidden = needs.length === 0;

    fillList(todayEl, todays.filter(function (t) { return !needsIds[t.id]; }), groupWeek);
    todaySecEl.hidden = todayEl.children.length === 0;

    fillList(todoEl, todos, groupTodo);
    todoSecEl.hidden = todos.length === 0;

    fillList(laterListEl, laters, groupWeek);
    laterEl.hidden = laters.length === 0;
    laterCntEl.textContent = laters.length ? '· ' + laters.length : '';

    var quiet = quietRole();
    balanceEl.hidden = !quiet;
    if (quiet) balanceEl.textContent = T.get('quiet', { role: quiet.label });

    // First run is the one screen that explains itself. It is not Silence Mode:
    // "nothing left to do" and "you have never used this" are different days.
    welcomeEl.hidden = !(isFirstRun && state.tasks.length === 0);
    /* A first run that opens under 全部 meets a locked field, and the welcome text
     * says "put anything in the box below" — so it has to say which button comes
     * first, or the very first screen contradicts itself. */
    var pick = welcomeEl.querySelector('.welcome-pick');
    if (!welcomeEl.hidden && !canCapture()) {
      if (!pick) {
        pick = el('p', 'welcome-hint welcome-pick', T.get('welcomePickSide'));
        welcomeEl.appendChild(pick);
      }
    } else if (pick) {
      welcomeEl.removeChild(pick);
    }

    /* 待辦事項 counts. Silence Mode hides every list on the page, so if a full
     * backlog could still trigger it the app would answer "今天沒有事情需要你"
     * while quietly hiding the list of things there are to do. */
    var openCount = ones.concat(todays, todos).filter(function (t) { return !t.done; }).length;
    var r = roleById(lens);
    silenceEl.textContent = r ? T.get('roleSilence', { role: r.label }) : T.get('silence');

    // Silence Mode is the reward for a finished day. It must never be what a
    // brand-new user meets — that reads as a broken app, which is exactly what
    // happened the first time a real person opened this.
    clearTimeout(clearTimer);
    // Emptiness that belongs to a lens is not the same as a finished day, so the
    // day's own header survives it — see .is-scoped in index.html.
    stage.classList.toggle('is-scoped', lens !== ALL);
    if (openCount === 0 && welcomeEl.hidden && events.length === 0) {
      // First load collapses immediately (no greeting flash); reached by
      // completing the last task, delay so the check can animate.
      if (firstRender) stage.classList.add('is-clear');
      else clearTimer = setTimeout(function () { stage.classList.add('is-clear'); }, 340);
    } else {
      stage.classList.remove('is-clear');
    }
    firstRender = false;
  }

  // ---- event handlers -------------------------------------------------------
  function onClick(e) {
    var el = e.target.closest ? e.target : null;
    if (!el) return;

    if (el.closest('#editToggle')) {
      e.stopPropagation();
      setEditMode(!editMode);
      return;
    }

    var scopeBtn = el.closest('[data-scope]');
    if (scopeBtn && scopeSwEl.contains(scopeBtn)) {
      e.stopPropagation();
      state.scope = scopeBtn.getAttribute('data-scope');
      LOSStorage.save(state);
      render();
      return;
    }

    if (el.closest('#acct')) {
      e.stopPropagation();
      acctOpen = !acctOpen;
      acctMsg = '';
      renderAcct();
      if (acctOpen) loadStudio();
      return;
    }
    if (el.closest('[data-google]')) {
      e.stopPropagation();
      // Leaves the app. Supabase brings it back with the session in the fragment.
      LOSCloud.signInWithGoogle();
      return;
    }
    var arm = el.closest('[data-delarm]');
    if (arm) {
      e.stopPropagation();
      var armId = arm.getAttribute('data-delarm');
      // Tapping the same circle again backs out — the way out has to be as easy
      // as the way in, or the confirm is just a speed bump.
      delArmed = (delArmed === armId) ? null : armId;
      render();
      return;
    }

    if (el.closest('[data-signin]')) { e.stopPropagation(); doSignIn(); return; }
    if (el.closest('[data-sync]')) {
      e.stopPropagation();
      setAcctMsg('');
      syncNow().then(function () {
        setAcctMsg(LOSCloud.lastError() ? T.get('syncFailed') : T.get('syncOk'),
                   !!LOSCloud.lastError());
      });
      return;
    }
    var pick = el.closest('[data-pick]');
    if (pick) {
      e.stopPropagation();
      pfPicked = pick.getAttribute('data-pick');
      renderAcct();
      return;
    }

    if (el.closest('[data-newstudio]')) {
      e.stopPropagation();
      var nEl = document.getElementById('newStudio');
      var nm2 = nEl ? nEl.value.trim() : '';
      if (!nm2) { setAcctMsg(T.get('nameNeeded'), true); return; }
      LOSCloud.createStudio(nm2)
        .then(function () { setAcctMsg(T.get('studioMade')); loadStudio(); })
        ['catch'](function () { setAcctMsg(T.get('syncFailed'), true); });
      return;
    }

    if (el.closest('[data-makeboss]')) {
      e.stopPropagation();
      var bEl = document.getElementById('bossEmail');
      var addr2 = bEl ? bEl.value.trim() : '';
      if (addr2.indexOf('@') < 1 || addr2.indexOf('.') < 0) {
        setAcctMsg(T.get('inviteBad'), true);
        return;
      }
      LOSCloud.inviteAdmin(pfPicked, addr2)
        .then(function () { setAcctMsg(T.get('bossInvited')); loadStudio(); })
        ['catch'](function () { setAcctMsg(T.get('syncFailed'), true); });
      return;
    }

    var wsBtn = el.closest('[data-ws]');
    if (wsBtn) {
      e.stopPropagation();
      LOSCloud.setActiveWorkspace(wsBtn.getAttribute('data-ws'));
      wsRoster = []; wsInvites = [];
      renderAcct();
      loadStudio();
      syncNow();
      return;
    }

    if (el.closest('[data-invite]')) {
      e.stopPropagation();
      var iEl = document.getElementById('inviteEmail');
      var addr = iEl ? iEl.value.trim() : '';
      if (addr.indexOf('@') < 1 || addr.indexOf('.') < 0) {
        setAcctMsg(T.get('inviteBad'), true);
        return;
      }
      var ws0 = LOSCloud.activeWorkspace();
      LOSCloud.invite(ws0 ? ws0.id : '', addr)
        .then(function () { setAcctMsg(T.get('inviteSent')); loadStudio(); })
        ['catch'](function () { setAcctMsg(T.get('syncFailed'), true); });
      return;
    }

    var undo = el.closest('[data-uninvite]');
    if (undo) {
      e.stopPropagation();
      var ws1 = LOSCloud.activeWorkspace();
      LOSCloud.uninvite(ws1 ? ws1.id : '', undo.getAttribute('data-uninvite'))
        .then(function () { loadStudio(); })['catch'](function () {});
      return;
    }

    if (el.closest('[data-savename]')) {
      e.stopPropagation();
      var nmEl = document.getElementById('acctName');
      var newName = nmEl ? nmEl.value.trim() : '';
      if (!newName) { setAcctMsg(T.get('nameNeeded'), true); return; }
      LOSCloud.setDisplayName(newName)
        .then(function () {
          /* Collapses on save. The panel opened to ask one question; once it is
           * answered, leaving it open just covers the list. */
          acctOpen = false;
          setAcctMsg('');
          render();
        })
        ['catch'](function () { setAcctMsg(T.get('syncFailed'), true); });
      return;
    }

    if (el.closest('[data-signout]')) {
      e.stopPropagation();
      LOSCloud.signOut();
      acctOpen = false;
      /* Local data is deliberately left alone. It is theirs, it is what the app
       * runs on, and signing out must never be a way to lose a thought. */
      render();
      return;
    }

    // re-file: tap a hat to move the thought to the next one
    var cycle = el.closest('[data-cycle]');
    if (cycle) {
      e.stopPropagation();
      var t = find(cycle.getAttribute('data-cycle'));
      if (!t) return;
      var ids = state.roles.map(function (r) { return r.id; });
      ids.push('');                       // one step past the last hat = no hat
      t.role = ids[(ids.indexOf(t.role) + 1) % ids.length];
      // The hat decides who reads it, so the two move together or not at all.
      t.scope = LOSModel.scopeFor(t.role);
      touch(t);
      persist();
      render();
      return;
    }

    var titleEl = el.closest('[data-edit]');
    if (titleEl) {
      e.stopPropagation();
      editingText = titleEl.getAttribute('data-edit');
      render();
      focusEditor();
      return;
    }

    var delBtn = el.closest('[data-del]');
    if (delBtn) {
      e.stopPropagation();
      removeTask(delBtn.getAttribute('data-del'));
      return;
    }

    var dateBtn = el.closest('[data-date]');
    if (dateBtn) {
      e.stopPropagation();
      editDate(dateBtn.getAttribute('data-date'));
      return;
    }

    var timeBtn = el.closest('[data-time]');
    if (timeBtn) {
      e.stopPropagation();
      editTime(timeBtn.getAttribute('data-time'));
      return;
    }

    var chk = el.closest('[data-check]');
    if (chk) {
      var host = chk.closest('[data-id]');
      if (!host) return;
      var task = find(host.getAttribute('data-id'));
      if (!task) return;
      task.done = !task.done;
      touch(task);
      persist();
      render();
      return;
    }

    var lensBtn = el.closest('[data-role]');
    if (lensBtn && lensEl.contains(lensBtn)) {
      lens = lensBtn.getAttribute('data-role');
      stage.classList.remove('is-clear');
      firstRender = true;    // switching hats should not animate into Silence
      render();
    }
  }

  function find(id) {
    return state.tasks.filter(function (x) { return x.id === id; })[0];
  }

  // ---- time wheel -----------------------------------------------------------
  /* Twelve-hour clock with 上午 / 下午, because that is how the time gets said
   * out loud. 'HH:MM' in 24-hour form is still what gets STORED — display
   * conventions do not belong in the data.
   *
   * All three columns wrap: past 55 comes 00, past 12 comes 1. A picker that
   * dead-ends at the bottom makes you scroll all the way back up to reach a
   * value that is one notch the other way.
   *
   * The wrap is done by rendering the list three times and silently jumping
   * back to the middle copy once a scroll settles. The alternative — hooking
   * scroll boundaries — fights the browser's own momentum and stutters.
   */
  var MIN_STEP = 5;
  var ROW = 46;   // must match .wheel-col button height in index.html
  var COPIES = 3;

  var AMPM = ['上午', '下午'];
  var HOURS = [];
  var MINS = [];
  for (var _h = 1; _h <= 12; _h++) HOURS.push(String(_h));
  for (var _m = 0; _m < 60; _m += MIN_STEP) MINS.push(('0' + _m).slice(-2));

  var chosen = '';        // time for the NEXT capture, '' = unspecified
  var chosenDate = '';    // date for the NEXT capture, '' = today
  var editing = null;     // task id being re-timed, or null when feeding capture
  var editingDate = null; // task id being re-dated
  var editingText = null; // task id whose wording is being changed
  var wheelTimer = null;
  var settling = false;   // true while WE are repositioning, so it isn't read as a user scroll

  function pad(n) { return ('0' + n).slice(-2); }

  /* 'HH:MM' (24h) <-> the three columns. Kept in one place so a display change
   * can never quietly become a data change. */
  function toParts(hhmm) {
    if (!hhmm) return null;
    var p = hhmm.split(':');
    var h = Number(p[0]);
    return {
      ampm: h < 12 ? AMPM[0] : AMPM[1],
      hour: String(h % 12 === 0 ? 12 : h % 12),
      min: p[1]
    };
  }

  function fromParts(ampm, hour, min) {
    var h = Number(hour) % 12;
    if (ampm === AMPM[1]) h += 12;
    return pad(h) + ':' + min;
  }

  var COLS = null;   // [{el, values}] filled by buildWheel

  function fillColumn(col, values) {
    col.textContent = '';
    for (var c = 0; c < COPIES; c++) {
      for (var i = 0; i < values.length; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-v', values[i]);
        b.textContent = values[i];
        col.appendChild(b);
      }
    }
  }

  function setColumn(col, values, value) {
    var i = values.indexOf(value);
    if (i < 0) i = 0;
    settling = true;
    // middle copy, so there is room to scroll either way before wrapping
    col.scrollTop = (values.length + i) * ROW;
    setTimeout(function () { settling = false; }, 0);
  }

  function readColumn(col, values) {
    var idx = Math.round(col.scrollTop / ROW);
    return values[((idx % values.length) + values.length) % values.length];
  }

  function buildWheel() {
    COLS = [
      { el: wheelAP, values: AMPM },
      { el: wheelH, values: HOURS },
      { el: wheelM, values: MINS }
    ];
    COLS.forEach(function (c) { fillColumn(c.el, c.values); });

    var now = new Date();
    var here = toParts(pad(now.getHours()) + ':'
      + pad(Math.floor(now.getMinutes() / MIN_STEP) * MIN_STEP));
    setColumn(wheelAP, AMPM, here.ampm);
    setColumn(wheelH, HOURS, here.hour);
    setColumn(wheelM, MINS, here.min);
    renderWheel();
  }

  function markColumn(col, values, value) {
    var btns = col.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-v') === value);
    }
  }

  function renderWheel() {
    /* Hidden in 待辦事項: anything given a time leaves the tab immediately, so
     * offering the wheel there is offering a way out of the page you chose. The
     * pending time is cleared FIRST — before the columns are drawn — or a hidden
     * picker would still be attaching a time to the next thought written. */
    var noTime = (lens === 'todo' && !editing);
    if (noTime && chosen) chosen = '';
    wheelEl.hidden = noTime;

    var p = toParts(chosen);
    markColumn(wheelAP, AMPM, p ? p.ampm : null);
    markColumn(wheelH, HOURS, p ? p.hour : null);
    markColumn(wheelM, MINS, p ? p.min : null);
    wheelClear.classList.toggle('on', !chosen);
    wheelClear.setAttribute('aria-pressed', String(!chosen));
    wheelEl.classList.toggle('editing', !!editing);
  }

  /* Whatever the three columns currently read is the time. No column is
   * "the one that was touched" — they are simply read together. */
  function pickFromColumns() {
    setChosen(fromParts(
      readColumn(wheelAP, AMPM),
      readColumn(wheelH, HOURS),
      readColumn(wheelM, MINS)
    ));
  }

  /* Deciding WHEN is what schedules a thought, so it leaves 待辦事項 and joins
   * the day. Never the other way round: clearing a time does not un-decide
   * something you decided to do.
   *
   * It turns on the act of choosing, not on the value that came out of it —
   * picking 「今天」 stores '' (because '' means today for every other row in the
   * app), which is indistinguishable from "no date". Keyed on the value, choosing
   * 今天 left the thought sitting in 待辦事項 looking as though the tap had done
   * nothing at all. */
  function schedule(t, chose) {
    if (t.section === S.TODO && (chose || t.at || t.on)) t.section = S.TODAY;
  }

  function setChosen(v) {
    if (editing) {
      var t = find(editing);
      if (t) { t.at = v; schedule(t); touch(t); persist(); }
      editing = null;
      chosen = '';
      render();
      return;
    }
    chosen = v;
    renderWheel();
  }

  function onWheelClick(e) {
    var b = e.target.closest && e.target.closest('[data-v]');
    if (!b || !wheelEl.contains(b)) return;
    for (var i = 0; i < COLS.length; i++) {
      if (COLS[i].el.contains(b)) {
        setColumn(COLS[i].el, COLS[i].values, b.getAttribute('data-v'));
        break;
      }
    }
    pickFromColumns();
  }

  /* After a scroll settles: read the value, then slide back to the middle copy
   * showing the same value. The jump is invisible because the row under the
   * band does not change. */
  function recentre(col, values) {
    var v = readColumn(col, values);
    var i = values.indexOf(v);
    var want = (values.length + i) * ROW;
    if (Math.abs(col.scrollTop - want) > ROW / 2) {
      settling = true;
      col.scrollTop = want;
      setTimeout(function () { settling = false; }, 0);
    }
  }

  function onWheelScroll(e) {
    if (settling) return;
    var col = e.target;
    if (!COLS || !COLS.some(function (c) { return c.el === col; })) return;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function () {
      pickFromColumns();
      COLS.forEach(function (c) { recentre(c.el, c.values); });
    }, 140);
  }

  function onWheelClear() {
    if (editing) { setChosen(''); return; }
    chosen = '';
    renderWheel();
  }

  /* Tapping a time on a row aims the same wheel at that thought. One control
   * for both jobs; nothing new appears on screen. */
  function editTime(id) {
    var t = find(id);
    if (!t) return;
    editing = id;
    chosen = t.at || '';
    var p = toParts(t.at);
    if (p) {
      setColumn(wheelAP, AMPM, p.ampm);
      setColumn(wheelH, HOURS, p.hour);
      setColumn(wheelM, MINS, p.min);
    }
    renderWheel();
    if (wheelEl.scrollIntoView) wheelEl.scrollIntoView({ block: 'nearest' });
  }


  // ---- date strip -----------------------------------------------------------
  /* Two weeks ahead is as far as a thought realistically gets scheduled here;
   * anything further belongs in a calendar, not in a capture tool. */
  var DATE_DAYS = 14;

  function buildDateStrip() {
    dateStripEl.textContent = '';
    for (var i = 0; i <= DATE_DAYS; i++) {
      var d = addDays(i);
      var key = ymd(d);
      var b = document.createElement('button');
      b.type = 'button';
      // Today is the default, and the default is stored as '' — so the chip for
      // today carries the empty value, not today's date.
      b.setAttribute('data-on', i === 0 ? '' : key);
      b.textContent = i === 0 ? T.get('today2')
                   : i === 1 ? T.get('tomorrow')
                   : T.get('dateFmt', { m: d.getMonth() + 1, d: d.getDate() });
      dateStripEl.appendChild(b);
    }
    renderDateStrip();
  }

  function renderDateStrip() {
    var btns = dateStripEl.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-on') === chosenDate;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-pressed', String(on));
    }
    dateStripEl.classList.toggle('editing', !!editingDate);
  }

  function onDateStripClick(e) {
    var b = e.target.closest && e.target.closest('[data-on]');
    if (!b || !dateStripEl.contains(b)) return;
    var v = b.getAttribute('data-on');

    if (editingDate) {
      var t = find(editingDate);
      if (t) { t.on = v; schedule(t, true); touch(t); persist(); }
      editingDate = null;
      chosenDate = '';
      render();
      return;
    }
    chosenDate = v;
    renderDateStrip();
  }

  function editDate(id) {
    var t = find(id);
    if (!t) return;
    editingDate = id;
    chosenDate = t.on || '';
    renderDateStrip();
    if (dateStripEl.scrollIntoView) dateStripEl.scrollIntoView({ block: 'nearest' });
  }


  /* Writes to the phone's OWN calendar — iPhone's built-in Calendar, whichever
   * account it defaults to — by handing it a .ics file. iOS opens its "Add
   * Event" sheet with everything filled in and you press add.
   *
   * Why a file and not an API: Apple publishes no web API for the built-in
   * calendar. .ics is the only door, and it is a good one — no login, no client
   * ID, no consent screen, no network, works offline, and it is the same
   * mechanism every airline and cinema booking uses. It also works on Android.
   *
   * Note this is WRITE only. Reading the iPhone's calendar from a web page is
   * not possible at all — see the note in gcal.js. */
  function icsEscape(s) {
    return String(s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function icsStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
         + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  function vevent(t) {
    var key = t.on || todayKey();
    var y = Number(key.slice(0, 4)), mo = Number(key.slice(5, 7)) - 1, da = Number(key.slice(8, 10));
    var lines = [
      'BEGIN:VEVENT',
      // Stable UID + rising SEQUENCE is what makes a second export an UPDATE of
      // the same event rather than a duplicate sitting next to it.
      'UID:' + t.id + '@life-os',
      'SEQUENCE:' + (Number(t.seq) || 0),
      'DTSTAMP:' + icsStamp(new Date())
    ];

    if (t.at) {
      var p = t.at.split(':');
      var start = new Date(y, mo, da, Number(p[0]), Number(p[1]));
      var end = new Date(start.getTime() + 3600000);
      // Floating local time: no timezone, so it shows at the hour you wrote,
      // wherever the phone happens to be.
      lines.push('DTSTART:' + icsStamp(start));
      lines.push('DTEND:' + icsStamp(end));
    } else {
      // All-day events are half-open — the end date is the following day.
      var next = new Date(y, mo, da + 1);
      lines.push('DTSTART;VALUE=DATE:' + key.replace(/-/g, ''));
      lines.push('DTEND;VALUE=DATE:' + next.getFullYear()
        + pad(next.getMonth() + 1) + pad(next.getDate()));
    }

    lines.push('SUMMARY:' + icsEscape(t.title));
    lines.push('END:VEVENT');
    return lines;
  }

  /* One file, however many events. Adding a week one row at a time is a chore
   * nobody does twice. */
  function buildIcs(tasks) {
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life OS//TW',
                 'CALSCALE:GREGORIAN'];
    tasks.forEach(function (t) { lines = lines.concat(vevent(t)); });
    lines.push('END:VCALENDAR');
    // RFC 5545 requires CRLF; iOS is strict about it.
    return lines.join('\r\n') + '\r\n';
  }

  function downloadIcs(tasks, name) {
    if (!tasks.length) return;
    /* Bump every exported event's revision BEFORE writing the file, so a later
     * export is unambiguously newer and the calendar replaces the old entry
     * instead of leaving two. */
    tasks.forEach(function (t) { t.seq = (Number(t.seq) || 0) + 1; touch(t); });
    persist();

    var blob = new Blob([buildIcs(tasks)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  /* Sits at the top of 未來一周規劃, because that is the moment you are looking
   * at the week you are about to commit to. */
  /* Lives in the card header, so it is reachable from any tab. The set it
   * exports does NOT depend on which tab you are on — always the open items
   * dated within the next week — because a button that exports something
   * different depending on where you tapped it is a button you cannot trust. */
  function renderBulkCal() {
    var box = document.getElementById('bulkCal');
    box.textContent = '';

    var items = state.tasks.filter(function (t) {
      return !t.done && withinWeek(t);
    });

    /* Always present, even at zero. A control that comes and goes has to be
     * re-found every time, and its absence reads as "broken" rather than
     * "nothing to send". Disabled at zero says the same thing without moving. */
    var btn = document.createElement('button');
    btn.disabled = items.length === 0;
    btn.className = 'bulk-btn';
    btn.type = 'button';
    btn.title = T.get('bulkCal', { n: items.length });
    btn.setAttribute('aria-label', btn.title);
    btn.appendChild(document.createTextNode(T.get('calShort')));
    var n = document.createElement('span');
    n.className = 'n';
    n.textContent = items.length;
    btn.appendChild(n);
    btn.addEventListener('click', function () {
      if (!items.length) return;
      downloadIcs(items, 'life-os-week.ics');
      render();
    });
    box.appendChild(btn);
  }

  function focusEditor() {
    var f = document.querySelector('[data-edit-field]');
    if (!f) return;
    f.focus();
    try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {}
  }

  function removeTask(id) {
    delArmed = null;
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    /* A deleted row cannot carry the news of its own deletion, so it leaves a
     * marker behind. Without one, the next sync — never having heard the row
     * went — helpfully puts it back. */
    state.graves = (state.graves || []).concat([{ id: id, at: Date.now(), pushed: false }]);
    editingText = null;
    persist();
    render();
  }

  /* Saving an empty title deletes the thought. Wiping the words IS the
   * intention to be rid of it, and a nameless row helps nobody. */
  function commitEdit(save) {
    if (!editingText) return;
    var f = document.querySelector('[data-edit-field]');
    var id = editingText;
    editingText = null;

    if (save && f) {
      var v = f.value.trim();
      if (!v) { removeTask(id); return; }
      var t = find(id);
      if (t && t.title !== v) { t.title = v; touch(t); persist(); }
    }
    render();
  }

  function onEditKey(e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-edit-field')) return;
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(true); }
    else if (e.key === 'Escape') { commitEdit(false); }
  }

  // Tapping away keeps the change: on a phone, losing an edit to a stray tap is
  // the worst possible outcome for a tool built to not lose things.
  function onEditBlur(e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute('data-edit-field')) return;
    setTimeout(function () { commitEdit(true); }, 0);
  }

  function onLaterToggle() { laterEl.classList.toggle('open'); }

  /* True for a moment after touching the date strip, the wheel or the tabs.
   *
   * The keyboard's ✓ blurs the field, and so does tapping a date chip — the
   * blur event alone cannot tell them apart, and on iOS a tapped button often
   * does not take focus, so relatedTarget is null either way. Watching for the
   * touch that caused the blur can. Without this, typing and then reaching for
   * a time would file the thought before the time was chosen. */
  var pickerTouch = false;
  function markPicker() {
    pickerTouch = true;
    setTimeout(function () { pickerTouch = false; }, 500);
  }

  /* Capture, wearing whichever hat you currently have on. Where it lands is
   * decided by model.js: a time or a date means 今天, nothing means 待辦事項.
   * The hat also decides who can read it — 工作 is the company's, everything
   * else is yours — and capture never stops to ask about either. */
  /* Which hat a new thought wears. The 公司/個人 switch wins over the tab, because
   * it is the answer to a bigger question — who may read this — and the two can
   * disagree: standing on the 工作 tab with the switch on 個人 must not produce a
   * row the whole studio can read. Visibility stays derived from the hat
   * (ADR-0008), so 公司 means the 工作 hat and nothing else does. */
  function hatForNew() {
    var sc = scopeNow();
    if (sc === 'company') return 'work';
    var hat = (lens === ALL || isView(lens)) ? '' : lens;
    if (sc === 'private' && LOSModel.scopeFor(hat) === SC.COMPANY) return '';
    return hat;
  }

  function commitCapture() {
    // Closed under 全部: a thought there has no side to belong to. The field is
    // disabled too, so this is a backstop rather than the only guard.
    if (!canCapture()) return;
    var v = input.value.trim();
    if (!v) return;
    var ws = (window.LOSCloud && LOSCloud.signedIn() && LOSCloud.activeWorkspace())
      ? LOSCloud.activeWorkspace().id : '';
    state.tasks.push(LOSModel.createTask({
      title: v,
      role: hatForNew(),
      // A 公司 thought joins the studio you are standing in; a private one
      // joins nothing, because it belongs to a person.
      workspaceId: ws,
      at: chosen,
      on: chosenDate
    }));
    // Resets after each capture: a time belongs to one thought, and silently
    // inheriting it would put the wrong time on the next one.
    chosen = '';
    chosenDate = '';
    editing = null;
    editingDate = null;
    renderWheel();
    renderDateStrip();
    isFirstRun = false;
    persist();
    input.value = '';
    render();
  }

  /* Enter on a hardware keyboard, ✓ on the iOS keyboard, or the + beside the
   * field. Three ways in, because the one that exists is never the one the
   * person reaches for. */
  function onCaptureKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commitCapture();
    input.focus(); // stay ready for the next thought (validated speed fix)
  }

  // The ✓ that dismisses the keyboard should file the thought, not discard it.
  function onCaptureBlur() {
    if (pickerTouch) return;
    commitCapture();
  }

  function bindEvents() {
    document.addEventListener('click', onClick);
    document.getElementById('laterToggle').addEventListener('click', onLaterToggle);
    input.addEventListener('keydown', onCaptureKey);
    input.addEventListener('blur', onCaptureBlur);
    plusBtn.addEventListener('click', function () { commitCapture(); });
    // Reaching for 編輯 must not file the half-typed thought in the field, for
    // the same reason reaching for a tab does not.
    [dateStripEl, wheelEl, lensEl, editBtn].forEach(function (el) {
      el.addEventListener('pointerdown', markPicker);
      el.addEventListener('touchstart', markPicker);
    });
    document.addEventListener('keydown', onEditKey);
    document.addEventListener('focusout', onEditBlur);
    wheelEl.addEventListener('click', onWheelClick);
    wheelClear.addEventListener('click', onWheelClear);
    wheelAP.addEventListener('scroll', onWheelScroll);
    wheelH.addEventListener('scroll', onWheelScroll);
    wheelM.addEventListener('scroll', onWheelScroll);
    dateStripEl.addEventListener('click', onDateStripClick);
    window.addEventListener('resize', renderLens);
  }

  /* ?debug=1 — a plain readout of the calendar's actual state.
   *
   * Four rounds of "還是沒有連結" produced no usable signal, because everything
   * that failed, failed quietly and off-screen. This exists so the answer can
   * be photographed instead of guessed at. It shows no token value, only
   * whether one exists. */
  function renderDebug() {
    var on = false;
    try { on = new URLSearchParams(window.location.search).get('debug') === '1'; } catch (e) {}
    if (!on || !window.LOSCal) return;

    var rows = [
      ['build', document.getElementById('build').textContent],
      ['網址', window.location.origin + window.location.pathname],
      ['獨立視窗', (window.navigator.standalone === true
        || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) ? 'yes' : 'no'],
      ['client id 有設定', LOSCal.configured() ? 'yes' : 'no'],
      ['曾經連結過', LOSCal.linked() ? 'yes' : 'no'],
      ['目前有有效 token', LOSCal.connected() ? 'yes' : 'no'],
      ['最後失敗原因', LOSCal.lastError() || '(無)'],
      ['網址片段', window.location.hash ? '有東西' : '(空)']
    ];

    var box = document.createElement('div');
    box.id = 'debugBox';
    box.style.cssText = 'margin-top:20px;padding:12px 14px;border:1px dashed var(--line);'
      + 'border-radius:10px;font-size:11.5px;line-height:1.9;color:var(--text-2);'
      + 'font-family:ui-monospace,Consolas,monospace;';
    rows.forEach(function (r) {
      var line = document.createElement('div');
      line.textContent = r[0] + ': ' + r[1];
      box.appendChild(line);
    });
    stage.insertBefore(box, document.getElementById('build'));
  }

  // ---- boot -----------------------------------------------------------------
  T.apply(document);

  /* Returning from a sign-in: the token is in the URL fragment. Absorb and
   * scrub it before first paint so it never lingers in the address bar.
   *
   * LOSCloud MUST go first. Both flows come back with access_token in the
   * fragment, and LOSCal wipes the fragment before checking whether the response
   * was even meant for it — so the other order silently eats the studio session.
   * LOSCloud leaves the fragment untouched when it is not its own. */
  if (window.LOSCloud) LOSCloud.absorbRedirect();
  if (window.LOSCal) LOSCal.absorbRedirect();

  LOSStorage.load().then(function (loaded) {
    state = loaded;
    isFirstRun = !!loaded.isFirstRun;
    if (!state.roles || !state.roles.length) state.roles = LOSModel.DEFAULT_ROLES.slice();

    // Write an upgraded shape straight back, so the migration happens once
    // rather than on every single load.
    if (loaded.didMigrate) persist();

    // A thought shared in from another app enters by the same door as one typed
    // into the capture field — including where it lands: nothing arrives with a
    // time on it, so it waits in 待辦事項. See share.js — transport only.
    var shared = window.LOSShare && LOSShare.take();
    if (shared) {
      state.tasks.push(LOSModel.createTask({ title: shared }));
      isFirstRun = false;
      persist();
    }

    rollOverStale();

    buildLens();
    buildScopeSwitch();
    buildWheel();
    buildDateStrip();
    bindEvents();
    render();
    loadSchedule();
    renderDebug();

    /* Pull the studio's list once the local one is already on screen — never
     * before. The person sees their own thoughts immediately whether or not
     * there is signal, and the shared rows arrive when they arrive. */
    syncNow();
  });

  /* Coming back to the app is the moment its answer is most likely to be stale:
   * a colleague has had all morning to add something. Cheap, and skipped
   * entirely when signed out. */
  window.addEventListener('focus', function () {
    // The day can turn while the app sits open overnight.
    if (rollOverStale()) render();
    syncNow();
  });
})();
