"use strict";

const CACHE_PREFIX = "lsqy-vocabulary-learning-";
const CACHE_NAME = `${CACHE_PREFIX}20260912-4`;
const APP_SHELL = [
  "./",
  "./words.json",
  "./paper-words.json",
  "./manifest.webmanifest",
  "/css/toolkit.css",
  "/css/vocabulary-learning.css",
  "/js/tools-common.js",
  "/js/vocabulary-core.mjs",
  "/js/vocabulary-learning.mjs",
  "/img/favicon.ico"
];
const DATA_PATHS = new Set([
  new URL("./words.json", self.location).pathname,
  new URL("./paper-words.json", self.location).pathname
]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(APP_SHELL))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request)
      .then(response => {
        const copy = response.clone();
        return caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => response);
      })
      .catch(() => caches.match("./")));
    return;
  }

  if (DATA_PATHS.has(url.pathname)) {
    event.respondWith(fetch(request)
      .then(response => {
        if (!response.ok) return response;
        const copy = response.clone();
        return caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => response);
      })
      .catch(() => caches.match(request).then(cached => cached || Promise.reject(new Error("词库未缓存")))));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (!response.ok) return response;
    const copy = response.clone();
    return caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => response);
  })));
});
