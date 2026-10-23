// Minimal service worker. Its only job is to make the app installable (Android
// Chrome "Install app" + desktop address-bar install both require a registered
// SW with a fetch handler). It is a network pass-through — it does NOT cache, so
// there are no stale-asset problems for the SPA.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// A fetch handler must exist for installability. Not calling respondWith() means
// the browser handles every request normally (no interception, no caching).
self.addEventListener('fetch', () => {});
