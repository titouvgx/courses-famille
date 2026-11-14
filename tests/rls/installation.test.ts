// Installation NEUVE (procédure de mise en prod) : les 3 fichiers produits par
// « npm run prod:sql », collés dans l'ordre sur une base vide, donnent une
// base complète et cohérente (sans les données de test du banc).
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPTE_SQL, decouper } from '../../scripts/prod/assembler.ts'
import { STUBS_FILE } from './harness'

const MIG = join(import.meta.dirname, '..', '..', 'supabase', 'migrations')
const USER = '9a000000-0000-4000-8000-000000000001'

describe('installation neuve (procédure de mise en prod)', () => {
  it('structure → compte super-admin → suite : base complète', async () => {
    const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto, uuid_ossp } })
    await db.exec(`SET search_path TO "$user", public, extensions`)
    await db.exec(readFileSync(STUBS_FILE, 'utf8'))
    const { avant, apres } = decouper(readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort())
    for (const f of avant) await db.exec(readFileSync(join(MIG, f), 'utf8'))

    // Compte créé dans Authentication → Users
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${USER}', 'moi@exemple.fr')`)
    // Script non complété : refusé
    await expect(db.exec(COMPTE_SQL)).rejects.toThrow(/Remplace d'abord/)
    await db.exec(COMPTE_SQL.replace("'remplace-moi@exemple.fr'", "'Moi@Exemple.fr'").replace("'Ton prénom'", "'Moi'"))
    // Relancé : sans effet
    await db.exec(COMPTE_SQL.replace("'remplace-moi@exemple.fr'", "'moi@exemple.fr'").replace("'Ton prénom'", "'Moi'"))

    for (const f of apres) await db.exec(readFileSync(join(MIG, f), 'utf8'))

    const one = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows[0]
    expect(await one(`SELECT count(*)::int AS n FROM public.families`)).toEqual({ n: 1 })
    expect(await one(`SELECT count(*)::int AS n FROM public.super_families WHERE founder_id = '${USER}'`)).toEqual({ n: 1 })
    expect(await one(`SELECT role FROM public.profiles WHERE id = '${USER}'`)).toEqual({ role: 'admin' })
    expect(await one(`SELECT count(*)::int AS n FROM public.super_admins WHERE user_id = '${USER}'`)).toEqual({ n: 1 })
    expect(await one(`SELECT count(*)::int AS n FROM public.recipes WHERE visibility = 'catalogue'`)).toEqual({ n: 50 })
    expect(await one(`SELECT count(*)::int AS n FROM public.recipes WHERE visibility <> 'catalogue'`)).toEqual({ n: 0 })
    // Photos du catalogue (migration recettes_photos) : toutes celles de photos.json
    const attendues = JSON.parse(readFileSync(join(MIG, '..', 'recettes', 'photos.json'), 'utf8')).photos.filter((p: { url: string | null }) => p.url).length
    expect(await one(`SELECT count(*)::int AS n FROM public.recipes WHERE visibility = 'catalogue' AND image_url LIKE 'https://images.unsplash.com/photo-%'`)).toEqual({ n: attendues })
    expect(await one(`SELECT count(*)::int AS n FROM public.known_ingredients`)).toEqual({ n: 513 })
    // Aucune table publique sans RLS
    expect(await one(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
                      WHERE s.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`)).toEqual({ n: 0 })
    await db.close()
  }, 120_000)
})
