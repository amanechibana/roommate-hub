// The offline shell contains no household data. Only these three public
// assets are cached; signed-in pages and API responses stay network-served.
const SHOPPING_SHELL = "common-ground-shopping-shell-v1";
const SHOPPING_ASSETS = [
  "/offline-shopping.html",
  "/offline-shopping.js",
  "/offline-shopping.css",
];
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches.open(SHOPPING_SHELL).then((cache) => cache.addAll(SHOPPING_ASSETS)),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !SHOPPING_ASSETS.includes(url.pathname)
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(SHOPPING_SHELL)
              .then((cache) => cache.put(url.pathname, copy)),
          );
        }
        return response;
      })
      .catch(() =>
        caches
          .match(url.pathname)
          .then((response) => response || Response.error()),
      ),
  );
});
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Common Ground", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "common-ground",
      data: { url: data.url || "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows)
          if ("focus" in client) return client.focus();
        return self.clients.openWindow(url);
      }),
  );
});
