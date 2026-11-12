const CACHE = 'arcade-__VERSION__';
const RUNTIME_CACHE = 'arcade-runtime';
const PRECACHE = __PRECACHE__;
const RUNTIME_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
    // 既定の cache.addAll(PRECACHE) だと GitHub Pages の HTTP キャッシュに残った旧版を拾うことがあるため、reload を指定する
    const requests = PRECACHE.map((url) => new Request(url, { cache: 'reload' }));
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        event.respondWith(caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(request)));
    } else if (RUNTIME_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(event, request));
    }
});

// Google Fonts は配信される CSS やフォントの URL がブラウザごとに変わり事前に列挙できないため、初回表示時に取ったものを使い回す
async function staleWhileRevalidate(event, request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const hit = await cache.match(request);
    const update = fetch(request).then((response) => {
        if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
        return response;
    });
    if (!hit) return update;
    event.waitUntil(update.catch(() => {}));
    return hit;
}
