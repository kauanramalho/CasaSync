self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("casasync-static-v2").then((cache) =>
      cache.addAll([
        "/",
        "/site.webmanifest",
        "/favicon.svg",
        "/apple-touch-icon.png",
        "/icons/android-chrome-192x192.png",
        "/icons/android-chrome-512x512.png",
        "/icons/apple-touch-icon.png"
      ])
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("casasync-static-") && key !== "casasync-static-v2").map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open("casasync-static-v2").then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  const cacheableDestination = ["font", "image", "script", "style"].includes(request.destination);
  const cacheablePublicFile = url.pathname.endsWith("/site.webmanifest") || url.pathname === "/favicon.ico" || url.pathname === "/favicon.svg";
  if (!cacheableDestination && !cacheablePublicFile) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open("casasync-static-v2").then((cache) => cache.put(request, copy));
        }
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    })
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object") data = {};

  const title = data.title || "CasaSync";
  const options = {
    body: data.body || "Voce tem uma nova notificacao.",
    icon: "/icons/icon-192.png?v=20261008",
    badge: "/icons/favicon-32x32.png?v=20261008",
    tag: data.tag || `casasync-${data.taskId || data.timestamp || Date.now()}`,
    renotify: false,
    timestamp: data.timestamp || Date.now(),
    data: { url: data.url || "/", taskId: data.taskId || null }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let requestedUrl;
  try {
    requestedUrl = new URL(event.notification.data?.url || "/", self.location.origin);
  } catch {
    requestedUrl = new URL("/", self.location.origin);
  }
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : self.location.origin;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
