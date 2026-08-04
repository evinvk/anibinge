/* Anibinge service worker - hand-written, stable.
 * Replaces the next-pwa generated worker, which precached
 * /_next/app-build-manifest.json (404 on prod) and broke every install,
 * leaving stale broken workers in control of clients.
 * This worker does NOT intercept requests and caches nothing. */
self.skipWaiting();

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = event.data ? { title: event.data.text() } : {};
  }
  const title = data.title || "Anibinge";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    data: data.url || "/",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if (new URL(client.url).origin === location.origin) {
          await client.focus();
          if (client.navigate) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
