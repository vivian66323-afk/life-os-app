/* Life OS — Google Calendar (read-only).
 *
 * WHAT THIS IS FOR, and what it deliberately is not.
 *
 * Your calendar is not a task list, and events must never become tasks here.
 * README.md §1: this product exists so thoughts don't vanish — a calendar is
 * *context* for when thoughts happen (before a meeting, driving to a site),
 * not more things to tick off. So events are rendered read-only, in their own
 * band, with no checkbox and no way to complete them.
 *
 * WHY A FULL-PAGE REDIRECT, NOT A POPUP.
 *
 * The first attempt used Google Identity Services, whose token client opens a
 * popup. On an iPhone — installed to the home screen, or in any in-app browser
 * — that popup produced a bare "400. That's an error. The server cannot
 * process the request because it is malformed." The OAuth client was correct
 * the whole time; the popup context was the problem.
 *
 * So: no popup and no third-party script. The whole page navigates to Google
 * and Google navigates back with the token in the URL fragment. A fragment is
 * never sent to a server — not to GitHub Pages, not to anyone — so the token
 * stays on the device. This works in Safari, in a home-screen app, and in
 * every in-app browser, because a redirect is the one thing they all do.
 *
 * The cost: it needs an Authorised redirect URI registered in the Google
 * console, which the popup flow did not. That is the trade, and it is worth it.
 *
 * Read-only, always: the scope is calendar.readonly. This code cannot create,
 * move or delete anything even if it were told to.
 *
 * Dormant unless configured, and silent on every failure — an unreachable
 * calendar must never stop you writing a thought down.
 */
