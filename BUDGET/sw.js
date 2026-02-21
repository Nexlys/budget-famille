const CACHE_NAME = 'budget-duo-v2'; // On passe en version 2 !
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Installation : on force la mise à jour
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Nettoyage de l'ancien cache (la version bloquée)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
  self.clients.claim();
});

// Stratégie "Réseau en priorité, puis Cache"
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});