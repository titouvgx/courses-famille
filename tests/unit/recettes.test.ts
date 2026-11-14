// Recettes livrées avec l'appli (supabase/recettes/*.json) : format valide et
// migration générée à jour (on ne la modifie jamais à la main : npm run recettes).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOSSIER_MIGRATIONS, FICHIER_MIGRATION, FICHIER_MIGRATION_PHOTOS, genererPhotosSQL, genererSQL, lirePhotos, lireRecettes } from '../../scripts/recettes/generer.ts'

describe('recettes livrées avec l\'appli', () => {
  const { corrections, nouvelles, erreurs } = lireRecettes()

  it('tous les fichiers respectent le format (scripts/recettes/format.ts)', () => {
    expect(erreurs).toEqual([])
  })

  it('les 20 recettes de démo sont corrigées, une seule fois chacune', () => {
    expect(corrections).toHaveLength(20)
    expect(new Set(corrections.map((r) => r.original_title)).size).toBe(20)
  })

  it('il y a des nouvelles recettes dans chaque catégorie', () => {
    for (const c of ['Entrée', 'Plat', 'Accompagnement', 'Dessert']) {
      expect(nouvelles.some((r) => r.category === c), c).toBe(true)
    }
  })

  it('la migration 17 range toutes les recettes livrées dans le catalogue commun', () => {
    const m17 = readFileSync(join(DOSSIER_MIGRATIONS, '20261114100000_familles_invitations.sql'), 'utf8')
    for (const r of [...corrections, ...nouvelles]) {
      for (const t of new Set([r.title, r.original_title ?? r.title])) {
        expect(m17.includes(`'${t.replace(/'/g, "''")}'`), t).toBe(true)
      }
    }
  })

  it('la migration générée est à jour (sinon : npm run recettes)', async () => {
    const attendu = await genererSQL()
    const actuel = readFileSync(join(DOSSIER_MIGRATIONS, FICHIER_MIGRATION), 'utf8')
    expect(actuel === attendu, 'migration différente des fichiers JSON : lancer « npm run recettes »').toBe(true)
  }, 120_000)

  it('photos du catalogue : une entrée vérifiée par recette, format Unsplash, sans doublon', () => {
    expect(lirePhotos().erreurs).toEqual([])
  })

  it('la migration des photos est à jour (sinon : npm run recettes)', () => {
    const actuel = readFileSync(join(DOSSIER_MIGRATIONS, FICHIER_MIGRATION_PHOTOS), 'utf8')
    expect(actuel === genererPhotosSQL(), 'migration des photos différente de photos.json : lancer « npm run recettes »').toBe(true)
  })
})
