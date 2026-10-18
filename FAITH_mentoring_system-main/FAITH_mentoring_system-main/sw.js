// Astra Mentoring System — service worker
//
// Strategy: network-first, cache as fallback, for same-origin static
// assets and page navigations only. API calls (this app's own /api/*, and
// anything hitting the backend's separate port, e.g. FILE_BASE_URL in
// config.js) are NEVER cached — attendance, sessions, evaluations, proof
// files, etc. must always be current. This only adds "load the last-seen
// page shell when offline"; it never risks serving stale application data.

const CACHE_NAME = "astra-mentoring-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only ever handle same-origin GET requests. Everything else (API calls,
  // cross-origin, non-GET writes) goes straight to the network untouched.
  const url = new URL(req.url);
  const isApiCall = url.pathname.startsWith("/api/") || url.port === "5076";
  if (req.method !== "GET" || url.origin !== self.location.origin || isApiCall) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req))
  );
});
