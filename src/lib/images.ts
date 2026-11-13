// Les photos Unsplash sont stockées en 800×600. Sur les petites cartes,
// on demande une version redimensionnée : bien plus léger en 4G.

/**
 * Renvoie l'URL d'une image à la taille voulue (en pixels CSS).
 * La densité d'écran (×2 sur la plupart des téléphones) est prise en compte.
 * Les URL qui ne viennent pas d'Unsplash sont renvoyées telles quelles —
 * en particulier les photos envoyées par la famille (Supabase Storage,
 * `…/storage/v1/object/public/recipe-photos/…`) : elles sont déjà réduites à
 * 1600 px / ~400 Ko dans le navigateur, et le redimensionnement à la volée de
 * Supabase (`/render/image/`) est une option payante, donc on n'y touche pas.
 */
export function sizedImage(url: string, cssWidth: number, cssHeight: number): string {
  try {
    const u = new URL(url)
    if (u.hostname !== 'images.unsplash.com') return url
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
    return url
  }
}
