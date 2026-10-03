// CareLink service worker.
// - Keeps the app shell and its scripts/styles so the app opens with no signal.
// - Never touches /api/* (patient data is handled by the app itself, not cached here).
// - Anything on another site (for example Google Maps) is left alone.

const VERSION = 'carelink-v1';
const SHELL_CACHE = VERSION + '-shell';
const ASSET_CACHE = VERSION + '-assets';
const EXTRA_ASSETS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/', { cache: 'reload' });
        if (res.ok) {
          const shell = await caches.open(SHELL_CACHE);
          await shell.put('/', res.clone());
          const html = await res.text();
          // Save every script and stylesheet the page needs.
          const urls = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) || []);
          EXTRA_ASSETS.forEach((u) => urls.add(u));
          const assets = await caches.open(ASSET_CACHE);
          await Promise.all(
            [...urls].map(async (u) => {
              try {
                const r = await fetch(u);
                if (r.ok) await assets.put(u, r);
              } catch (e) {
                /* skip files that fail to download */
              }
            }),
          );
        }
      } catch (e) {
        /* installing offline: the app will cache itself on the next online visit */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Opening the app: use the network, fall back to the saved shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && url.pathname === '/') {
            const shell = await caches.open(SHELL_CACHE);
            shell.put('/', res.clone());
          }
          return res;
        } catch (e) {
          const cached = await caches.match('/', { cacheName: SHELL_CACHE });
          return cached || new Response('CareLink is offline and has not been opened online yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })(),
    );
    return;
  }

  // Scripts, styles and icons: saved copy first, then the network.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
