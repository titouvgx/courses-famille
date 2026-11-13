// Placement des cartes flottantes de la page d'accueil.
// Fonction pure : (taille de la zone, nombre de cartes, graine) → positions.
//
// Objectif : un rendu « en vrac », pas en grille.
//   - positions tirées au hasard dans toute la zone
//   - tailles et inclinaisons différentes pour chaque carte
//   - mais jamais de chevauchement, même en flottant
//   - et tout doit tenir dans l'écran d'un téléphone sans défiler
//
// Méthode : on essaie plusieurs dizaines de placements au hasard (graine = date,
// donc le même toute la journée) et on garde le plus aéré. Si l'écran est trop
// petit pour y arriver, on réduit les cartes ; en dernier recours, on retombe
// sur une disposition en quinconce qui marche toujours.

import { seededRandom } from './random'

export interface FloatSlot {
  /** Position et taille, en px, relatives à la zone. */
  x: number
  y: number
  w: number
  h: number
  /** Inclinaison de base (deg) et oscillation autour (deg). */
  rot: number
  wobble: number
  /** Amplitude du flottement (px). */
  dx: number
  dy: number
  /** Durées des 3 mouvements indépendants (s) : jamais multiples l'une de l'autre. */
  durX: number
  durY: number
  durR: number
  /** Décalages de départ (s, négatifs = déjà en mouvement). */
  delayX: number
  delayY: number
  delayR: number
  /** Profondeur pour la parallaxe (0.4 → 1.3). */
  depth: number
}

export interface FloatLayout {
  slots: FloatSlot[]
  /** true = placement libre réussi ; false = disposition de secours en quinconce. */
  organic: boolean
}

/** Hauteur minimale de la zone (en dessous, la page défile). */
export const MIN_ZONE_HEIGHT = 380

const PAD = 10          // marge intérieure de la zone
const RATIO = 1.1       // hauteur = largeur × RATIO
const MAX_DX = 7        // amplitude horizontale max du flottement
const MAX_DY = 8        // amplitude verticale max
const MAX_ROT = 7       // inclinaison de base max (±)
const WOBBLE = 2        // oscillation de rotation max (±)
// Espace minimum entre deux cartes au repos : deux cartes qui flottent
// l'une vers l'autre se rapprochent au pire de 2 × l'amplitude.
const GAP = 2 * Math.max(MAX_DX, MAX_DY) + 6
const LAYOUT_TRIES = 120 // placements complets essayés
const FILL = 0.54 // part de la zone couverte par les cartes (plus haut = plus grandes, mais moins de désordre possible)
const CARD_TRIES = 160  // positions essayées par carte

interface Rect { x: number; y: number; w: number; h: number }

export function computeFloatLayout(
  width: number,
  height: number,
  count: number,
  seed: string,
): FloatLayout {
  if (width <= 0 || count <= 0) return { slots: [], organic: false }

  const W = width
  const H = Math.max(height, MIN_ZONE_HEIGHT)
  const rand = seededRandom(seed)

  // Taille de référence : une carte « moyenne » qui laisse assez de vide
  // autour pour que le placement libre ait de la marge.
  const area = (W - 2 * PAD) * (H - 2 * PAD)
  const byArea = Math.sqrt((area * FILL) / count / RATIO) // part de la zone occupée par les cartes
  const byWidth = (W - 2 * PAD - GAP) / 2.05               // jamais plus large qu'une demi-zone
  let base = Math.min(byArea, byWidth, 230)

  // Tailles et inclinaisons propres à chaque carte (tirées une fois)
  const scales = Array.from({ length: count }, (_, i) => (i === 0 ? 1.08 : 0.86 + rand() * 0.2))
  const rots = Array.from({ length: count }, () => (rand() - 0.5) * 2 * MAX_ROT)

  for (let shrink = 0; shrink < 7; shrink++) {
    const sizes = scales.map((s) => {
      const w = Math.floor(Math.max(base * s, 96))
      return { w, h: Math.floor(w * RATIO) }
    })
    const best = bestRandomLayout(W, H, sizes, rots, rand)
    if (best) {
      return {
        organic: true,
        slots: best.map((r, i) => makeSlot(r, rots[i], rand)),
      }
    }
    base *= 0.93 // trop serré : on réduit un peu et on recommence
  }

  return { organic: false, slots: fallbackLayout(W, H, count, rots, rand) }
}

/** Boîte occupée par une carte inclinée (+ son oscillation). */
function rotatedBox(w: number, h: number, rotDeg: number) {
  const a = ((Math.abs(rotDeg) + WOBBLE) * Math.PI) / 180
  const bw = w * Math.cos(a) + h * Math.sin(a)
  const bh = w * Math.sin(a) + h * Math.cos(a)
  return { bw, bh, ox: (bw - w) / 2, oy: (bh - h) / 2 }
}

