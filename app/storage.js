/* Life OS — storage layer (the persistence seam).
 *
 * This is the ONLY file that knows how or where data is stored. Everything
 * above it (app.js) talks to this API and nothing else. To move from
 * localStorage to SQLite / CloudKit / Supabase, rewrite the bodies of the four
 * functions below — the application does not change.
 *
 * The API is intentionally ASYNC (Promise-based) even though localStorage is
 * synchronous: the future backends are networked and async, so committing to
 * Promises now means the app never has to change its call sites later.
 *
 * Contract:
 *   load()        -> Promise<State>   always resolves to a valid, migrated State
 *                                     plus `isFirstRun`: true when nothing has
 *                                     ever been stored. Not persisted — it is a
 *                                     fact about storage, and only storage can
 *                                     tell "never used" from "emptied".
 *   save(state)   -> Promise<void>
 *   clear()       -> Promise<void>
 *   migrate(data) -> State            pure; upgrades any older/unknown shape
 *   State = { version: number, tasks: Task[], roles: Role[], graves: Grave[] }
 *   Grave = { id, at, pushed }  — a deleted task, kept so the deletion can sync
 * The Task shape itself is owned by model.js (LOSModel) — not defined here.
 */
window.LOSStorage = (function () {
  var KEY = 'los_app_v1';
  var VERSION = 5;

  function empty() {
    return {
      version: VERSION, tasks: [], roles: LOSModel.DEFAULT_ROLES.slice(), graves: [],
      scope: 'all'
    };
  }

  /* Tombstones. A deletion has to be able to travel, and a deleted row cannot
   * carry the news of its own deletion. Without these, the next sync — never
   * having heard that the row went — helpfully puts it back.
   *
   * They are pruned after a week: long enough for a phone that spent the weekend
   * in a drawer, short enough that the list cannot grow forever. */
  var GRAVE_TTL = 7 * 86400000;

  function normalizeGraves(raw) {
    var now = Date.now();
    return (Array.isArray(raw) ? raw : [])
      .filter(function (g) { return g && g.id && (now - (g.at || 0)) < GRAVE_TTL; })
      .map(function (g) { return { id: String(g.id), at: g.at || now, pushed: !!g.pushed }; });
  }

  // Pure. Brings any prior/unknown persisted shape up to the current version.
  // Future upgrades add branches here (e.g. if (v < 2) { ...reshape... }).
  function migrate(data) {
    if (!data || typeof data !== 'object') return empty();
    var raw = Array.isArray(data.tasks) ? data.tasks : [];
    var tasks = raw.map(LOSModel.normalizeTask).filter(Boolean);

    // v1 -> v2: identities arrive. Existing tasks keep role '' and stay visible
    // under "All", so nothing a v1 user wrote can go missing behind a hat.
    var roles = (Array.isArray(data.roles) ? data.roles : [])
      .map(LOSModel.normalizeRole).filter(Boolean);
    if (!roles.length) roles = LOSModel.DEFAULT_ROLES.slice();

    /* v2 -> v3: the hats were renamed (現場/生意/家裡 -> 工作/家庭). Roles live in
     * the user's own data, so changing DEFAULT_ROLES did nothing for anyone who
     * had already used the app — they kept seeing the old names. Remap here, and
     * remap the tasks with them, or every thought would be orphaned behind a hat
     * that no longer exists. */
    var RENAMED = { site: 'work', biz: 'work', home: 'home' };
    var stale = roles.some(function (r) { return RENAMED[r.id] && r.id !== RENAMED[r.id]; });
    if (stale) {
      tasks = tasks.map(function (t) {
        if (RENAMED[t.role] && t.role !== RENAMED[t.role]) t.role = RENAMED[t.role];
        return t;
      });
      roles = LOSModel.DEFAULT_ROLES.slice();
    }

    /* v3 -> v4: 待辦事項 becomes a real section instead of a computed list, so
     * 今天 can go back to meaning "what I actually planned for today". Anything
     * sitting in 今天 with no time and no date was never scheduled — that is
     * precisely what the new section is for, so move it there.
     *
     * Nothing is deleted and nothing leaves the 全部 page: the thought is one
     * section further down the same screen, and giving it a time moves it back
     * up. Items with a time or a date are left exactly where they are. */
    if (!data.version || data.version < 4) {
      tasks.forEach(function (t) {
        if (t.section === LOSModel.SECTIONS.TODAY && !t.at && !t.on) {
          t.section = LOSModel.SECTIONS.TODO;
        }
      });
    }

    /* v4 -> v5: sync fields arrive. Everything already on this device is the
     * person's own work, so it is marked dirty and will upload the first time
     * they sign in — nothing written before the studio existed gets left behind
     * on one phone. ownerId stays '' until then, which reads as "mine". */
    if (!data.version || data.version < 5) {
      tasks.forEach(function (t) { t.dirty = true; });
    }

    /* Which half of the world the person was last looking at. Persisted, unlike
      * the hat lens, for one reason: 全部 cannot be written to, so if it were the
      * default every launch would begin in a state where a thought cannot be
      * captured — and thoughts arrive in lifts. Their own last choice is never a
      * trap; a default that blocks writing would be.
      *
      * The default itself is 'all', not a writable side: any other choice would
      * HIDE something on a first launch — 個人 hides every 工作 row, 公司 hides
      * every 家庭 row — and hiding a person's own thoughts is worse than asking
      * them to pick a side before writing the first one. */
    var scope = ['all', 'company', 'private'].indexOf(data.scope) !== -1
      ? data.scope : 'all';

    return {
      version: VERSION,
      tasks: tasks,
      roles: roles,
      graves: normalizeGraves(data.graves),
      scope: scope,
      /* Whether this device has already asked for the studio name. Asked once,
       * right after signing in, because a name nobody is prompted for is a name
       * nobody sets — and then a shared list shows Google account names and email
       * prefixes, which is the opposite of knowing who is doing what.
       * Per-device rather than per-account, deliberately: being asked again on a
       * second phone costs one tap, and a server column costs a migration. */
      nameAsked: !!data.nameAsked
    };
  }

  function load() {
    return new Promise(function (resolve) {
      var data = null, stored = null;
      try {
        stored = localStorage.getItem(KEY);
        if (stored) data = JSON.parse(stored);
      } catch (e) { data = null; }
      var state = migrate(data);
      state.isFirstRun = !stored;
      /* Whether the shape on disk was older than the shape we just returned.
       * Without writing the result back, a migration is re-done on every load
       * and the stored data never actually improves — so the app persists when
       * this is set. */
      state.didMigrate = !!stored && (!data || data.version !== VERSION);
      resolve(state);
    });
  }

  function save(state) {
    return new Promise(function (resolve) {
      try {
        localStorage.setItem(KEY, JSON.stringify({
          version: VERSION,
          tasks: (state && state.tasks) || [],
          roles: (state && state.roles) || LOSModel.DEFAULT_ROLES.slice(),
          graves: normalizeGraves(state && state.graves),
          scope: (state && state.scope) || 'all',
          nameAsked: !!(state && state.nameAsked)
        }));
      } catch (e) { /* quota / privacy mode — fail soft */ }
      resolve();
    });
  }

  function clear() {
    return new Promise(function (resolve) {
      try { localStorage.removeItem(KEY); } catch (e) {}
      resolve();
    });
  }

  return { load: load, save: save, clear: clear, migrate: migrate, VERSION: VERSION };
})();
