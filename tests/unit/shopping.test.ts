// Tests de la génération et de la mise à jour de la liste de courses,
// et du classement « Qu'est-ce qu'on mange ? » (calculs purs, sans base de données)
import { describe, expect, it } from 'vitest'
import { aggregateSlots, buildRegeneratedItems, type PlannedSlot } from '../../src/lib/api/shopping'
import { isProbablyAtHome, rankByFridge } from '../../src/lib/api/household'
import type { PantryItem, ShoppingListItem } from '../../src/lib/types'

const FRUITS = 'cat-fruits'
const recette = (id: string, portions: number, ings: [string, number | null, string | null][]) => ({
  id,
  default_portions: portions,
  recipe_ingredients: ings.map(([name, quantity, unit]) => ({ name, quantity, unit, shopping_category_id: FRUITS })),
})

describe('aggregateSlots : du planning à la liste', () => {
  it('additionne un même ingrédient de plusieurs recettes, ajusté aux portions', () => {
    const slots: PlannedSlot[] = [
      { portions: 4, recipes: recette('r1', 4, [['Tomates', 500, 'g'], ['Sel', null, 'pincée']]) },
      // recette pour 2 servie à 4 → quantités × 2
      { portions: 4, recipes: recette('r2', 2, [['tomates', 400, 'g'], ['Oignon', 1, null]]) },
    ]
    const agg = aggregateSlots(slots)
    expect(agg.size).toBe(3)
    const tomates = agg.get('tomates')!
    expect(tomates.name).toBe('Tomates') // le premier nom rencontré est gardé
    expect(tomates.source_recipe_id).toBe('r1')
    expect(tomates.quantity.terms).toEqual([{ amount: 1300, unit: 'g' }])
  })
  it('ignore un créneau sans recette et prend 4 portions par défaut', () => {
    const agg = aggregateSlots([
      { portions: 2, recipes: null },
      { portions: 2, recipes: { ...recette('r3', 0, [['Riz', 400, 'g']]), default_portions: null } },
    ])
    expect(agg.get('riz')!.quantity.terms).toEqual([{ amount: 200, unit: 'g' }])
  })
})

describe('buildRegeneratedItems : mise à jour sans perte', () => {
  const agg = aggregateSlots([
    { portions: 4, recipes: recette('r1', 4, [['Tomates', 500, 'g'], ['Lait', 1, 'l'], ['Beurre', 50, 'g']]) },
  ])
  const base = { checked_by: null, checked_at: null, needed: false }
  const current = [
    { ...base, name: 'tomates', is_extra: false, checked: true, checked_by: 'u1', checked_at: '2026-11-13T10:00:00Z', position: 0 },
    { ...base, name: 'Lait', is_extra: false, checked: false, needed: true, position: 1 },
    { ...base, name: 'Pain', is_extra: true, checked: false, position: 7 }, // ajouté à la main
  ]
  const fresh = buildRegeneratedItems('liste-1', agg, current)

  it('recalcule tous les articles du planning, jamais les ajouts à la main', () => {
    expect(fresh.map((i) => i.name)).toEqual(['Tomates', 'Lait', 'Beurre'])
    expect(fresh.every((i) => i.is_extra === false && i.shopping_list_id === 'liste-1')).toBe(true)
  })
  it('garde coché ce qui était coché (même si la casse diffère), avec qui et quand', () => {
    const t = fresh.find((i) => i.name === 'Tomates')!
    expect(t.checked).toBe(true)
    expect(t.checked_by).toBe('u1')
    expect(t.checked_at).toBe('2026-11-13T10:00:00Z')
    expect(fresh.find((i) => i.name === 'Beurre')!.checked).toBe(false)
  })
  it('garde « il en manque »', () => {
    expect(fresh.find((i) => i.name === 'Lait')!.needed).toBe(true)
    expect(fresh.find((i) => i.name === 'Beurre')!.needed).toBe(false)
  })
  it('numérote après les ajouts à la main', () => {
    expect(fresh.map((i) => i.position)).toEqual([8, 9, 10])
  })
  it('n\'envoie pas la colonne « needed » si personne ne l\'utilise (base sans migration 13)', () => {
    const sans = buildRegeneratedItems('liste-1', agg, current.map((i) => ({ ...i, needed: false })))
    expect(sans.every((i) => !('needed' in i))).toBe(true)
  })
  it('écrit les quantités au format français', () => {
    expect(fresh.find((i) => i.name === 'Lait')!.quantity).toBe('1 l')
  })
})

describe('placard : « Sûrement déjà à la maison »', () => {
  const pantry = [{ id: 'p1', family_id: 'f', name: 'sel' }] as unknown as PantryItem[]
  const item = (o: Partial<ShoppingListItem>) =>
    ({ name: 'Sel fin', is_extra: false, checked: false, needed: false, ...o }) as ShoppingListItem
  it('range un article du planning qui est au placard', () => {
    expect(isProbablyAtHome(item({}), pantry)).toBe(true)
  })
  it('sauf s\'il a été ajouté à la main, coché ou marqué « il en manque »', () => {
    expect(isProbablyAtHome(item({ is_extra: true }), pantry)).toBe(false)
    expect(isProbablyAtHome(item({ checked: true }), pantry)).toBe(false)
    expect(isProbablyAtHome(item({ needed: true }), pantry)).toBe(false)
    expect(isProbablyAtHome(item({ name: 'Céleri' }), pantry)).toBe(false)
  })
})

describe('rankByFridge : « Qu\'est-ce qu\'on mange ? »', () => {
  const ings = [
    { recipe_id: 'omelette', name: 'Œufs' }, { recipe_id: 'omelette', name: 'Sel' },
    { recipe_id: 'quiche', name: 'Oeufs' }, { recipe_id: 'quiche', name: 'Lardons' }, { recipe_id: 'quiche', name: 'Crème' },
    { recipe_id: 'pates', name: 'Pâtes' }, { recipe_id: 'pates', name: 'Sel' },
  ]
  it('classe d\'abord les recettes où il manque le moins, placard compté', () => {
    const r = rankByFridge(ings, ['oeuf'], ['sel'])
    expect(r.map((m) => m.recipeId)).toEqual(['omelette', 'quiche'])
    expect(r[0].missing).toEqual([])
    expect(r[1].missing).toEqual(['Lardons', 'Crème'])
  })
  it('écarte une recette qui n\'utilise rien du frigo (le sel du placard ne suffit pas)', () => {
    expect(rankByFridge(ings, ['oeuf'], ['sel']).some((m) => m.recipeId === 'pates')).toBe(false)
    expect(rankByFridge(ings, [], ['sel'])).toEqual([])
  })
})
