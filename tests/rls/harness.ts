/**
 * Banc d'attaque RLS — moteur.
 *
 * 1. Démarre une base PGlite (PostgreSQL compilé en WebAssembly, en mémoire).
 * 2. Rejoue tests/rls/supabase-stubs.sql (ce que Supabase installe d'office).
 * 3. Rejoue TOUS les fichiers .sql de supabase/migrations/, dans l'ordre
 *    alphabétique des noms (= ordre chronologique), chacun dans sa transaction,
 *    comme la CLI Supabase. Une migration ajoutée au dossier est prise
 *    automatiquement.
 *    Juste avant le premier fichier dont le nom contient « seed_recipes »,
 *    un crochet crée les foyers A et B et leurs utilisateurs : cette migration
 *    exige au moins une famille et un utilisateur.
 * 4. Ajoute les données de test (planning, listes, habituels, placard, photos…).
 *
 * Les tests jouent ensuite un utilisateur dans une transaction annulée à la fin
 * (voir Scenario), exactement comme PostgREST : SET LOCAL ROLE + request.jwt.claims.
 */
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
// RLS_MIGRATIONS_DIR : facultatif, pour essayer le banc sur une copie modifiée
// des migrations (ex. vérifier qu'il détecte une règle volontairement cassée).
export const MIGRATIONS_DIR = process.env.RLS_MIGRATIONS_DIR || join(HERE, '..', '..', 'supabase', 'migrations')
export const STUBS_FILE = join(HERE, 'supabase-stubs.sql')

// ── Identifiants fixes des données de test ─────────────────────────────────
// Préfixe a… = foyer A, b… = foyer B, c… = hors foyer.
export const ID = {
  famA: 'a0000000-0000-4000-8000-000000000001',
  famB: 'b0000000-0000-4000-8000-000000000001',

  adminA: 'a0000000-0000-4000-8000-000000000011',
  memberA: 'a0000000-0000-4000-8000-000000000012',
  adminB: 'b0000000-0000-4000-8000-000000000011',
  memberB: 'b0000000-0000-4000-8000-000000000012',
  superAdmin: 'c0000000-0000-4000-8000-000000000099', // profil dans le foyer A, rôle member
  sansProfil: 'c0000000-0000-4000-8000-000000000001', // compte Auth sans profil (= sans foyer)

  recA: 'a0000000-0000-4000-8000-000000000021',
  recB: 'b0000000-0000-4000-8000-000000000021',
  ingA: 'a0000000-0000-4000-8000-000000000022',
  ingB: 'b0000000-0000-4000-8000-000000000022',
  stepA: 'a0000000-0000-4000-8000-000000000023',
  stepB: 'b0000000-0000-4000-8000-000000000023',
  planA: 'a0000000-0000-4000-8000-000000000031',
  planB: 'b0000000-0000-4000-8000-000000000031',
  slotA: 'a0000000-0000-4000-8000-000000000032',
  slotB: 'b0000000-0000-4000-8000-000000000032',
  listA: 'a0000000-0000-4000-8000-000000000041',
  listB: 'b0000000-0000-4000-8000-000000000041',
  itemA: 'a0000000-0000-4000-8000-000000000042',
  itemB: 'b0000000-0000-4000-8000-000000000042',
  stapleA: 'a0000000-0000-4000-8000-000000000051',
  stapleB: 'b0000000-0000-4000-8000-000000000051',
  pantryA: 'a0000000-0000-4000-8000-000000000061',
  pantryB: 'b0000000-0000-4000-8000-000000000061',
  objA: 'a0000000-0000-4000-8000-000000000071',
  objB: 'b0000000-0000-4000-8000-000000000071',
} as const

export const PHOTO_BUCKET = 'recipe-photos'
export const OTHER_BUCKET = 'autre-bucket'
export const objName = { A: `${ID.recA}/photo-a.webp`, B: `${ID.recB}/photo-b.webp` } as const

export type Actor = 'anon' | 'adminA' | 'memberA' | 'adminB' | 'memberB' | 'superAdmin' | 'sansProfil'
export type Foyer = 'A' | 'B'
export const other = (f: Foyer): Foyer => (f === 'A' ? 'B' : 'A')

