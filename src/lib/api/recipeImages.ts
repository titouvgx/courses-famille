// Photos de recettes — compression dans le navigateur + Supabase Storage.
//
// Les photos de téléphone font 3 à 12 Mo : on les réduit AVANT l'envoi
// (1600 px max de côté, WebP ou JPEG, ~400 Ko max). Le fichier est rangé
// sous `<recipeId>/<uuid>.<ext>` dans le bucket public `recipe-photos`
// (voir supabase/migrations/20261113120000_recipe_photos_storage.sql).
// Nom unique à chaque envoi : l'URL ne change jamais de contenu, elle peut
// donc être mise en cache très longtemps.

import { supabase } from '../supabase'

export const RECIPE_PHOTOS_BUCKET = 'recipe-photos'

/** Taille maximale acceptée AVANT compression (photo brute du téléphone). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
/** Côté le plus long après redimensionnement. */
const MAX_SIDE = 1600
/** Poids visé après compression. */
const TARGET_BYTES = 400 * 1024
/** Plafond dur (doit rester ≤ file_size_limit du bucket, 2 Mo). */
const HARD_MAX_BYTES = 1.5 * 1024 * 1024

/** Ce qu'il faut faire de la photo lors de l'enregistrement d'une recette. */
export type PhotoChange =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'replace'; image: CompressedImage }

export interface CompressedImage {
  blob: Blob
  /** 'image/webp' ou 'image/jpeg' */
  type: string
  ext: 'webp' | 'jpg'
  width: number
  height: number
}

/** Erreur dont le message est déjà rédigé pour l'utilisateur (en français). */
export class PhotoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoError'
  }
}

/**
 * La recette est enregistrée, mais la photo n'a pas pu suivre.
 * On ne relance pas l'enregistrement complet (sinon : recette en double).
 */
export class PhotoUploadError extends Error {
  recipeId: string
  constructor(recipeId: string, cause: unknown) {
    super(
      'La recette est enregistrée, mais la photo n’a pas pu être envoyée. Réessaie depuis « Modifier ».',
    )
    this.name = 'PhotoUploadError'
    this.recipeId = recipeId
    ;(this as { cause?: unknown }).cause = cause
  }
}

// ────────── Compression ──────────

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }

/** Décode l'image en respectant l'orientation EXIF. */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      // Option non gérée ou format inconnu : on retente avec <img>
    }
  }
  // Repli : <img> applique l'orientation EXIF par défaut (image-orientation: from-image)
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Le navigateur sait-il encoder en WebP ? (Safari renvoie un PNG à la place.)
// Testé une seule fois sur un canvas de 1 px : évite d'encoder des PNG lourds
// pour rien à chaque essai de qualité.
let webpSupport: boolean | undefined
async function supportsWebp(): Promise<boolean> {
  if (webpSupport !== undefined) return webpSupport
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const b = await toBlob(c, 'image/webp', 0.8)
  webpSupport = b?.type === 'image/webp'
  return webpSupport
}

/**
 * Prépare une photo pour l'envoi : vérifie, redimensionne, compresse.
 * Lève une PhotoError (message en français) si la photo est inutilisable.
 */
