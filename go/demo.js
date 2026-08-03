/* Life OS — demo mode (?demo=1).
 *
 * Why this exists: an empty app shows you nothing. This fills it with a sample
 * day so the design can actually be looked at and judged.
 *
 * Two hard guarantees:
 *   1. It only runs when the URL says ?demo=1. Never by accident, never on the
 *      real app, never on first run — app.js keeps its honest empty start.
 *   2. It CANNOT touch your data. It replaces the storage seam wholesale: load
 *      returns the sample, save does nothing. Your real tasks are never read
 *      and never written while demo mode is on. Close the tab and it's gone.
 *
 * The sample content is illustrative, not evidence — same rule as
 * research/simulation/. It is here to show a shape, not to prove a behaviour.
 */
(function () {
  'use strict';

  var on = false;
  try {
    on = new URLSearchParams(window.location.search).get('demo') === '1';
  } catch (e) {
    return;
  }
  if (!on || !window.LOSStorage || !window.LOSModel) return;

  var S = LOSModel.SECTIONS;
  var DAY = 86400000;
  var now = Date.now();

  function ymd(dt) {
    return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2)
         + '-' + ('0' + dt.getDate()).slice(-2);
  }

  // A plausible day for someone running their own site work. Illustrative only.
  // `age` drives the derived "Needs you" band — anything 2+ days old surfaces.
  var SAMPLE = [
    { title: '跟監工確認驗收日期',        section: S.ONE,   role: 'work', age: 0 },
    { title: '報價單還沒給陳先生',        section: S.TODAY, role: 'work',  age: 4 },
    { title: '小孩的學校表格要簽',        section: S.TODAY, role: 'home', age: 3 },
    { title: '補三樓插座位置的照片回報',  section: S.TODAY, role: 'work', age: 0 },
    { title: '叫下週要用的材料',          section: S.TODAY, role: 'work', age: 1,
      meta: '料車最近常遲到' },
    { title: '回廠商訊息',                section: S.TODAY, role: 'work',  age: 0, done: true },
    { title: '四點去接小孩',              section: S.TODAY, role: 'home', age: 0 },
    /* 待辦事項 — captured, no time on them yet. Both hats are present on
     * purpose, so the 公司 / 個人 split is visible in the sample. */
    { title: '問印刷廠的報價',            section: S.TODO,  role: 'work', age: 1 },
    { title: '整理案子的照片存檔',        section: S.TODO,  role: 'work', age: 0 },
    { title: '看牙醫要約時間',            section: S.TODO,  role: 'home', age: 2 },
    { title: '報價單格式重做',            section: S.LATER, role: 'work',  age: 9 },
    { title: '安全帽扣環壞了要換',        section: S.LATER, role: 'work', age: 6 },
    { title: '約媽媽看牙醫',              section: S.LATER, role: 'home', age: 5 },
    { title: '下週一驗收要準備的資料',    section: S.TODAY, role: 'work', age: 0, inDays: 3 },
    { title: '週六家庭聚餐訂位',          section: S.TODAY, role: 'home', age: 0, inDays: 5 }
  ];

  LOSStorage.load = function () {
    return Promise.resolve({
      version: LOSStorage.VERSION,
      roles: LOSModel.DEFAULT_ROLES.slice(),
      graves: [],
      // The sample is here to be looked at, so it shows both halves at once.
      scope: 'all',
      isFirstRun: false,
      tasks: SAMPLE.map(function (t) {
        return LOSModel.createTask({
          title: t.title,
          meta: t.meta,
          section: t.section,
          role: t.role,
          done: t.done,
          on: t.inDays ? ymd(new Date(now + t.inDays * DAY)) : '',
          createdAt: now - (t.age || 0) * DAY
        });
      })
    });
  };

  // The seam is closed: nothing written in demo mode reaches storage.
  LOSStorage.save = function () { return Promise.resolve(); };

  // Make it unmistakable that this is not your data.
  window.addEventListener('DOMContentLoaded', function () {
    var tag = document.createElement('div');
    tag.textContent = '範例內容 · 不會被儲存';
    tag.setAttribute('role', 'status');
    tag.style.cssText = [
      'position:fixed', 'left:50%', 'transform:translateX(-50%)',
      'bottom:14px', 'z-index:50',
      'font-size:12px', 'letter-spacing:.04em',
      'padding:7px 14px', 'border-radius:999px',
      'background:var(--star,#e0a132)', 'color:#1b1400',
      'font-weight:600', 'box-shadow:0 4px 16px rgba(0,0,0,.22)',
      'pointer-events:none', 'white-space:nowrap'
    ].join(';');
    document.body.appendChild(tag);
  });
})();
