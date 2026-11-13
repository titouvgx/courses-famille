// Quantités lisibles et additionnables.
//
// Une quantité est stockée en texte dans la liste de courses (« 1,2 kg »,
// « 2 + 3 tranches »). Ce module sait :
//   - lire ce texte en « termes » (nombre + unité)
//   - additionner deux quantités en regroupant les unités compatibles
//     (g + kg, ml + cl + l, unités identiques)
//   - réécrire proprement : 1000 g → 1 kg, 150 cl → 1,5 l, 2.5 → 2,5
// Tout ce qui ne se lit pas (texte libre comme « un peu ») est gardé tel quel.

type Dim = 'mass' | 'volume' | 'other'

interface UnitInfo { dim: Dim; base: string; factor: number }

const UNITS: Record<string, UnitInfo> = {
  mg: { dim: 'mass', base: 'g', factor: 0.001 },
  g: { dim: 'mass', base: 'g', factor: 1 },
  gr: { dim: 'mass', base: 'g', factor: 1 },
  kg: { dim: 'mass', base: 'g', factor: 1000 },
  ml: { dim: 'volume', base: 'ml', factor: 1 },
  cl: { dim: 'volume', base: 'ml', factor: 10 },
  dl: { dim: 'volume', base: 'ml', factor: 100 },
  l: { dim: 'volume', base: 'ml', factor: 1000 },
}

/** Un terme : un nombre dans une unité (unit = '' pour « 3 » tout court). */
interface Term { amount: number; unit: string }

/** Une quantité = des termes additionnables + éventuellement du texte libre. */
export interface Quantity { terms: Term[]; free: string[] }

const empty = (): Quantity => ({ terms: [], free: [] })

function normUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim().replace(/\.$/, '').toLowerCase()
}

/** Ramène un terme à son unité de base (g, ml) si l'unité est connue. */
function toBase(t: Term): Term {
  const info = UNITS[normUnit(t.unit)]
  return info ? { amount: t.amount * info.factor, unit: info.base } : { amount: t.amount, unit: t.unit.trim() }
}

/** Additionne des termes de même unité (après passage en unité de base). */
function mergeTerms(terms: Term[]): Term[] {
  const byUnit = new Map<string, Term>()
  for (const raw of terms) {
    const t = toBase(raw)
    const key = t.unit.toLowerCase()
    const prev = byUnit.get(key)
    if (prev) prev.amount += t.amount
    else byUnit.set(key, { ...t })
  }
  return [...byUnit.values()]
}

/** Nombre au format français : 1,5 — 2 — 0,25 (2 décimales max). */
export function formatNumber(n: number): string {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',')
}

/** Choisit la plus jolie unité : 1500 g → 1,5 kg ; 250 ml → 25 cl ; 1200 ml → 1,2 l. */
function prettyTerm(t: Term): string {
  let { amount, unit } = t
  if (unit === 'g' && amount >= 1000) { amount /= 1000; unit = 'kg' }
  else if (unit === 'ml') {
    if (amount >= 1000) { amount /= 1000; unit = 'l' }
    else if (amount >= 10 && Math.abs(amount % 10) < 1e-9) { amount /= 10; unit = 'cl' }
  }
  const n = formatNumber(amount)
  return unit ? `${n} ${unit}` : n
}

/** Quantité d'un ingrédient de recette, ajustée par un coefficient (portions). */
export function fromIngredient(qty: number | null, unit: string | null, scale = 1): Quantity {
  const u = (unit ?? '').trim()
  if (qty == null || qty === 0) return u ? { terms: [], free: [u] } : empty()
  return { terms: [{ amount: qty * scale, unit: u }], free: [] }
}

/** Lit un texte déjà stocké (« 1,6 kg + 2 », « 4 pavés », « un peu »). */
export function parseQuantity(text: string | null | undefined): Quantity {
  const q = empty()
  if (!text) return q
  for (const part of text.split('+').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
    if (m) q.terms.push({ amount: parseFloat(m[1].replace(',', '.')), unit: m[2].trim() })
    else q.free.push(part)
  }
  return q
}

export function addQuantities(a: Quantity, b: Quantity): Quantity {
  const free = [...a.free]
  for (const f of b.free) if (!free.some((x) => x.toLowerCase() === f.toLowerCase())) free.push(f)
  return { terms: mergeTerms([...a.terms, ...b.terms]), free }
}

/** Texte final, ou null si rien à afficher. */
export function formatQuantity(q: Quantity): string | null {
  const parts = [...mergeTerms(q.terms).map(prettyTerm), ...q.free]
  return parts.length ? parts.join(' + ') : null
}

/** Raccourci pour l'affichage d'un ingrédient de recette. */
export function formatIngredient(qty: number | null, unit: string | null, scale = 1): string {
  return formatQuantity(fromIngredient(qty, unit, scale)) ?? ''
}

/** Texte comparable : minuscules, sans accents (NFD), espaces superflus retirés. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Clé de regroupement d'un ingrédient : minuscules, sans accents ni espaces superflus. */
export function ingredientKey(name: string): string {
  return normalizeText(name)
}
