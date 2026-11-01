/* version.js — the ONE place the application model version lives.

   Loaded in two different worlds, which is why it touches no DOM and uses
   no module syntax:
     • the page   (<script src="JavaScript/version.js"> in index.html)
     • the service worker (importScripts('JavaScript/version.js') in sw.js)
   Both therefore derive the exact same cache name from the same string.

   To ship a new model version, change EE_MODEL_VERSION below and nothing
   else — sw.js, ux.js and the cache-migration logic all follow it, whether
   the change goes forward (6 → 7) or backward (7 → 6).

   TWO numbers live here and they are NOT the same thing:
     EE_MODEL_VERSION  the APPLICATION release ("version 11.3.2"). It is what
                       people mean by "the app version".
     EE_JS_VERSION     the JAVASCRIPT LOADING revision ("3"). It is only about
                       how script files are fetched and cached: index.html asks
                       for every script as "…js?js=2", and the cache name
                       carries it. Bump it when the way scripts are loaded or
                       cached must be forced to start fresh WITHOUT a new app
                       release (a stale-JavaScript emergency brake).
   Changing either one makes the service worker create a new cache, drops the
   old ones and refreshes open pages (see ux.js "Update refresh cycle").

   IMPORTANT — what these numbers control:
     ✔ the APP cache (Cache Storage: app shell + lesson content)
     ✘ NEVER user learning data (known words, reviews, quiz history,
       preferences). Those live under their own localStorage keys and are
       untouched by a version change. */
(function (root) {
  'use strict';
  root.EE_MODEL_VERSION = '11.3.2';
  root.EE_JS_VERSION = '5';
  // Every cache this app ever creates starts with this prefix, so cleanup
  // can be scoped to "our" caches and never touches anything else on the
  // same origin.
  root.EE_CACHE_PREFIX = 'e-english-';
  // e.g. "e-english-v11.3.2-js5": app version 11.3.2, JavaScript loading version 5.
  root.EE_CACHE_NAME = root.EE_CACHE_PREFIX + 'v' + root.EE_MODEL_VERSION + '-js' + root.EE_JS_VERSION;
})(typeof self !== 'undefined' ? self : this);
