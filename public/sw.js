// Minimal pass-through Service Worker for reliable PWA installability.
// Does not cache media, WebSockets, or app bundles.

self.addEventListener('install', () => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});
