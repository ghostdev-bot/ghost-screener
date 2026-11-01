/* Ghost Screener service worker: caches the app shell only. API data is never cached. */
var VERSION = 'gs-shell-v6-fb';
var SHELL = [
  '/', '/index.html', '/css/style.css', '/js/app.js', '/manifest.webmanifest',
  '/assets/mark.svg', '/assets/avatar.jpg', '/assets/og.png',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png',
  '/assets/icons/maskable-192.png', '/assets/icons/maskable-512.png',
  '/assets/icons/apple-touch-icon-180.png'
];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('gs-shell-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Cross-origin (price APIs, chart embeds, token icons): never intercepted, always straight to network.
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network-first for the page so deploys show up immediately; cached shell only when offline.
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('/index.html', copy); });
      return res;
    }).catch(function () { return caches.match('/index.html'); }));
    return;
  }
  // Static shell files: serve from cache fast, refresh in the background.
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; });
      if (hit) { net.catch(function () {}); return hit; }
      return net;
    });
  }));
});
