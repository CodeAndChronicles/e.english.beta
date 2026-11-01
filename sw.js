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

const CACHE_NAME = self.EE_CACHE_NAME;       // e.g. "e-english-v11.3.2-js5" (app version 11.3.2 + JavaScript loading version 5)
const CACHE_PREFIX = self.EE_CACHE_PREFIX;   // "e-english-"

// JavaScript files are requested as "<file>.js?js=<EE_JS_VERSION>" (index.html), so the
// JavaScript loading version is part of the URL that is fetched and cached.
const JSQ = '?js=' + self.EE_JS_VERSION;
// ESSENTIAL files: without any one of them the app cannot start offline. Installing the
// worker FAILS if one cannot be fetched (the previous worker and cache keep serving, and the
// browser tries the install again later) — so a half-filled cache is never activated.
const CORE = [
  './', 'index.html', 'app.json', 'manifest.webmanifest', 'README.md', 'README.ar.md',
  'CSS/root.css', 'CSS/ColorSystem.css', 'CSS/responsive.css', 'CSS/animations.css', 'CSS/settings.css',
  'JavaScript/version.js', 'JavaScript/icons.js' + JSQ, 'JavaScript/i18n.js' + JSQ, 'JavaScript/quiz-engine.js' + JSQ,
  'JavaScript/ux.js' + JSQ, 'JavaScript/ColorSystem.js' + JSQ, 'JavaScript/ui.js' + JSQ, 'JavaScript/settings.js' + JSQ,
  'JavaScript/readme.js' + JSQ, 'JavaScript/pages.js' + JSQ
];
// NICE-TO-HAVE files: stored when they can be; one missing never blocks the install
// (the page has fallbacks, and the fetch handler stores them the first time they load).
const OPTIONAL = ['Ui/Logo.png', 'Ui/Regular.ttf', 'Ui/Bold.ttf'];

// The cached page every navigation falls back to, resolved against the worker's scope so it
// is right under a sub-path such as https://user.github.io/repo/.
const INDEX_URL = new URL('index.html', self.registration.scope).href;
const SCOPE_URL = self.registration.scope;

// Fetch with cache:'reload' so the new version's cache is filled from the network, never
// from the browser's HTTP cache (which could still hold the previous version's files).
function fresh(url) { return new Request(url, { cache: 'reload' }); }

// Store one file; reject when it is missing/not OK. A redirected answer is stored as a plain
// copy: a navigation may not be answered with a redirected response.
async function precache(cache, url) {
  const req = fresh(url);
  const res = await fetch(req);
  if (!res || !res.ok) throw new Error('precache failed: ' + url + ' (' + (res && res.status) + ')');
  const clean = res.redirected ? new Response(await res.blob(), { status: 200, statusText: 'OK', headers: res.headers }) : res;
  await cache.put(new Request(url), clean);
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    try {
      // 1) essential files, then 2) every lesson file listed in app.json (also essential:
      //    studying offline needs them). Any failure aborts the install.
      await Promise.all(CORE.map(function (u) { return precache(cache, u); }));
      const cfg = await (await fetch(fresh('app.json'))).json();
      await Promise.all((cfg.files || []).map(function (f) { return precache(cache, 'Files/' + f); }));
    } catch (e) {
      await caches.delete(CACHE_NAME);          // never leave an incomplete cache behind
      throw e;                                   // install fails -> this worker is not activated
    }
    // 3) optional files: best effort, never fatal
    await Promise.all(OPTIONAL.map(function (u) { return precache(cache, u).catch(function () {}); }));
    await self.skipWaiting();                    // reached only when everything essential is cached
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
    const isNav = req.mode === 'navigate';
    // Navigations (start_url, typed address, installed-app launch, reload) are answered by
    // the cached app page whatever their URL looks like (with/without index.html, query).
    const cached = await cache.match(req, { ignoreSearch: true }) || (isNav ? (await cache.match(INDEX_URL) || await cache.match(SCOPE_URL)) : undefined);
    const network = fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok && !res.redirected && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(function () { return null; });
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    return isNav ? (await cache.match(INDEX_URL) || await cache.match(SCOPE_URL) || Response.error()) : Response.error();
  })());
});
