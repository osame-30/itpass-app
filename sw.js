// オフライン用。make_app.py が VERSION を書き換え、版が変わると precache.json の全ファイルを取り直す。
const VERSION = '39c6f8e09374';
const CACHE = 'itpass-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const list = await (await fetch('precache.json?v=' + VERSION, { cache: 'no-store' })).json();
    const c = await caches.open(CACHE);
    await c.addAll(list.map(u => new Request(u, { cache: 'reload' })));   // HTTP の古い控えを使わない
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const hit = await caches.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(e.request);
    if (res.ok) (await caches.open(CACHE)).put(e.request, res.clone());
    return res;
  })());
});
