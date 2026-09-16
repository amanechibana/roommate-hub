// Save the app shell and immutable assets only. Household API responses are
// scoped to the selected person in device storage, never a shared HTTP cache.
const SHOPPING_ASSETS = ["/offline-shopping.html", "/offline-shopping.js", "/offline-shopping.css"];
const SHELL_CACHE = "common-ground-shell-v1";
self.addEventListener("install", (event) => event.waitUntil(Promise.all([self.skipWaiting(), caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/", ...SHOPPING_ASSETS])).catch(() => {})])));
self.addEventListener("message", (event) => {
  if (event.data?.type !== "save-shell-assets") return;
  const urls = (event.data.urls || []).filter((value) => { try { const url = new URL(value); return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/"); } catch { return false; } });
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => Promise.allSettled(urls.map((url) => cache.add(url)))));
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(async (response) => {
      // The root shell contains no household records; do not save other navigations.
      if (response.ok && url.pathname === "/") { const cache = await caches.open(SHELL_CACHE); await cache.put("/", response.clone()); }
      return response;
    }).catch(async () => (await caches.match("/")) || Response.error()));
  } else if (url.pathname.startsWith("/_next/static/") || ["/icon-192.png", "/icon-512.png", ...SHOPPING_ASSETS].includes(url.pathname)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async (cache) => (await cache.match(event.request)) || fetch(event.request).then((response) => { if (response.ok) void cache.put(event.request, response.clone()); return response; })));
  }
});
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
