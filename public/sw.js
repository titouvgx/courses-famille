// Service Worker — Courses en famille
// Stratégie : cache-first pour les assets statiques, network-first pour les API.

// Changer ce nom vide l'ancien cache chez tout le monde au prochain chargement
const CACHE_NAME = 'courses-v2'

// Assets à pré-cacher lors de l'installation
const PRECACHE_URLS = [
  './',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
]

// ────────── Install ──────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  // Activer immédiatement sans attendre les onglets ouverts
  self.skipWaiting()
})

// ────────── Activate ──────────
self.addEventListener('activate', (event) => {
  // Supprimer les anciens caches
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  // Prendre le contrôle de tous les onglets
  self.clients.claim()
})

// ────────── Fetch ──────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Ne pas intercepter les requêtes Supabase (API + realtime)
  if (url.hostname.includes('supabase')) return

  // Ne pas intercepter les requêtes non-GET
  if (request.method !== 'GET') return

  // Google Fonts : cache-first (ne changent jamais)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // Assets statiques (JS, CSS, images) : stale-while-revalidate
  if (
    url.pathname.match(/\.(js|css|png|svg|woff2?)$/) ||
    url.pathname.includes('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            }
            return response
          })
          .catch(() => cached)

        return cached || fetchPromise
      })
    )
    return
  }

  // Navigation (HTML) : network-first, fallback sur cache
  if (request.mode === 'navigate') {
    event.respondWith(
      // cache: 'no-cache' → on redemande toujours au serveur si la page a changé.
      // Sans ça, le cache HTTP du navigateur (10 min sur GitHub Pages) renvoyait
      // l'ancienne page, qui chargeait l'ancien code après un déploiement.
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./')))
    )
    return
  }
})
