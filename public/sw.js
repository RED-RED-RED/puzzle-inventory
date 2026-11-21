// Service worker: only provides a friendly page when the server can't be
// reached. Everything else always comes straight from the server, so updates
// show up immediately and nothing goes stale.
const CACHE = 'puzzle-inventory-offline-v1';
const OFFLINE_ASSETS = ['/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.mode !== 'navigate') return; // API calls, images etc. go straight to the network
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
