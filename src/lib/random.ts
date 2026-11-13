// Hasard reproductible : une même « graine » (ex. la date du jour)
// donne toujours la même suite de nombres. Pratique pour que toute la
// famille voie les mêmes recettes du jour, sans rien stocker en base.

/** Transforme une chaîne en entier 32 bits (hash FNV-1a). */
export function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Générateur « mulberry32 » : renvoie une fonction qui donne un nombre entre 0 et 1. */
export function seededRandom(seed: string | number): () => number {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Tire `count` éléments distincts au hasard, de façon reproductible
 * (mélange de Fisher-Yates partiel). Ne modifie pas le tableau d'origine.
 */
export function pickSeeded<T>(items: readonly T[], count: number, seed: string): T[] {
  const arr = [...items]
  const rand = seededRandom(seed)
  const n = Math.min(Math.max(count, 0), arr.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (arr.length - i))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}
