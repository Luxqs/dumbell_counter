// ─── Service worker ───────────────────────────────────────────────────────────
//
// The app has to start in a gym with one bar of signal. index.html pulls
// TensorFlow.js and the pose model from a CDN, and the model weights come from
// Google storage at runtime, so without this the whole thing is dead the moment
// the network is — which is exactly where it is used.
//
// Same-origin files use stale-while-revalidate: the cached copy serves
// instantly and a fresh one replaces it for next time. The two CDN scripts are
// version-pinned URLs whose content never changes, so they are cache-first, as
// are the model weights.
//
// DEVELOPMENT: an edit therefore lands on the SECOND load. Bump CACHE_VERSION,
// or unregister the worker in DevTools → Application → Service Workers.

const CACHE_VERSION = 'dc-v1';

const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/export.js',
  './js/core.js',
  './js/app.js',
  './icon.svg',
  './manifest.webmanifest',
];

const VENDOR = [
  'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js',
  'https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js',
];

// The model weights are fetched by tfjs at runtime from these hosts. They are
// the other half of "works offline" — the library alone counts nothing.
const WEIGHT_HOSTS = /(^|\.)tfhub\.dev$|(^|\.)storage\.googleapis\.com$|(^|\.)kaggle\.com$/;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // The shell must all land, or this worker is not worth installing.
    await cache.addAll(SHELL);
    // The CDN files are best effort: failing here must not stop the worker from
    // taking over, it only means the first offline start needs the libraries to
    // have been fetched at least once.
    await Promise.all(VENDOR.map(u => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (VENDOR.includes(url.href) || WEIGHT_HOSTS.test(url.hostname)) {
    event.respondWith(cacheFirst(req));
  } else if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  const hit   = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req);
    // An opaque response is still worth keeping: it is what a no-cors weight
    // fetch returns, and replaying it offline works even though we cannot read it.
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (_) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_VERSION);
  const hit   = await cache.match(req);
  const net   = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  if (hit) return hit;
  return (await net) || new Response('', { status: 504, statusText: 'Offline' });
}
