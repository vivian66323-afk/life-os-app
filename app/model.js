/* Life OS — domain model (the single definition of a Task).
 *
 * One place owns the Task shape and the set of sections. Both the application
 * (app.js) and the storage layer (storage.js) build/normalize tasks through
 * here, so the shape and the section names can never drift or be mistyped.
 */
window.LOSModel = (function () {
  /* Where a thought sits — a question of WHEN, not of what it is about.
   *   one   — the one thing today
   *   today — scheduled: it has a time, a date, or you put it here on purpose
   *   todo  — captured but not scheduled yet. A real place since v4, not a
   *           computed list: everything used to land in `today`, which turned
   *           今天 into a dumping ground and buried what was actually planned.
   *   later — not this week's problem */
  var SECTIONS = { ONE: 'one', TODAY: 'today', TODO: 'todo', LATER: 'later' };

  /* Identities ("hats") — Level 2 / Professional. A role is DATA, not code:
   * the label is the user's word for that part of their life, and `cls` is the
   * slot it borrows its colour from in the frozen design system
   * (../prototype/styles.css defines exactly three: designer / owner / parent).
   * A task with role '' belongs to no hat and is only ever shown under "All". */
  var ROLE_SLOTS = ['designer', 'owner', 'parent'];

  var DEFAULT_ROLES = [
    { id: 'work', label: '工作', cls: 'designer' },
    { id: 'home', label: '家庭', cls: 'parent' }
  ];

  /* WHO CAN SEE IT, once a workspace holds more than one person.
   *
   *   company — everyone in the company sees it
   *   private — only the person who wrote it, ever
   *
   * Derived from the hat, never asked at capture. 工作 is the company's
   * business; everything else is yours. Capture speed is the entire product, so
   * this must never become a question at the moment a thought arrives — and a
   * privacy setting nobody remembers to set is worse than no setting at all.
   * To change it you change the hat, in 編輯 mode, deliberately.
   *
   * The value is STORED on the task even though it is derived, because the
   * shared backend's row-level read rule keys on this column. One function owns
   * the derivation, so a stale value cannot outlive a re-filing. */
  var SCOPES = { COMPANY: 'company', PRIVATE: 'private' };
  var COMPANY_ROLE = 'work';

  function scopeFor(role) {
    return role === COMPANY_ROLE ? SCOPES.COMPANY : SCOPES.PRIVATE;
  }

  /* Where a newly captured thought lands. Nothing is scheduled until the person
   * says so, and an unscheduled thought is exactly what 待辦事項 holds. */
  function sectionForNew(props) {
    return (props && (props.at || props.on)) ? SECTIONS.TODAY : SECTIONS.TODO;
  }

  /* Tabs that are not hats. A hat is a part of your life and a thought wears
   * exactly one; these two ask a different kind of question, so neither can be
   * assigned. Keeping them apart is what stops "工作" and "待辦事項" from
   * fighting over the same thought.
   *   todo — the 待辦事項 section on its own. Since v4 this is a real place a
   *          thought sits in, so the tab shows that place rather than computing
   *          "everything still open" (which repeated the whole list).
   *   week — anything dated in the next seven days. Genuinely computed. */
  var VIEWS = [
    { id: 'todo', label: '待辦事項' },
    { id: 'week', label: '未來一周規劃' }
  ];

  function normalizeRole(raw, i) {
    if (!raw || !raw.id) return null;
    return {
      id: String(raw.id),
      label: String(raw.label == null ? raw.id : raw.label),
      cls: ROLE_SLOTS.indexOf(raw.cls) !== -1 ? raw.cls : ROLE_SLOTS[i % ROLE_SLOTS.length]
    };
  }

  function uid() {
    return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* Sync bookkeeping. Owned by cloud.js; the rest of the app only ever calls
   * touch() and never reads `dirty`.
   *
   *   ownerId  — which account wrote it. '' until this device has signed in.
   *              A row whose ownerId is somebody else is READ-ONLY here: the
   *              database would refuse the write anyway, and a control that
   *              silently fails is worse than no control.
   *   dirty    — changed locally and not yet accepted by the server.
   *
   * Why a flag and not a timestamp comparison: deciding "whose version wins" by
   * comparing a phone's clock to the server's means a phone with a wrong clock
   * silently loses edits. `dirty` needs no clocks to agree — local changes are
   * pushed, untouched rows take the server's version, and the loser of a genuine
   * two-device conflict is whoever synced first. See ADR-0011.
   */
  function touch(t) {
    if (!t) return t;
    t.updatedAt = Date.now();
    t.dirty = true;
    return t;
  }

  // Create a fresh Task. This is the ONLY definition of a Task's shape.
  function createTask(props) {
    props = props || {};
    var role = props.role == null ? '' : String(props.role);
    return {
      id: props.id || uid(),
      title: String(props.title == null ? '' : props.title),
      meta: props.meta || '',
      section: props.section || sectionForNew(props),
      role: role,
      scope: scopeFor(role),
      // Optional wall-clock time, 'HH:MM'. '' means "sometime today" — which
      // stays the default, because forcing a time on every thought would make
      // capture slower, and capture speed is the whole product.
      at: props.at == null ? '' : String(props.at),
      // Calendar date 'YYYY-MM-DD'. '' means today — the overwhelmingly common
      // case, so it costs nothing to record.
      on: props.on == null ? '' : String(props.on),
      /* Calendar revision. An .ics re-imported with the same UID and a HIGHER
       * SEQUENCE replaces the existing event instead of adding a second one —
       * that is the whole mechanism behind "edit it, add it again, it updates". */
      seq: Number(props.seq) || 0,
      done: !!props.done,
      createdAt: props.createdAt || Date.now(),
      ownerId: props.ownerId == null ? '' : String(props.ownerId),
      /* Which studio a 公司 thought belongs to. '' for a private one — it belongs
       * to a person, not a company. Set from the studio you are standing in when
       * the thought is captured, and checked by the database on write, so a
       * client cannot file a thought into somebody else's studio (ADR-0014). */
      workspaceId: props.workspaceId == null ? '' : String(props.workspaceId),
      /* The day this was FOR, once that day has gone and it was never done.
       * '' while it is still live. Kept because the alternative is silence: a
       * thought that returns to 待辦事項 with no date reads as though it was
       * never planned at all. */
      wasFor: props.wasFor == null ? '' : String(props.wasFor),
      updatedAt: props.updatedAt || props.createdAt || Date.now(),
      // A brand-new thought has never reached the server, so it is dirty by
      // definition — unless it just came FROM the server.
      dirty: props.dirty === false ? false : true
    };
  }

  // Coerce an untrusted/persisted object into a valid Task, or null if unusable.
  // Used by the storage layer when loading older/unknown data.
  function normalizeTask(raw) {
    if (!raw || !raw.id) return null;
    var role = raw.role == null ? '' : String(raw.role);
    return {
      id: raw.id,
      title: String(raw.title == null ? '' : raw.title),
      meta: raw.meta || '',
      section: raw.section || SECTIONS.TODAY,
      role: role,
      // Re-derived on every load rather than trusted: whatever is on disk, the
      // hat is the authority on who may read this.
      scope: scopeFor(role),
      at: raw.at == null ? '' : String(raw.at),
      on: raw.on == null ? '' : String(raw.on),
      seq: Number(raw.seq) || 0,
      done: !!raw.done,
      createdAt: raw.createdAt || 0,
      ownerId: raw.ownerId == null ? '' : String(raw.ownerId),
      workspaceId: raw.workspaceId == null ? '' : String(raw.workspaceId),
      wasFor: raw.wasFor == null ? '' : String(raw.wasFor),
      updatedAt: raw.updatedAt || raw.createdAt || 0,
      dirty: !!raw.dirty
    };
  }

  return {
    SECTIONS: SECTIONS,
    SCOPES: SCOPES,
    ROLE_SLOTS: ROLE_SLOTS,
    DEFAULT_ROLES: DEFAULT_ROLES,
    VIEWS: VIEWS,
    createTask: createTask,
    normalizeTask: normalizeTask,
    normalizeRole: normalizeRole,
    touch: touch,
    scopeFor: scopeFor,
    sectionForNew: sectionForNew
  };
})();
