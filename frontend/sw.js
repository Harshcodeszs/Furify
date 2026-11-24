const CACHE_NAME = "furify-pages-v2";

self.addEventListener("install", (event) => {
  // Make the scanner available on the first offline launch.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add("/identifyfur.html")).catch(() => {}));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept uploads, user-specific API data, or third-party services
  // such as Cloudflare Turnstile and Supabase.
  if (request.method !== "GET" ||
      url.origin !== self.location.origin ||
      url.pathname === "/api/predict" ||
      url.pathname === "/api/guest-history" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/cdn-cgi/")) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque" &&
          !/private|no-store/i.test(response.headers.get("Cache-Control") || "")) {
        event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
