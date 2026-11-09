const CACHE = "gaucho-origins-v3";
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/calc.js",
  "./data/catalog.json",
  "./data/mapeamento.csv",
  "./data/regioes.csv",
  "./data/personagens.csv",
  "./manifest.webmanifest",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

async function putAll(urls) {
  const cache = await caches.open(CACHE);
  for (let index = 0; index < urls.length; index += 24) {
    await Promise.all(urls.slice(index, index + 24).map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response && response.ok) await cache.put(url, response);
      } catch (error) {}
    }));
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    await putAll(SHELL);
    try {
      const catalog = await (await fetch("./data/catalog.json", { cache: "reload" })).json();
      const icons = (catalog.icons || []).map((icon) => `./${String(icon.path || "").replace(/^\.\//, "")}`).filter(Boolean);
      await putAll(icons);
    } catch (error) {}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && fresh.type === "basic") await cache.put(request, fresh.clone());
      return fresh;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true })
        || await cache.match(url.pathname);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
      throw error;
    }
  })());
});
