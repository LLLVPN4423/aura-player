const CACHE = 'aura-hifi-v3';
const ASSETS = [
  './',
  './index.html',
  './favicon.svg',
  './manifest.webmanifest',
  './src/main.js',
  './src/styles/main.css',
  './src/ui/App.js',
  './src/ui/icons.js',
  './src/ui/visualizer.js',
  './src/ui/cover.js',
  './src/player/AudioEngine.js',
  './src/player/Playlist.js',
  './src/player/formats.js',
  './src/player/headphones.js',
  './src/analysis/bpm.js',
  './src/analysis/metrics.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  e.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((res) => {
            const copy = res.clone();
            if (res.ok && request.url.startsWith(self.location.origin)) {
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => cached),
    ),
  );
});
