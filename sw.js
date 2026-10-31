/* sw.js — offline-first cache for e.english, version-aware.

   The cache name comes from JavaScript/version.js (the single source of
   truth for the model version), so this file never hard-codes a version.
   Ship a new model version by editing version.js only — going forward
   (6 → 7) or backward (7 → 6) works the same way, because the browser
   also re-checks scripts pulled in with importScripts and installs a new
   worker whenever version.js changes.

   Scope: this worker only ever touches Cache Storage entries whose name
   starts with EE_CACHE_PREFIX. It never touches localStorage / IndexedDB,
   so user learning data is out of its reach by construction. */
importScripts('JavaScript/version.js');

const CACHE_NAME = self.EE_CACHE_NAME;       // e.g. "e-english-v11.3.1-js4" (app version 11.3.1 + JavaScript loading version 4)
const CACHE_PREFIX = self.EE_CACHE_PREFIX;   // "e-english-"

// JavaScript files are requested as "<file>.js?js=<EE_JS_VERSION>" (index.html), so the
// JavaScript loading version is part of the URL that is fetched and cached.
const JSQ = '?js=' + self.EE_JS_VERSION;
const SHELL = [
  './', 'index.html', 'app.json', 'README.md', 'README.ar.md', 'manifest.webmanifest',
  'CSS/root.css', 'CSS/responsive.css', 'CSS/animations.css', 'CSS/settings.css',
  'JavaScript/version.js', 'JavaScript/icons.js' + JSQ, 'JavaScript/i18n.js' + JSQ, 'JavaScript/quiz-engine.js' + JSQ, 'JavaScript/ux.js' + JSQ,
  'JavaScript/ui.js' + JSQ, 'JavaScript/settings.js' + JSQ, 'JavaScript/readme.js' + JSQ, 'JavaScript/pages.js' + JSQ,
  'Ui/Logo.png', 'Ui/Regular.ttf', 'Ui/Bold.ttf'
];

// Precache with cache:'reload' so the new version's cache is filled from the
// network, never from the browser's HTTP cache (which could still hold the
// previous version's files).
function fresh(url) { return new Request(url, { cache: 'reload' }); }

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    // One missing file must never make the whole install fail (that is what
    // happens with cache.addAll when a listed file 404s — the worker would
    // never install and offline mode would be dead). Fast path first; if it
    // fails, add the files one by one and keep whatever exists.
    try {
      await cache.addAll(SHELL.map(fresh));
    } catch (e) {
      await Promise.all(SHELL.map(function (u) { return cache.add(fresh(u)).catch(function () {}); }));
    }
    // Content files are listed in app.json — cache them too.
    try {
      const cfg = await (await fetch(fresh('app.json'))).json();
      await Promise.all((cfg.files || []).map(function (f) { return cache.add(fresh('Files/' + f)).catch(function () {}); }));
    } catch (e) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    // Only OUR caches, and only the ones that belong to another version.
    const stale = keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== CACHE_NAME; });
    await Promise.all(stale.map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
    // A real version transition happened: tell open pages so they can
    // reload onto the new files (pages decide when — never mid-quiz).
    if (stale.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) {
        c.postMessage({ type: 'EE_CACHE_ACTIVATED', version: self.EE_MODEL_VERSION + '|' + self.EE_JS_VERSION, cache: CACHE_NAME });
      });
    }
  })());
});

// Stale-while-revalidate inside the CURRENT version's cache only.
self.addEventListener('fetch', function (event) {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // The update check asks the NETWORK what version the server has now
  // ("JavaScript/version.js?check=…"). It must never be answered from the
  // cache — that would always report the version already running — and it is
  // not stored.
  if (/\/JavaScript\/version\.js$/.test(url.pathname) && url.searchParams.has('check')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  event.respondWith((async function () {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(function () { return null; });
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    return res || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
  })());
});
