/* Life OS — UI copy.
 *
 * The frozen prototype in ../prototype/ stays the canonical specification and is
 * written in English: it defines WHAT each line says and where it sits. This file
 * defines what LANGUAGE the running app says it in. Meaning lives in one place;
 * wording lives here. That is a localization layer, not a product decision.
 *
 * Adding a language = one more entry below. Adding a visible language switcher
 * would be a new control, and a new control belongs in ../prototype/ first.
 */
window.LOSStrings = (function () {
  'use strict';

  var DICT = {
    'zh-Hant': {
      locale: 'zh-TW',
      oneLabel: '最重要的一件事',
      oneHint: '其他都沒做到，至少這件。',
      today: '今天',
      todo: '待辦事項',
      waiting: '有人在等你',
      later: '以後',
      silence: '今天沒有事情需要你。',
      capture: '想到什麼就記下來…',
      complete: '完成',
      themeToggle: '切換淺色／深色',
      all: '全部',
      captionAll: '今天 — 你的整個生活，一個畫面。',
      captionRole: '{role} — 其他都收起來了，只有這些。',
      captionTodo: '想到了，還沒排時間的。',
      captionWeek: '接下來七天有日期的事。',
      today2: '今天',
      tomorrow: '明天',
      dateFmt: '{m}/{d}',
      pickDate: '選日期',
      needsYou: '需要你',
      needsMeta: '放了 {n} 天了',
      wasFor: '原本排 {y} 年 {m} 月 {d} 日',
      quiet: '{role} 這幾天很安靜',
      roleSilence: '{role} 這邊沒事了。',
      welcomeTitle: '這裡是放念頭的地方。',
      welcomeBody: '想到什麼就往下面那格丟 — 買什麼、要提醒誰、突然想到的做法。不用分類，先留下來就好。',
      welcomeHint: '記了第一筆之後，這段話就不會再出現。',
      welcomePickSide: '先按上面的「公司」或「個人」— 在「全部」的狀態下不能新增，因為那時候還不知道這件事該給誰看。',
      schedule: '今天的行程',
      allDay: '整天',
      calConnect: '連結 Google 日曆',
      calNote: '只讀，不會變成待辦事項',
      calOk: '已連結 · 共 {n} 筆行程',
      calNone: '已連結 · 今天沒有行程',
      calFail: '連結沒成功（{why}）— 再按一次試試',
      calWhyStateLost: '回來時對不上',
      calWhyDenied: '你在 Google 那邊按了取消',
      calWhyAuth: '授權過期',
      calWhyNet: '連不上 Google',
      del: '刪除',
      editHint: '改完按 Enter',
      wheelHint: '上下滑',
      toCal: '加到行事曆',
      bulkCal: '一次加入行事曆（{n} 筆）',
      bulkNote: '已加過的會直接更新，不會重複',
      calShort: '加行事曆',
      setTime: '選時間',
      anytime: '不指定',
      morning: '早安。',
      afternoon: '午安。',
      evening: '晚安。',
      // Who can see it. The two headings that make visibility legible: above the
      // line is what the company sees, below it is nobody's business but yours.
      scopeAll: '全部',
      scopeCompany: '公司',
      scopePrivate: '個人',
      scopeCompanyNote: '全公司看得到',
      scopePrivateNote: '只有你看得到',
      edit: '編輯',
      editDone: '完成',
      editHelp: '改時間、日期、分類，或刪掉。',
      noTime: '時間',
      noDate: '日期',
      noRole: '沒分類',
      captureLocked: '先選「公司」或「個人」',
      studio: '工作室',
      platform: '平台管理',
      platformNote: '你可以開新公司、指定它的老闆。你看不到任何一間公司的事項內容 — 那是資料庫的規則在擋，不是這個畫面在客氣。',
      newStudio: '新公司名稱',
      createStudio: '建立',
      studioPeople: '{n} 人',
      pickStudio: '先點一間公司',
      bossEmail: '老闆的 Google email',
      makeBoss: '指定為老闆',
      bossInvited: '好了。他用 Google 登入之後就是那間的老闆。',
      studioMade: '公司開好了。接著指定老闆。',
      noStudio: '你還不屬於任何工作室。你寫的東西只有你看得到 — 等管理員把你加進來，「工作」那些才會跟同事共用。',
      members: '成員',
      inviteLabel: '邀請同事',
      inviteNote: '打他的 Google email。他用 Google 登入之後就自動加進來，不用輸入任何東西。',
      inviteBtn: '邀請',
      inviteSent: '邀請好了。等他用 Google 登入。',
      inviteBad: 'email 看起來不對。',
      pending: '邀請中，還沒登入',
      withdraw: '收回',
      myName: '你在公司的名稱',
      myNameNote: '同事在共用清單上看到的就是這個名字。',
      save: '儲存',
      nameSaved: '存好了。',
      nameNeeded: '名稱不能空白。',
      // 工作室帳號。登入之前這些一個字都不會出現。
      acctTitle: '電子信箱',
      acctBody: '登入之後，「工作」那一類會跟工作室的人共用。「家庭」和沒分類的只有你看得到 — 這條線是資料庫在守，不是這支 app 在守。你手機上原本的東西會變成你的，一起上傳。',
      acctEmail: 'email',
      acctPassword: '密碼',
      signIn: '登入',
      signInGoogle: '用 Google 登入',
      orPassword: '或者用 email 和密碼',
      signingIn: '登入中…',
      signOut: '登出',
      signedIn: '已登入',
      signedInAs: '{email}',
      syncNow: '立刻同步',
      /* Asked out loud: "is that sync button how I get other people's items?"
       * A button implies the thing does not happen without it, so the panel now
       * says when it last happened by itself. */
      syncAuto: '會自己同步 — 打開、改完東西、切回來的時候都會。這顆只是不想等。',
      syncedJust: '剛剛同步過',
      syncedMin: '{n} 分鐘前同步過',
      syncedHour: '{n} 小時前同步過',
      syncedNever: '還沒同步過',
      syncing: '同步中…',
      syncOk: '同步完成。',
      syncFailed: '同步沒成功，等一下會自動再試。你寫的東西都還在這支手機上，不會掉。',
      signInFailed: '登入沒成功（{why}）',
      badCreds: '帳號或密碼不對。',
      needBoth: 'email 和密碼都要填。',
      someone: '別人的'
    },
    en: {
      locale: 'en-GB',
      oneLabel: 'The one thing',
      oneHint: 'If nothing else, this.',
      today: 'Today',
      todo: 'To do',
      waiting: 'Someone is waiting on you',
      later: 'Later',
      silence: 'Nothing needs you today.',
      capture: 'Add anything…',
      complete: 'Complete',
      themeToggle: 'Toggle light / dark',
      all: 'All',
      captionAll: 'Today — your whole life, one view.',
      captionRole: '{role} — the rest is put away. Just this.',
      captionTodo: 'Captured, not scheduled yet.',
      captionWeek: 'Dated within the next seven days.',
      today2: 'Today',
      tomorrow: 'Tomorrow',
      dateFmt: '{m}/{d}',
      pickDate: 'Pick a date',
      needsYou: 'Needs you',
      needsMeta: '{n} days',
      wasFor: 'was for {y}-{m}-{d}',
      quiet: '{role} has been quiet',
      roleSilence: 'Nothing here for {role}.',
      welcomeTitle: 'This is where thoughts go.',
      welcomeBody: 'Put anything in the field below — something to buy, someone to remind, an idea that just showed up. No sorting needed. Keeping it is enough.',
      welcomeHint: 'This disappears once you write the first one.',
      welcomePickSide: 'Pick 公司 or 個人 above first — nothing can be added under 全部, because there it is not yet known who the thought is for.',
      schedule: "Today's schedule",
      allDay: 'All day',
      calConnect: 'Connect Google Calendar',
      calNote: 'Read-only — never becomes a task',
      calOk: 'Connected · {n} events',
      calNone: 'Connected · nothing today',
      calFail: "Couldn't connect ({why}) — tap to try again",
      calWhyStateLost: 'lost the handshake on the way back',
      calWhyDenied: 'cancelled at Google',
      calWhyAuth: 'authorisation expired',
      calWhyNet: "couldn't reach Google",
      del: 'Delete',
      editHint: 'Enter to save',
      wheelHint: 'scroll',
      toCal: 'Add to calendar',
      bulkCal: 'Add all to calendar ({n})',
      bulkNote: 'Anything already added is updated, not duplicated',
      calShort: 'Calendar',
      setTime: 'Pick a time',
      anytime: 'Anytime',
      morning: 'Good morning.',
      afternoon: 'Good afternoon.',
      evening: 'Good evening.',
      scopeAll: 'All',
      scopeCompany: 'Company',
      scopePrivate: 'Private',
      scopeCompanyNote: 'everyone sees this',
      scopePrivateNote: 'only you see this',
      edit: 'Edit',
      editDone: 'Done',
      editHelp: 'Change the time, date or hat — or delete it.',
      noTime: 'Time',
      noDate: 'Date',
      noRole: 'No hat',
      captureLocked: 'Pick 公司 or 個人 first',
      studio: 'Studio',
      platform: 'Platform',
      platformNote: 'You can open studios and appoint their admins. You cannot read any studio\u2019s tasks — enforced by the database, not by this screen being polite.',
      newStudio: 'New studio name',
      createStudio: 'Create',
      studioPeople: '{n} people',
      pickStudio: 'Pick a studio first',
      bossEmail: "The admin's Google email",
      makeBoss: 'Make admin',
      bossInvited: 'Done. They run it once they sign in with Google.',
      studioMade: 'Created. Now appoint its admin.',
      noStudio: 'You are not in a studio yet. What you write is yours alone — once an admin adds you, anything filed 工作 is shared with them.',
      members: 'Members',
      inviteLabel: 'Invite a colleague',
      inviteNote: 'Their Google address. Signing in with Google adds them — they type nothing.',
      inviteBtn: 'Invite',
      inviteSent: 'Invited. They join when they sign in with Google.',
      inviteBad: 'That does not look like an email.',
      pending: 'invited, not signed in yet',
      withdraw: 'Withdraw',
      myName: 'Your name in the studio',
      myNameNote: 'This is the name colleagues see on the shared list.',
      save: 'Save',
      nameSaved: 'Saved.',
      nameNeeded: 'A name is needed.',
      acctTitle: 'Email',
      acctBody: "Once signed in, anything filed 工作 is shared with the studio. 家庭 and anything unfiled stays yours — a line the database enforces, not this app. What is already on this phone becomes yours and is uploaded.",
      acctEmail: 'email',
      acctPassword: 'password',
      signIn: 'Sign in',
      signInGoogle: 'Sign in with Google',
      orPassword: 'or use email and password',
      signingIn: 'Signing in…',
      signOut: 'Sign out',
      signedIn: 'Signed in',
      signedInAs: '{email}',
      syncNow: 'Sync now',
      syncAuto: 'It syncs itself — on opening, after a change, and on coming back. This is only for impatience.',
      syncedJust: 'synced just now',
      syncedMin: 'synced {n} min ago',
      syncedHour: 'synced {n} h ago',
      syncedNever: 'not synced yet',
      syncing: 'Syncing…',
      syncOk: 'Up to date.',
      syncFailed: "Sync didn't work; it will try again. Everything you wrote is still on this phone.",
      signInFailed: "Couldn't sign in ({why})",
      badCreds: 'Wrong email or password.',
      needBoth: 'Both email and password are needed.',
      someone: 'someone else'
    }
  };

  // Traditional Chinese is the product's language. English is kept for the
  // specification's own wording, and reachable with ?lang=en for checking copy
  // against ../prototype/ — not a user-facing feature.
  var DEFAULT = 'zh-Hant';

  function pick() {
    try {
      var q = new URLSearchParams(window.location.search).get('lang');
      if (q && DICT[q]) return q;
      if (q === 'zh' || q === 'zh-TW') return 'zh-Hant';
    } catch (e) { /* fall through to default */ }
    return DEFAULT;
  }

  var lang = pick();
  var t = DICT[lang];

  /* Writes every fixed string into the DOM. index.html ships with no
   * user-facing copy of its own, so nothing can silently stay untranslated. */
  function apply(root) {
    root = root || document;
    document.documentElement.setAttribute(
      'lang', lang === 'zh-Hant' ? 'zh-Hant-TW' : 'en'
    );
    root.querySelectorAll('[data-t]').forEach(function (el) {
      var key = el.getAttribute('data-t');
      if (t[key] != null) el.textContent = t[key];
    });
    root.querySelectorAll('[data-t-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-t-placeholder');
      if (t[key] != null) el.setAttribute('placeholder', t[key]);
    });
    root.querySelectorAll('[data-t-title]').forEach(function (el) {
      var key = el.getAttribute('data-t-title');
      if (t[key] != null) el.setAttribute('title', t[key]);
    });
    root.querySelectorAll('[data-t-aria]').forEach(function (el) {
      var key = el.getAttribute('data-t-aria');
      if (t[key] != null) el.setAttribute('aria-label', t[key]);
    });
  }

  return {
    lang: lang,
    t: t,
    /* get('captionRole', {role:'現場'}) — placeholders are {name} */
    get: function (key, vars) {
      var v = t[key] != null ? t[key] : key;
      if (!vars) return v;
      return v.replace(/\{(\w+)\}/g, function (m, k) {
        return vars[k] != null ? vars[k] : m;
      });
    },
    apply: apply
  };
})();
