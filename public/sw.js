// Service Worker — Courses en famille
// Stratégie : cache-first pour les assets statiques, network-first pour les API.

// Changer ce nom vide l'ancien cache chez tout le monde au prochain chargement
const CACHE_NAME = 'courses-v3'
// Photos de recettes : cache séparé et plafonné (les noms de fichiers sont uniques,
// une photo ne change jamais → on peut servir la copie locale en priorité)
const IMAGE_CACHE = 'courses-images-v1'
const IMAGE_CACHE_MAX = 150

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
          .filter((name) => name !== CACHE_NAME && name !== IMAGE_CACHE)
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

  // Photos de recettes (Supabase Storage public, Unsplash) : cache d'abord.
  // Utile hors connexion et en 4G ; le cache est limité à IMAGE_CACHE_MAX photos.
  const isRecipePhoto =
    (url.hostname.includes('supabase') && url.pathname.includes('/storage/v1/object/public/')) ||
    url.hostname === 'images.unsplash.com'
  if (request.method === 'GET' && isRecipePhoto) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const key = request.url
        const cached = await cache.match(key)
        if (cached) return cached
        // On redemande l'image en mode CORS (Supabase et Unsplash l'autorisent) :
        // une réponse « opaque » compterait ~7 Mo de quota par image dans Chrome.
        let response
        try {
          response = await fetch(new Request(key, { mode: 'cors', credentials: 'omit' }))
        } catch {
          return fetch(request) // CORS refusé : on charge normalement, sans mettre en cache
        }
        if (response.ok) {
          cache.put(key, response.clone()).then(() => trimCache(cache, IMAGE_CACHE_MAX))
        }
        return response
      })
    )
    return
  }

  // Ne pas intercepter le reste de Supabase (API + realtime) : données toujours fraîches
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


/** Garde au plus `max` entrées dans le cache (supprime les plus anciennes). */
async function trimCache(cache, max) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}
