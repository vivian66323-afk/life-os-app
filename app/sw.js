/* Life OS — service worker.
 *
 * Purpose: the app opens with no signal. That is packaging, not product
 * behaviour — nothing here changes what the app does, only whether it is there
 * when you reach for it.
 *
 * STRATEGY: network-first, cache as the offline fallback.
 *
 * The first version of this file was cache-first, which is the usual advice and
 * was wrong here. An installed app kept serving the copy it had cached and never
 * picked up new versions — a real bug an actual phone hit. The whole shell is a
 * few tens of KB, so fetching it fresh costs nothing worth measuring, while
 * being stale costs the user an app that silently refuses to update.
 *
 * Bump CACHE whenever the shell changes.
 */
var CACHE = 'life-os-shell-v23';
var BUILD = 'v23';

var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './strings.js',
  './gcal.js',
  './model.js',
  './storage.js',
  './cloud.js',
  './demo.js',
  './share.js',
  './app.js',
  '../prototype/styles.css',
  '../prototype/theme.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // add() one at a time: addAll is all-or-nothing, so a single 404 would
      // leave the app with no offline cache at all.
      .then(function (c) {
        return Promise.all(SHELL.map(function (url) {
          return c.add(new Request(url, { cache: 'reload' }))['catch'](function () {});
        }));
      })
      // Take over immediately rather than waiting for every tab to close —
      // an installed app is rarely "closed", so waiting means never updating.
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches['delete'](k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Lets the page ask which build is actually running — the answer to
// "did it update?" should be checkable, not guessed.
self.addEventListener('message', function (e) {
  if (e.data === 'build' && e.source) e.source.postMessage({ build: BUILD });
});

function fresh(req) {
  return fetch(req).then(function (res) {
    if (res && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations — including a share-target hit at ./?text=… — resolve to the
  // shell. Network first so a launch with signal always gets the current app.
  if (req.mode === 'navigate') {
    e.respondWith(
      fresh(new Request('./index.html', { cache: 'reload' }))
        ['catch'](function () {
          return caches.match('./index.html').then(function (hit) {
            return hit || caches.match('./');
          });
        })
    );
    return;
  }

  e.respondWith(
    fresh(req)['catch'](function () {
      return caches.match(req).then(function (hit) {
        return hit || Response.error();
      });
    })
  );
});