window.LOSCal = (function () {
  'use strict';

  var SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
  var AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
  var TOKEN_KEY = 'los_gcal_token';
  var STATE_KEY = 'los_gcal_state';
  var LINKED_KEY = 'los_gcal_linked';

  var token = null;
  /* Why the last attempt failed, so the app can say so instead of doing
   * nothing. Guessing at this from the outside has already cost enough. */
  var lastError = null;
  var lastFetchError = null;

  function clientId() {
    return (window.LOSConfig && window.LOSConfig.googleClientId) || '';
  }

  function configured() { return !!clientId(); }

  /* Must match an Authorised redirect URI in the Google console exactly.
   * Built from where the app actually is, so /go/ and /app/ each work as long
   * as both are registered — no hard-coded URL to drift out of date. */
  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  /* localStorage, deliberately, after starting with sessionStorage.
   *
   * A Google implicit-flow token expires in an hour no matter where it is kept,
   * so sessionStorage bought almost no safety — but it did mean the token died
   * every time the app was closed, which on a phone is constantly. The result
   * was reconnecting on every single launch. The expiry is the real limit here;
   * surviving a relaunch inside that hour is worth having. It is still cleared
   * the moment Google rejects it, and on disconnect. */
  function loadToken() {
    try {
      var raw = localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      var t = JSON.parse(raw);
      return t && t.expiresAt > Date.now() + 30000 ? t : null;
    } catch (e) { return null; }
  }

  function storeToken(t) {
    token = t;
    try {
      if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode — memory only */ }
  }

  /* Whether this device has ever completed a connection. Until it has, nothing
   * Google-related is loaded or requested: a feature you have not asked for
   * should cost you nothing. */
  function linked() {
    try { return localStorage.getItem(LINKED_KEY) === '1'; } catch (e) { return false; }
  }

  function setLinked(on) {
    try {
      if (on) localStorage.setItem(LINKED_KEY, '1');
      else localStorage.removeItem(LINKED_KEY);
    } catch (e) {}
  }

  function nonce() {
    try {
      var a = new Uint8Array(16);
      window.crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    } catch (e) {
      return String(Date.now()) + Math.random().toString(36).slice(2);
    }
  }

  /* Reads the token Google left in the URL fragment on the way back, then
   * scrubs the fragment so the credential is not left sitting in the address
   * bar, in history, or in whatever the next screenshot captures. */
  function absorbRedirect() {
    var hash = window.location.hash || '';
    if (hash.indexOf('access_token') === -1 && hash.indexOf('error') === -1) return false;

    var p = new URLSearchParams(hash.replace(/^#/, ''));
    /* localStorage, not sessionStorage. On iOS, leaving an installed app for
     * accounts.google.com and coming back can land in a different browsing
     * context, where sessionStorage is empty — the nonce vanished, the check
     * failed, and a perfectly good token was thrown away. It is still
     * single-use and deleted the moment it is read. */
    var expected = null;
    try { expected = localStorage.getItem(STATE_KEY); } catch (e) {}
    try { localStorage.removeItem(STATE_KEY); } catch (e) {}

    var clean = window.location.pathname + window.location.search;
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', clean);
    }

    // A mismatched state means this response was not asked for by this page.
    if (p.get('error')) { lastError = p.get('error'); return false; }
    if (!expected) { lastError = 'state-lost'; return false; }
    if (p.get('state') !== expected) { lastError = 'state-mismatch'; return false; }

    var access = p.get('access_token');
    if (!access) { lastError = 'no-token'; return false; }

    storeToken({
      value: access,
      expiresAt: Date.now() + (Number(p.get('expires_in') || 3600) - 60) * 1000
    });
    setLinked(true);
    return true;
  }

  /* Leaves the app. Google brings it back with the token in the fragment. */
  function connect() {
    if (!configured()) return;
    var state = nonce();
    try { localStorage.setItem(STATE_KEY, state); } catch (e) {}

    var url = AUTH
      + '?client_id=' + encodeURIComponent(clientId())
      + '&redirect_uri=' + encodeURIComponent(redirectUri())
      + '&response_type=token'
      + '&scope=' + encodeURIComponent(SCOPE)
      + '&state=' + encodeURIComponent(state)
      + '&include_granted_scopes=true'
      + '&prompt=consent';

    window.location.assign(url);
  }

  function dayBounds() {
    var s = new Date(); s.setHours(0, 0, 0, 0);
    var e = new Date(); e.setHours(23, 59, 59, 999);
    return { start: s.toISOString(), end: e.toISOString() };
  }

  function fetchCalendar(calId, role, access) {
    var b = dayBounds();
    var url = 'https://www.googleapis.com/calendar/v3/calendars/'
      + encodeURIComponent(calId) + '/events'
      + '?timeMin=' + encodeURIComponent(b.start)
      + '&timeMax=' + encodeURIComponent(b.end)
      + '&singleEvents=true&orderBy=startTime&maxResults=20';

    return fetch(url, { headers: { Authorization: 'Bearer ' + access } })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) { storeToken(null); throw new Error('unauthorized'); }
        if (!r.ok) throw new Error('http-' + r.status);
        return r.json();
      })
      .then(function (data) {
        return (data.items || [])
          .filter(function (ev) { return ev.status !== 'cancelled'; })
          .map(function (ev) {
            var dt = ev.start && (ev.start.dateTime || ev.start.date);
            return {
              id: ev.id,
              title: ev.summary || '(未命名)',
              at: dt ? new Date(dt) : null,
              allDay: !!(ev.start && !ev.start.dateTime),
              role: role || ''
            };
          });
      });
  }

  return {
    configured: configured,
    linked: linked,
    connect: connect,
    absorbRedirect: absorbRedirect,

    connected: function () { return !!(token || loadToken()); },
    lastError: function () { return lastError || lastFetchError; },

    disconnect: function () { storeToken(null); setLinked(false); },

    /* Today's events, or [] for every failure mode — offline, signed out, API
     * down, never linked. Never throws, never blocks. */
    today: function () {
      if (!configured()) return Promise.resolve([]);
      var t = token || loadToken();
      if (!t) return Promise.resolve([]);
      token = t;

      lastFetchError = null;
      var cals = (window.LOSConfig.calendars || []);
      if (!cals.length) cals = [{ id: 'primary', role: '' }];

      return Promise.all(cals.map(function (c) {
        return fetchCalendar(c.id, c.role, t.value)['catch'](function (e) {
          lastFetchError = (e && e.message) || 'fetch-failed';
          return [];
        });
      }))
        .then(function (lists) {
          var all = [];
          lists.forEach(function (l) { all = all.concat(l); });
          all.sort(function (a, b) {
            if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
            return (a.at ? a.at.getTime() : 0) - (b.at ? b.at.getTime() : 0);
          });
          return all;
        })
        ['catch'](function () { return []; });
    }
  };
})();
