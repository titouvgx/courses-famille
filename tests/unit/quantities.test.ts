// Tests des calculs de quantités (src/lib/quantities.ts)
import { describe, expect, it } from 'vitest'
import {
  addQuantities, formatIngredient, formatNumber, formatQuantity, fromIngredient,
  ingredientKey, matchKey, normalizeText, parseQuantity, sameProduct,
} from '../../src/lib/quantities'

const add = (...texts: string[]) =>
  formatQuantity(texts.map(parseQuantity).reduce(addQuantities, { terms: [], free: [] }))

describe('formatNumber : format français', () => {
  it('écrit les décimales avec une virgule, 2 au maximum', () => {
    expect(formatNumber(1.5)).toBe('1,5')
    expect(formatNumber(2)).toBe('2')
    expect(formatNumber(0.333333)).toBe('0,33')
    expect(formatNumber(0.1 + 0.2)).toBe('0,3')
  })
})

describe('additions et conversions', () => {
  it('additionne g et kg et passe en kg à partir de 1000 g', () => {
    expect(add('500 g', '0,7 kg')).toBe('1,2 kg')
    expect(add('250 g', '250 g')).toBe('500 g')
  })
  it('additionne ml, cl, dl et l', () => {
    expect(add('20 cl', '5 cl')).toBe('25 cl')
    expect(add('75 cl', '50 cl')).toBe('1,25 l')
    expect(add('1 dl', '50 ml')).toBe('15 cl')
    expect(add('33 ml')).toBe('33 ml')
  })
  it('additionne les unités identiques, sans tenir compte de la casse', () => {
    expect(add('2 tranches', '3 Tranches')).toBe('5 tranches')
    expect(add('2', '3')).toBe('5')
  })
  it('garde côte à côte ce qui ne s\'additionne pas', () => {
    expect(add('200 g', '2')).toBe('200 g + 2')
    expect(add('1 l', '500 g')).toBe('1 l + 500 g')
  })
  it('garde le texte libre une seule fois', () => {
    expect(add('un peu', 'Un peu', '1 pincée')).toBe('1 pincée + un peu')
  })
  it('relit un texte déjà stocké avec un « + »', () => {
    expect(add('1,6 kg + 2', '400 g')).toBe('2 kg + 2')
  })
  it('renvoie null quand il n\'y a rien', () => {
    expect(formatQuantity(parseQuantity(''))).toBeNull()
    expect(formatQuantity(parseQuantity(null))).toBeNull()
  })
})

describe('ingrédient de recette ajusté aux portions', () => {
  it('multiplie par le coefficient de portions', () => {
    // recette pour 4, on en fait 6 → × 1,5
    expect(formatIngredient(200, 'g', 6 / 4)).toBe('300 g')
    expect(formatIngredient(3, null, 6 / 4)).toBe('4,5')
  })
  it('garde l\'unité seule quand il n\'y a pas de nombre (« selon le goût »)', () => {
    expect(formatQuantity(fromIngredient(null, 'selon le goût'))).toBe('selon le goût')
    expect(formatQuantity(fromIngredient(0, ''))).toBeNull()
  })
})

describe('comparaison des noms', () => {
  it('ignore accents, casse et espaces', () => {
    expect(normalizeText('  Crème   Fraîche ')).toBe('creme fraiche')
    expect(ingredientKey('Pâtes')).toBe(ingredientKey('pates'))
  })
  it('tolère le pluriel et la ligature œ', () => {
    expect(matchKey('Courgettes')).toBe(matchKey('courgette'))
    expect(matchKey('Œufs')).toBe(matchKey('oeuf'))
    expect(matchKey('Poireaux')).toBe(matchKey('poireau'))
    expect(matchKey('mousse')).toBe('mousse') // « ss » final gardé
  })
  it('reconnaît un nom plus précis du même produit', () => {
    expect(sameProduct('sel', 'sel fin')).toBe(true)
    expect(sameProduct('huile', "huile d'olive")).toBe(true)
    expect(sameProduct('Tomates', 'tomate')).toBe(true)
  })
  it('ne confond pas des produits différents', () => {
    expect(sameProduct('pâtes', 'pâte à crêpes')).toBe(false)
    expect(sameProduct('sel', 'céleri')).toBe(false)
    expect(sameProduct('lait', 'laitue')).toBe(false)
    expect(sameProduct('', 'sel')).toBe(false)
  })
})
