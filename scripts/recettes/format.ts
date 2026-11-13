// Format et règles des recettes livrées avec l'appli (supabase/recettes/*.json).
// Utilisé par le générateur de migration (generer.ts) et par les tests
// (tests/unit/recettes.test.ts). Aucune dépendance : exécutable par Node seul.

export const CATEGORIES = ['Entrée', 'Plat', 'Accompagnement', 'Dessert'] as const

/** Rayons de courses, exactement comme dans seed_categories.sql */
export const RAYONS = [
  'Fruits & légumes',
  'Viandes & poissons',
  'Produits laitiers & œufs',
  'Épicerie salée',
  'Épicerie sucrée',
  'Condiments & épices',
  'Surgelés',
  'Boissons',
  'Hygiène & maison',
  'Autre',
] as const

/**
 * Unités autorisées : celles de known_ingredients (singulier, pour que la liste
 * de courses additionne « 2 pièce » + « 3 pièce ») + g/kg/cl/l/ml que
 * quantities.ts sait convertir.
 */
export const UNITES = [
  'g', 'kg', 'ml', 'cl', 'l',
  'pièce', 'gousse', 'tranche', 'feuille', 'branche', 'botte', 'filet',
  'c. à soupe', 'c. à café', 'pincée', 'cube', 'sachet', 'boîte', 'pot',
] as const

export interface Ingredient {
  name: string
  /** null = « selon le goût » (sel, poivre…) */
  quantity: number | null
  unit: (typeof UNITES)[number] | null
  rayon: (typeof RAYONS)[number]
}

export interface Recette {
  /** Corrections seulement : titre actuel de la recette de démo à corriger */
  original_title?: string
  title: string
  category: (typeof CATEGORIES)[number]
  /** Temps total en minutes (préparation + cuisson), HORS repos / marinade / frigo,
   *  qui sont indiqués dans les étapes. */
  prep_time_min: number
  default_portions: number
  ingredients: Ingredient[]
  steps: string[]
  /** Pages consultées pour vérifier les ordres de grandeur (non enregistrées en base) */
  sources: string[]
}

export interface FichierRecettes {
  /** 'corrections' : remplace le contenu des recettes de démo ; 'nouvelles' : ajoute */
  kind: 'corrections' | 'nouvelles'
  recettes: Recette[]
}

/** Clé de comparaison des titres : minuscules, sans accents, espaces normalisés. */
export function cleTitre(t: string): string {
  return t
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Renvoie la liste des problèmes (vide = fichier valide). */
export function valider(fichier: FichierRecettes, nomFichier: string): string[] {
  const err: string[] = []
  const e = (r: string, m: string) => err.push(`${nomFichier} › ${r} : ${m}`)
  if (fichier.kind !== 'corrections' && fichier.kind !== 'nouvelles') err.push(`${nomFichier} : kind invalide`)
  if (!Array.isArray(fichier.recettes) || fichier.recettes.length === 0) err.push(`${nomFichier} : aucune recette`)

  const titres = new Set<string>()
  for (const r of fichier.recettes ?? []) {
    const t = r.title ?? '(sans titre)'
    if (!r.title || r.title.trim() !== r.title || r.title.length > 80) e(t, 'titre vide, trop long ou avec espaces autour')
    if (titres.has(cleTitre(t))) e(t, 'titre en double dans le fichier')
    titres.add(cleTitre(t))
    if (fichier.kind === 'corrections' && !r.original_title) e(t, 'original_title manquant (correction)')
    if (fichier.kind === 'nouvelles' && r.original_title) e(t, 'original_title interdit pour une nouvelle recette')
    if (!CATEGORIES.includes(r.category)) e(t, `catégorie inconnue « ${r.category} »`)
    if (!Number.isInteger(r.prep_time_min) || r.prep_time_min < 5 || r.prep_time_min > 600) e(t, 'prep_time_min hors de 5–600')
    if (!Number.isInteger(r.default_portions) || r.default_portions < 1 || r.default_portions > 12) e(t, 'default_portions hors de 1–12')

    if (!Array.isArray(r.ingredients) || r.ingredients.length < 2 || r.ingredients.length > 25) e(t, 'entre 2 et 25 ingrédients')
    const noms = new Set<string>()
    for (const i of r.ingredients ?? []) {
      const n = i.name ?? ''
      if (!n || n.trim() !== n || n.length > 60) e(t, `ingrédient « ${n} » : nom vide, trop long ou avec espaces`)
      if (n && n[0] !== n[0].toUpperCase()) e(t, `ingrédient « ${n} » : majuscule initiale attendue`)
      if (noms.has(cleTitre(n))) e(t, `ingrédient « ${n} » en double`)
      noms.add(cleTitre(n))
      if (!RAYONS.includes(i.rayon)) e(t, `ingrédient « ${n} » : rayon inconnu « ${i.rayon} »`)
      if (i.unit !== null && !UNITES.includes(i.unit)) e(t, `ingrédient « ${n} » : unité inconnue « ${i.unit} »`)
      if (i.quantity === null) {
        if (i.unit !== null && i.unit !== 'pincée') e(t, `ingrédient « ${n} » : unité sans quantité`)
      } else if (typeof i.quantity !== 'number' || !(i.quantity > 0) || i.quantity > 5000) {
        e(t, `ingrédient « ${n} » : quantité invalide`)
      } else if (i.unit === 'g' && i.quantity > 3000) {
        e(t, `ingrédient « ${n} » : plus de 3 kg, écrire en kg`)
      }
    }

    if (!Array.isArray(r.steps) || r.steps.length < 2 || r.steps.length > 15) e(t, 'entre 2 et 15 étapes')
    for (const s of r.steps ?? []) {
      if (typeof s !== 'string' || !s.trim() || s.trim() !== s || s.length > 600) e(t, `étape vide, trop longue ou avec espaces : « ${String(s).slice(0, 40)} »`)
    }
    if (!Array.isArray(r.sources) || r.sources.length < 1 || r.sources.some((u) => !/^https:\/\/\S+$/.test(u))) {
      e(t, 'au moins une source https (vérification des quantités)')
    }
  }
  return err
}
