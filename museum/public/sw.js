// art.kacperochnik.eu used to be the lab, an installable app whose service worker kept serving the
// cached lab here. Browsers re-fetch this file, find it changed, and install this one, which clears
// the lab's caches, unregisters itself and reloads open tabs into the museum.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: "window" })) client.navigate(client.url);
  })());
});