export const ACTOR_LABEL: Record<Actor, string> = {
  anon: 'anonyme',
  adminA: 'admin A',
  memberA: 'membre A',
  adminB: 'admin B',
  memberB: 'membre B',
  superAdmin: 'super-admin',
  sansProfil: 'connecté sans foyer',
}

// ── Crochet « avant seed_recipes » : foyers, comptes, profils ──────────────
// Dates explicites : seed_recipes prend « la première famille » et « le premier
// utilisateur » par created_at → foyer A et admin A, de façon déterministe.
const USERS_SQL = `
INSERT INTO public.families (id, name, created_at) VALUES
  ('${ID.famA}', 'Foyer A', '2026-01-01 00:00:00+00'),
  ('${ID.famB}', 'Foyer B', '2026-01-02 00:00:00+00');

INSERT INTO auth.users (id, aud, role, email, created_at) VALUES
  ('${ID.adminA}',     'authenticated', 'authenticated', 'admin-a@test.local',     '2026-01-01 00:00:01+00'),
  ('${ID.memberA}',    'authenticated', 'authenticated', 'membre-a@test.local',    '2026-01-01 00:00:02+00'),
  ('${ID.adminB}',     'authenticated', 'authenticated', 'admin-b@test.local',     '2026-01-02 00:00:01+00'),
  ('${ID.memberB}',    'authenticated', 'authenticated', 'membre-b@test.local',    '2026-01-02 00:00:02+00'),
  ('${ID.superAdmin}', 'authenticated', 'authenticated', 'super@test.local',       '2026-01-03 00:00:00+00'),
  ('${ID.sansProfil}', 'authenticated', 'authenticated', 'sans-profil@test.local', '2026-01-04 00:00:00+00');

INSERT INTO public.profiles (id, family_id, display_name, role) VALUES
  ('${ID.adminA}',     '${ID.famA}', 'Admin A',     'admin'),
  ('${ID.memberA}',    '${ID.famA}', 'Membre A',    'member'),
  ('${ID.adminB}',     '${ID.famB}', 'Admin B',     'admin'),
  ('${ID.memberB}',    '${ID.famB}', 'Membre B',    'member'),
  ('${ID.superAdmin}', '${ID.famA}', 'Super-admin', 'member');

INSERT INTO public.super_admins (user_id) VALUES ('${ID.superAdmin}');
`

// ── Données de test ajoutées APRÈS toutes les migrations ───────────────────
// Créneaux sans cuisinier (cook_id NULL) : les tentatives de « déplacement »
// testent ainsi RLS, pas le trigger du cuisinier (testé à part).
const FIXTURES_SQL = `
INSERT INTO public.recipes (id, family_id, title, created_by) VALUES
  ('${ID.recA}', '${ID.famA}', 'Recette du foyer A', '${ID.adminA}'),
  ('${ID.recB}', '${ID.famB}', 'Recette du foyer B', '${ID.adminB}');

INSERT INTO public.recipe_ingredients (id, recipe_id, name, quantity, unit) VALUES
  ('${ID.ingA}', '${ID.recA}', 'Ingrédient A', 1, 'g'),
  ('${ID.ingB}', '${ID.recB}', 'Ingrédient B', 1, 'g');

INSERT INTO public.recipe_steps (id, recipe_id, position, instruction) VALUES
  ('${ID.stepA}', '${ID.recA}', 0, 'Étape A'),
  ('${ID.stepB}', '${ID.recB}', 0, 'Étape B');

INSERT INTO public.meal_plans (id, family_id, week_start) VALUES
  ('${ID.planA}', '${ID.famA}', '2026-11-09'),
  ('${ID.planB}', '${ID.famB}', '2026-11-16'); -- semaines différentes : un « déplacement » ne heurte pas l'unicité (family_id, week_start)

INSERT INTO public.meal_slots (id, meal_plan_id, day_of_week, meal_type, recipe_id, portions) VALUES
  ('${ID.slotA}', '${ID.planA}', 0, 'midi', '${ID.recA}', 4),
  ('${ID.slotB}', '${ID.planB}', 1, 'soir', '${ID.recB}', 4);

INSERT INTO public.shopping_lists (id, family_id, meal_plan_id, status) VALUES
  ('${ID.listA}', '${ID.famA}', '${ID.planA}', 'active'),
  ('${ID.listB}', '${ID.famB}', '${ID.planB}', 'active');

INSERT INTO public.shopping_list_items (id, shopping_list_id, name, quantity) VALUES
  ('${ID.itemA}', '${ID.listA}', 'Lait (A)', '1 l'),
  ('${ID.itemB}', '${ID.listB}', 'Lait (B)', '1 l');

INSERT INTO public.staples (id, family_id, name) VALUES
  ('${ID.stapleA}', '${ID.famA}', 'Pain (A)'),
  ('${ID.stapleB}', '${ID.famB}', 'Pain (B)');

INSERT INTO public.pantry_items (id, family_id, name) VALUES
  ('${ID.pantryA}', '${ID.famA}', 'Sel (A)'),
  ('${ID.pantryB}', '${ID.famB}', 'Sel (B)');

INSERT INTO storage.buckets (id, name, public) VALUES ('${OTHER_BUCKET}', '${OTHER_BUCKET}', false);

INSERT INTO storage.objects (id, bucket_id, name, owner) VALUES
  ('${ID.objA}', '${PHOTO_BUCKET}', '${objName.A}', '${ID.memberA}'),
  ('${ID.objB}', '${PHOTO_BUCKET}', '${objName.B}', '${ID.memberB}');
`

