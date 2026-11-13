import { recipeImageSrc } from './api/recipeImages'

// Les photos Unsplash sont stockées en 800×600. Sur les petites cartes,
// on demande une version redimensionnée : bien plus léger en 4G.

/**
 * Renvoie l'adresse d'une photo de recette à la taille voulue (en pixels CSS),
 * ou null si la valeur enregistrée n'est pas une photo autorisée (notre
 * stockage ou Unsplash) : dans ce cas, ne rien afficher.
 * La densité d'écran (×2 sur la plupart des téléphones) est prise en compte.
 * Les photos envoyées par la famille (notre stockage Supabase) sont renvoyées
 * telles quelles : elles sont déjà réduites à 1600 px / ~400 Ko dans le
 * navigateur, et le redimensionnement à la volée de Supabase (`/render/image/`)
 * est une option payante.
 */
export function sizedImage(value: string | null | undefined, cssWidth: number, cssHeight: number): string | null {
  const src = recipeImageSrc(value)
  if (!src) return null
  try {
    const u = new URL(src)
    if (u.hostname !== 'images.unsplash.com') return src
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)
    // Arrondi à 50 px près pour profiter du cache du CDN
    const round = (n: number) => Math.ceil((n * dpr) / 50) * 50
    u.searchParams.set('w', String(round(cssWidth)))
    u.searchParams.set('h', String(round(cssHeight)))
    u.searchParams.set('fit', 'crop')
    u.searchParams.set('auto', 'format')
    u.searchParams.set('q', '75')
    return u.toString()
  } catch {
    return null
  }
}
