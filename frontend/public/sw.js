/* NorteShopMoz — Service Worker
 *
 * Estratégias:
 *  - Navegações (HTML): network-first, com o que estiver em cache como
 *    alternativa e, em último recurso, uma página offline honesta — antes
 *    qualquer URL falhada mostrava a home em cache, dando a impressão de que a
 *    página pedida existia.
 *  - Estáticos e imagens do próprio domínio: stale-while-revalidate (serve o
 *    que está em cache e atualiza em segundo plano).
 *  - Payloads RSC (`?_rsc=`, usados na navegação do Next) e /api/**: sempre
 *    rede, sem cache. Guardá-los fazia a navegação do cliente receber dados do
 *    build anterior depois de um deploy.
 *  - Em localhost/127.0.0.1 nada é cacheado (dev sempre fresco).
 *
 * `CACHE` tem de ser incrementado quando mudar a estratégia: o `activate`
 * apaga todas as caches com outro nome (é também assim que se limpa a cache
 * antiga, que continha HTML e payloads RSC).
 */
const CACHE = "nsm-static-v3";
const CORE = [
  "/",
  "/manifest.webmanifest",
  "/icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/og.png",
];

const isLocal = ["localhost", "127.0.0.1"].includes(self.location.hostname);

const OFFLINE_HTML = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem ligação · NorteShopMoz</title>
<style>
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
         background: #f8fafc; color: #0f172a; display: grid; place-items: center;
         min-height: 100dvh; padding: 24px; }
  main { max-width: 26rem; text-align: center; }
  h1 { font-size: 1.35rem; margin: 0 0 .5rem; }
  p { color: #475569; line-height: 1.6; margin: 0 0 1.25rem; }
  a, button { font: inherit; font-weight: 600; border-radius: 12px; padding: .7rem 1.1rem;
              text-decoration: none; cursor: pointer; }
  button { background: #1f46e6; color: #fff; border: 0; }
  a { color: #1f46e6; }
</style>
</head>
<body>
<main>
  <h1>Sem ligação</h1>
  <p>Não foi possível carregar esta página. Verifique a sua ligação à internet e tente de novo.</p>
  <p><button type="button" onclick="location.reload()">Tentar de novo</button></p>
  <p><a href="/">Ir para a página inicial</a></p>
</main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (isLocal
      ? Promise.resolve()
      : caches
          .open(CACHE)
          .then((cache) => cache.addAll(CORE))
          .catch(() => {
            /* sem rede no install — a cache enche-se à medida do uso */
          })
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // WebSockets (HMR do dev) — nunca interceptar.
  if (request.headers.get("upgrade")) return;
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  // O próprio SW e as APIs/RSC nunca passam pela cache.
  if (url.pathname === "/sw.js") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.searchParams.has("_rsc")) return;

  // Dev/localhost: passa direto (sem cache).
  if (isLocal) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response(OFFLINE_HTML, {
                status: 503,
                headers: { "Content-Type": "text/html; charset=utf-8" },
              }),
          ),
        ),
    );
    return;
  }

  // Estáticos e imagens: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