// ── Extensions ─────────────────────────────────────────────────────────────
type PGliteExtension = { name: string; setup: (...args: any[]) => Promise<any> }

/** Extensions demandées par les migrations (CREATE EXTENSION …), en plus de
 *  celles que Supabase préinstalle (pgcrypto, uuid-ossp). */
async function extensionsFor(sqlFiles: string[]): Promise<Record<string, PGliteExtension>> {
  const exts: Record<string, PGliteExtension> = { pg_trgm, pgcrypto, uuid_ossp }
  const re = /create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_-]+)"?/gi
  for (const sql of sqlFiles) {
    for (const m of sql.matchAll(re)) {
      const mod = m[1].toLowerCase().replace(/-/g, '_')
      if (exts[mod]) continue
      try {
        const loaded = await import(/* @vite-ignore */ `@electric-sql/pglite/contrib/${mod}`)
        exts[mod] = loaded[mod]
      } catch {
        throw new Error(
          `Extension « ${m[1]} » demandée par une migration mais absente de PGlite ` +
            `(@electric-sql/pglite/contrib/${mod}). Le banc ne peut pas la rejouer.`,
        )
      }
    }
  }
  return exts
}

// ── Résultat d'une tentative ───────────────────────────────────────────────
export interface Outcome {
  /** Lignes renvoyées (SELECT ou RETURNING). */
  rows: Record<string, any>[]
  /** Lignes lues ou touchées (RETURNING de préférence). */
  count: number
  /** Erreur PostgreSQL éventuelle (code SQLSTATE + message). */
  error?: { code: string; message: string }
}