/** Espace libre entre deux boîtes (négatif = chevauchement). */
function separation(a: Rect, b: Rect): number {
  const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w))
  const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
  return Math.max(gx, gy)
}

function bestRandomLayout(
  W: number,
  H: number,
  sizes: { w: number; h: number }[],
  rots: number[],
  rand: () => number,
): Rect[] | null {
  let best: Rect[] | null = null
  let bestScore = -Infinity

  // Ordre de placement : les plus grandes d'abord (plus faciles à caser)
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b].w - sizes[a].w)

  for (let t = 0; t < LAYOUT_TRIES; t++) {
    const boxes: (Rect | null)[] = new Array(sizes.length).fill(null)
    const cards: Rect[] = new Array(sizes.length)
    let ok = true

    for (const i of order) {
      const { w, h } = sizes[i]
      const { bw, bh, ox, oy } = rotatedBox(w, h, rots[i])
      const minX = PAD + ox
      const maxX = W - PAD - w - ox
      const minY = PAD + MAX_DY + oy
      const maxY = H - PAD - MAX_DY - h - oy
      if (maxX < minX || maxY < minY) { ok = false; break }

      let placed = false
      for (let k = 0; k < CARD_TRIES; k++) {
        const x = minX + rand() * (maxX - minX)
        const y = minY + rand() * (maxY - minY)
        const box = { x: x - ox, y: y - oy, w: bw, h: bh }
        if (boxes.every((o) => !o || separation(box, o) >= GAP)) {
          boxes[i] = box
          cards[i] = { x, y, w, h }
          placed = true
          break
        }
      }
      if (!placed) { ok = false; break }
    }
    if (!ok) continue

    // Score : on veut des cartes bien espacées ET réparties sur toute la hauteur
    const bs = boxes as Rect[]
    let minSep = Infinity
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++) minSep = Math.min(minSep, separation(bs[a], bs[b]))
    if (bs.length === 1) minSep = 0
    const top = Math.min(...bs.map((r) => r.y))
    const bottom = Math.max(...bs.map((r) => r.y + r.h))
    const left = Math.min(...bs.map((r) => r.x))
    const right = Math.max(...bs.map((r) => r.x + r.w))
    const coverage = ((bottom - top) / H) * 0.7 + ((right - left) / W) * 0.3
    const score = Math.min(minSep, 60) + coverage * 120

    if (score > bestScore) {
      bestScore = score
      best = cards.map((c) => ({ ...c }))
    }
  }
  return best
}

/** Secours : quinconce sur 2 colonnes, toujours sans chevauchement. */
function fallbackLayout(W: number, H: number, count: number, rots: number[], rand: () => number): FloatSlot[] {
  // Espacement plus large qu'en placement libre : il absorbe l'inclinaison (±2°) et le balancement
  const gap = GAP + 14
  const A = H - 2 * PAD - 2 * MAX_DY
  const hMax = count >= 2 ? Math.min(A, (2 * A - (count - 1) * gap) / (count + 1)) : A
  const w = Math.floor(Math.max(Math.min((W - 2 * PAD - 3 * gap) / 2, hMax / RATIO, 200), 90))
  const h = Math.floor(w * RATIO)
  const step = count > 1 ? (A - h) / (count - 1) : 0
  const colGap = Math.max(gap, (W - 2 * PAD - 2 * w) / 3)
  return Array.from({ length: count }, (_, i) =>
    makeSlot(
      { x: PAD + colGap + (i % 2) * (w + colGap), y: PAD + MAX_DY + gap / 4 + i * step - (gap / 2) * (i / Math.max(count - 1, 1)), w, h },
      Math.max(-2, Math.min(2, rots[i])), // inclinaison réduite : peu de place
      rand,
    ),
  )
}

function makeSlot(r: Rect, rot: number, rand: () => number): FloatSlot {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: r.w,
    h: r.h,
    rot: round1(rot),
    wobble: round1(0.8 + rand() * (WOBBLE - 0.8)),
    dx: round1(3 + rand() * (MAX_DX - 3)),
    dy: round1(4 + rand() * (MAX_DY - 4)),
    // Trois durées sans rapport entre elles → trajectoire qui ne se répète pas
    durX: round1(5.5 + rand() * 4),
    durY: round1(4 + rand() * 3.5),
    durR: round1(6 + rand() * 5),
    delayX: round1(-rand() * 10),
    delayY: round1(-rand() * 10),
    delayR: round1(-rand() * 10),
    depth: round1(0.4 + rand() * 0.9),
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
