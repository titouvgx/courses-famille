// Les photos Unsplash sont stockées en 800×600. Sur les petites cartes,
// on demande une version redimensionnée : bien plus léger en 4G.

/**
 * Renvoie l'URL d'une image à la taille voulue (en pixels CSS).
 * La densité d'écran (×2 sur la plupart des téléphones) est prise en compte.
 * Les URL qui ne viennent pas d'Unsplash sont renvoyées telles quelles.
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