export interface Bench {
  db: PGlite
  migrations: string[]
  /** Exécute fn dans une transaction TOUJOURS annulée à la fin. */
  scenario<T>(fn: (s: Scenario) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export interface Scenario {
  /** Joue la requête en tant qu'acteur (rôle + claims JWT), dans un SAVEPOINT. */
  as(actor: Actor, sql: string, params?: unknown[]): Promise<Outcome>
  /** Requête en super-utilisateur (contrôle de l'état réel de la base). */
  su<R = Record<string, any>>(sql: string, params?: unknown[]): Promise<R[]>
  /** Exécute fn dans un SAVEPOINT toujours annulé (essais isolés). */
  isolated<T>(fn: () => Promise<T>): Promise<T>
}

const ACTOR_UID: Record<Exclude<Actor, 'anon'>, string> = {
  adminA: ID.adminA,
  memberA: ID.memberA,
  adminB: ID.adminB,
  memberB: ID.memberB,
  superAdmin: ID.superAdmin,
  sansProfil: ID.sansProfil,
}

export function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

async function runFile(db: PGlite, label: string, sql: string) {
  await db.exec('BEGIN')
  try {
    await db.exec(sql)
    await db.exec('COMMIT')
  } catch (e: any) {
    await db.exec('ROLLBACK').catch(() => {})
    throw new Error(`Échec en rejouant ${label} : ${e?.message ?? e}`)
  }
}

export async function createBench(): Promise<Bench> {
  const migrations = listMigrations()
  const sources = migrations.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  const db = await PGlite.create({ extensions: await extensionsFor(sources) })

  // search_path de Supabase (ALTER DATABASE … SET search_path ne s'applique
  // qu'aux nouvelles sessions : PGlite n'en a qu'une, on règle la session).
  await db.exec(`SET search_path TO "$user", public, extensions`)
  await runFile(db, 'supabase-stubs.sql', readFileSync(STUBS_FILE, 'utf8'))

  let usersDone = false
  for (let i = 0; i < migrations.length; i++) {
    if (!usersDone && /seed_recipes/.test(migrations[i])) {
      await runFile(db, 'crochet utilisateurs (avant seed_recipes)', USERS_SQL)
      usersDone = true
    }
    await runFile(db, migrations[i], sources[i])
  }
  if (!usersDone) await runFile(db, 'crochet utilisateurs (fin)', USERS_SQL)
  await runFile(db, 'données de test', FIXTURES_SQL)

  const who = await db.query<{ u: string; su: boolean }>(
    `SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su`,
  )
  if (!who.rows[0].su) throw new Error('Le banc doit tourner en super-utilisateur')

  let savepoint = 0
  const scenarioApi: Scenario = {
    async as(actor, sql, params = []) {
      const sp = `tentative_${++savepoint}`
      await db.exec(`SAVEPOINT ${sp}`)
      if (actor === 'anon') {
        // Anonyme : rôle anon, AUCUN claim (auth.uid() = NULL)
        await db.exec(`SET LOCAL ROLE anon`)
        await db.query(`SELECT set_config('request.jwt.claims', '', true)`)
      } else {
        const claims = JSON.stringify({
          sub: ACTOR_UID[actor],
          role: 'authenticated',
          aud: 'authenticated',
        })
        await db.exec(`SET LOCAL ROLE authenticated`)
        await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims])
      }
      try {
        const res = await db.query<Record<string, any>>(sql, params)
        const outcome: Outcome = {
          rows: res.rows,
          count: res.fields.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
        }
        await db.exec(`RESET ROLE`)
        await db.query(`SELECT set_config('request.jwt.claims', '', true)`)
        await db.exec(`RELEASE SAVEPOINT ${sp}`)
        return outcome
      } catch (e: any) {
        // L'erreur a annulé la sous-transaction : on revient au SAVEPOINT
        // (ce qui annule aussi SET LOCAL ROLE et les claims).
        await db.exec(`ROLLBACK TO SAVEPOINT ${sp}`)
        await db.exec(`RELEASE SAVEPOINT ${sp}`)
        return { rows: [], count: 0, error: { code: String(e?.code ?? ''), message: String(e?.message ?? e) } }
      }
    },
    async su(sql, params = []) {
      const cur = await db.query<{ u: string }>(`SELECT current_user AS u`)
      if (cur.rows[0].u !== 'postgres') throw new Error(`su() appelé sous le rôle ${cur.rows[0].u}`)
      return (await db.query(sql, params)).rows as any[]
    },
    async isolated(fn) {
      const sp = `isole_${++savepoint}`
      await db.exec(`SAVEPOINT ${sp}`)
      try {
        return await fn()
      } finally {
        await db.exec(`ROLLBACK TO SAVEPOINT ${sp}`)
        await db.exec(`RELEASE SAVEPOINT ${sp}`)
      }
    },
  }

  return {
    db,
    migrations,
    async scenario(fn) {
      await db.exec('BEGIN')
      try {
        return await fn(scenarioApi)
      } finally {
        await db.exec('ROLLBACK')
      }
    },
    close: () => db.close(),
  }
}
