/* Life OS — share intake (transport only).
 *
 * Android registers this app as a system share target (see manifest.webmanifest).
 * Sharing text from any app — Claude, ChatGPT, a browser, Messages — opens
 * Life OS at `./?title=…&text=…&url=…`.
 *
 * This file is a DOOR, not a new interaction. What arrives here produces exactly
 * what typing into the capture field produces: one task in Today, nothing else.
 * It invents no product behaviour, so it needs no prototype change. If it ever
 * wants to do more than that — tag it, route it elsewhere, ask a question —
 * stop and go to ../prototype/ first (see README.md).
 */
window.LOSShare = (function () {
  'use strict';

  // Longest-first so a shared article gives us its text, not just its title.
  var FIELDS = ['text', 'title', 'url'];

  function readParams() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return null;
    }
  }

  // Some apps share "title\nurl" or repeat the url inside text — don't store it twice.
  function combine(parts) {
    var out = [];
    parts.forEach(function (p) {
      if (!p) return;
      p = p.trim();
      if (!p) return;
      var dup = out.some(function (q) { return q.indexOf(p) !== -1 || p.indexOf(q) !== -1; });
      if (!dup) out.push(p);
    });
    return out.join(' — ');
  }

  return {
    /* Returns the shared text once, then clears it from the address bar so a
     * refresh (or the app being resumed from the launcher) can't duplicate it. */
    take: function () {
      var q = readParams();
      if (!q) return null;

      var values = FIELDS.map(function (f) { return q.get(f); });
      if (!values.some(Boolean)) return null;

      var text = combine(values);

      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      return text || null;
    }
  };
})();
