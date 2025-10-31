// Service Worker to handle cache busting and force reload on new deployments
const CACHE_VERSION = 'v1-' + Date.now();

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_VERSION)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Don't cache, always fetch fresh
  event.respondWith(
    fetch(event.request).catch(() => {
      // If fetch fails, try cache as fallback
      return caches.match(event.request);
    })
  );
});