export async function compressRecipeImage(file: File): Promise<CompressedImage> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new PhotoError('Cette photo est trop lourde (plus de 25 Mo). Choisis-en une autre.')
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw new PhotoError('Ce fichier n’est pas une image.')
  }

  let decoded: Decoded
  try {
    decoded = await decode(file)
  } catch {
    if (isHeic(file)) {
      throw new PhotoError(
        'Ce navigateur ne sait pas lire les photos HEIC. Choisis une photo JPEG, '
          + 'ou règle l’appareil photo sur « Le plus compatible ».',
      )
    }
    throw new PhotoError('Impossible de lire cette image. Essaie avec une autre photo.')
  }

  try {
    if (!decoded.width || !decoded.height) {
      throw new PhotoError('Impossible de lire cette image. Essaie avec une autre photo.')
    }

    // Plusieurs tentatives : on baisse la qualité, puis la taille, jusqu'à passer sous la cible.
    const sides = [MAX_SIDE, 1280, 1024]
    const qualities = [0.82, 0.72, 0.62]
    let best: CompressedImage | null = null

    for (const side of sides) {
      const scale = Math.min(1, side / Math.max(decoded.width, decoded.height))
      const w = Math.max(1, Math.round(decoded.width * scale))
      const h = Math.max(1, Math.round(decoded.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new PhotoError('Ton navigateur ne permet pas de préparer la photo.')
      // Fond opaque : une image PNG transparente ne devient pas noire en JPEG
      ctx.fillStyle = '#10264A'
      ctx.fillRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(decoded.source, 0, 0, w, h)

      // Safari (et anciens navigateurs) : pas d'encodeur WebP → JPEG directement
      const type = (await supportsWebp()) ? 'image/webp' : 'image/jpeg'
      for (const q of qualities) {
        const blob = await toBlob(canvas, type, q)
        if (!blob) continue
        const candidate: CompressedImage = {
          blob,
          type,
          ext: type === 'image/webp' ? 'webp' : 'jpg',
          width: w,
          height: h,
        }
        if (!best || blob.size < best.blob.size) best = candidate
        if (blob.size <= TARGET_BYTES) {
          canvas.width = canvas.height = 0 // libérer la mémoire du canvas (iOS)
          return candidate
        }
      }
      // libérer la mémoire du canvas (important sur iOS)
      canvas.width = canvas.height = 0
    }

    if (best && best.blob.size <= HARD_MAX_BYTES) return best
    throw new PhotoError('Impossible de réduire suffisamment cette photo. Essaie avec une autre.')
  } finally {
    decoded.close()
  }
}

// ────────── Stockage ──────────

function newUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Repli (navigateurs anciens / contexte non sécurisé)
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x: number) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/**
 * Envoie la photo sous `<recipeId>/<uuid>.<ext>` et renvoie son URL publique.
 * La recette doit déjà exister (la règle RLS vérifie le foyer propriétaire).
 */
export async function uploadRecipeImage(recipeId: string, image: CompressedImage): Promise<string> {
  if (!supabase) throw new Error('Supabase non configuré')
  const path = `${recipeId}/${newUuid()}.${image.ext}`
  const bucket = supabase.storage.from(RECIPE_PHOTOS_BUCKET)
  const { error } = await bucket.upload(path, image.blob, {
    contentType: image.type,
    cacheControl: '31536000', // 1 an : le nom est unique, le contenu ne change jamais
    upsert: false,
  })
  if (error) throw uploadErrorToFrench(error)
  return bucket.getPublicUrl(path).data.publicUrl
}

function uploadErrorToFrench(error: unknown): PhotoError {
  const e = error as { message?: string; statusCode?: string | number; status?: number }
  const status = String(e.statusCode ?? e.status ?? '')
  const msg = (e.message ?? '').toLowerCase()
  if (status === '413' || msg.includes('too large') || msg.includes('size')) {
    return new PhotoError('La photo est trop lourde pour être envoyée.')
  }
  if (msg.includes('mime')) {
    return new PhotoError('Format de photo refusé par le serveur.')
  }
  if (status === '403' || status === '401' || msg.includes('row-level security') || msg.includes('policy')) {
    return new PhotoError('Tu n\u2019as pas le droit de modifier la photo de cette recette.')
  }
  if (msg.includes('bucket not found')) {
    return new PhotoError('Le stockage des photos n\u2019est pas encore configuré.')
  }
  return new PhotoError('La photo n\u2019a pas pu être envoyée. Vérifie ta connexion et réessaie.')
}

/**
 * Chemin dans le bucket si l'URL est une photo de NOTRE bucket, sinon null
 * (URL Unsplash ou autre : on n'y touche jamais).
 */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (!base) return null
  try {
    const u = new URL(url)
    if (u.origin !== new URL(base).origin) return null
    const prefix = `/storage/v1/object/public/${RECIPE_PHOTOS_BUCKET}/`
    if (!u.pathname.startsWith(prefix)) return null
    const path = decodeURIComponent(u.pathname.slice(prefix.length))
    return path && !path.includes('..') ? path : null
  } catch {
    return null
  }
}

/** true si l'URL pointe vers notre bucket de photos. */
export function isStoredRecipeImage(url: string | null | undefined): boolean {
  return storagePathFromUrl(url) !== null
}

/**
 * Supprime la photo du stockage si elle vient de notre bucket.
 * Ne lève jamais d'erreur : au pire un fichier orphelin reste (sans impact pour
 * l'utilisateur), ce n'est pas une raison pour faire échouer l'enregistrement.
 */
export async function deleteRecipeImage(url: string | null | undefined): Promise<void> {
  const path = storagePathFromUrl(url)
  if (!path || !supabase) return
  try {
    const { error } = await supabase.storage.from(RECIPE_PHOTOS_BUCKET).remove([path])
    if (error) console.warn('Photo non supprimée du stockage :', error.message)
  } catch (e) {
    console.warn('Photo non supprimée du stockage :', e)
  }
}
