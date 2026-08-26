/* NorteShopMoz — Service Worker
 * Cache-first para estáticos, network-first para navegações.
 * Em localhost (desenvolvimento) não cacheia nada — evita cache obsoleto.
 * As rotas /api/* e os WebSockets (HMR) nunca são interceptados.
 */
const CACHE = "nsm-shell-v1";
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/og.png",
];

// Em localhost/127.0.0.1 passa direto (sem cache) — dev fica sempre fresco.
const isLocal = ["localhost", "127.0.0.1"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  if (isLocal) return self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // WebSockets (HMR do dev) — nunca interceptar.
  if (request.headers.get("upgrade")) return;
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  // Dev/localhost: passa direto (sem cache).
  if (isLocal) return;

  // Navegações: network-first com fallback ao cache (offline).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  // Restantes GET: cache-first, revalida em segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
