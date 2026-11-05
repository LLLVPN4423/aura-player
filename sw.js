const CACHE = 'aura-hifi-v7';
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
  './src/ui/DownloadPage.js',
  './src/download/ytdlpApi.js',
  './src/player/AudioEngine.js',
  './src/player/Playlist.js',
  './src/player/formats.js',
  './src/player/headphones.js',
  './src/player/id3.js',
  './src/player/playlistIO.js',
  './src/analysis/bpm.js',
  './src/analysis/lufs.js',
  './src/analysis/metrics.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isAppCode =
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('/') ||
      url.pathname.endsWith('/aura-player') ||
      url.pathname.endsWith('/aura-player/'));

  // JS/CSS/HTML: mạng trước — tránh kẹt nút Cobalt / UI mới
  if (isAppCode) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

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
