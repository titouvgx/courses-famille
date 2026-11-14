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
 * 4. Ajoute les données de test (super-familles, famille A2, recettes, planning,
 *    listes, habituels, placard, photos, invitations…).
 *
 * Modèle (migration familles_invitations) :
 *   super-famille SA (fondateur = super-admin) ⊃ foyers A et A2
 *   super-famille SB (fondateur = admin B)     ⊃ foyer B
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
// Préfixe a… = foyer A, a2… = foyer A2 (même super-famille que A),
// b… = foyer B (autre super-famille), c… = hors foyer, d… = super-familles.
export const ID = {
  sfA: 'd0000000-0000-4000-8000-00000000000a', // créée par la migration, identifiant fixé par le banc
  sfB: 'd0000000-0000-4000-8000-00000000000b',

  famA: 'a0000000-0000-4000-8000-000000000001',
  famA2: 'a2000000-0000-4000-8000-000000000001',
  famB: 'b0000000-0000-4000-8000-000000000001',

  adminA: 'a0000000-0000-4000-8000-000000000011',
  memberA: 'a0000000-0000-4000-8000-000000000012',
  adminA2: 'a2000000-0000-4000-8000-000000000011',
  memberA2: 'a2000000-0000-4000-8000-000000000012',
  adminB: 'b0000000-0000-4000-8000-000000000011', // admin du foyer B ET fondateur de SB
  memberB: 'b0000000-0000-4000-8000-000000000012',
  superAdmin: 'c0000000-0000-4000-8000-000000000099', // profil dans le foyer A, rôle member ; fondateur de SA
  sansProfil: 'c0000000-0000-4000-8000-000000000001', // compte Auth sans profil (= sans foyer)
  founderC: 'c0000000-0000-4000-8000-0000000000fc', // compte Auth sans profil : futur fondateur (lien « fondateur »)
  nouveau1: 'c0000000-0000-4000-8000-0000000000e1', // comptes Auth sans profil pour consume_invitation
  nouveau2: 'c0000000-0000-4000-8000-0000000000e2',

  recA: 'a0000000-0000-4000-8000-000000000021', // visibility 'famille'
  recAshared: 'a0000000-0000-4000-8000-000000000024', // visibility 'super_famille'
  recA2: 'a2000000-0000-4000-8000-000000000021', // visibility 'famille'
  recB: 'b0000000-0000-4000-8000-000000000021', // visibility 'famille'
  ingA: 'a0000000-0000-4000-8000-000000000022',
  ingAshared: 'a0000000-0000-4000-8000-000000000025',
  ingA2: 'a2000000-0000-4000-8000-000000000022',
  ingB: 'b0000000-0000-4000-8000-000000000022',
  stepA: 'a0000000-0000-4000-8000-000000000023',
  stepAshared: 'a0000000-0000-4000-8000-000000000026',
  stepA2: 'a2000000-0000-4000-8000-000000000023',
  stepB: 'b0000000-0000-4000-8000-000000000023',
  planA: 'a0000000-0000-4000-8000-000000000031',
  planA2: 'a2000000-0000-4000-8000-000000000031',
  planB: 'b0000000-0000-4000-8000-000000000031',
  slotA: 'a0000000-0000-4000-8000-000000000032',
  slotA2: 'a2000000-0000-4000-8000-000000000032',
  slotB: 'b0000000-0000-4000-8000-000000000032',
  listA: 'a0000000-0000-4000-8000-000000000041',
  listA2: 'a2000000-0000-4000-8000-000000000041',
  listB: 'b0000000-0000-4000-8000-000000000041',
  itemA: 'a0000000-0000-4000-8000-000000000042',
  itemA2: 'a2000000-0000-4000-8000-000000000042',
  itemB: 'b0000000-0000-4000-8000-000000000042',
  stapleA: 'a0000000-0000-4000-8000-000000000051',
  stapleA2: 'a2000000-0000-4000-8000-000000000051',
  stapleB: 'b0000000-0000-4000-8000-000000000051',
  pantryA: 'a0000000-0000-4000-8000-000000000061',
  pantryA2: 'a2000000-0000-4000-8000-000000000061',
  pantryB: 'b0000000-0000-4000-8000-000000000061',
  objA: 'a0000000-0000-4000-8000-000000000071',
  objAshared: 'a0000000-0000-4000-8000-000000000072',
  objA2: 'a2000000-0000-4000-8000-000000000071',
  objB: 'b0000000-0000-4000-8000-000000000071',

  invA: 'a0000000-0000-4000-8000-000000000081', // lien « membre » pour A, créé par admin A
  invA2: 'a2000000-0000-4000-8000-000000000081', // lien « membre » pour A2, créé par admin A2
  invB: 'b0000000-0000-4000-8000-000000000081', // lien « membre » pour B, créé par admin B
  invFondateur: 'c0000000-0000-4000-8000-000000000081', // lien « fondateur », créé par le super-admin
} as const

/** Jetons EN CLAIR des invitations de test (la base n'en garde que le SHA-256). */
export const TOKEN = {
  invA: 'jeton-de-test-invitation-foyer-a-0000000000000000000000000000001',
  invA2: 'jeton-de-test-invitation-foyer-a2-000000000000000000000000000001',
  invB: 'jeton-de-test-invitation-foyer-b-0000000000000000000000000000001',
  invFondateur: 'jeton-de-test-invitation-fondateur-000000000000000000000000001',
} as const

export const PHOTO_BUCKET = 'recipe-photos'
export const OTHER_BUCKET = 'autre-bucket'
export const objName = {
  A: `${ID.recA}/photo-a.webp`,
  Ashared: `${ID.recAshared}/photo-as.webp`,
  A2: `${ID.recA2}/photo-a2.webp`,
  B: `${ID.recB}/photo-b.webp`,
} as const
/** Photos au format enregistré par l'appli (`<recette>/<uuid>.webp`), pour recipes.image_url (migration photo_paths). */
export const photoPath = {
  A: `${ID.recA}/c0ffee00-0000-4000-8000-00000000000a.webp`,
  B: `${ID.recB}/c0ffee00-0000-4000-8000-00000000000b.webp`,
} as const

export type Actor =
  | 'anon'
  | 'adminA'
  | 'memberA'
  | 'adminA2'
  | 'memberA2'
  | 'adminB'
  | 'memberB'
  | 'superAdmin'
  | 'sansProfil'
  | 'founderC'
export type Foyer = 'A' | 'A2' | 'B'

export const ACTOR_LABEL: Record<Actor, string> = {
  anon: 'anonyme',
  adminA: 'admin A',
  memberA: 'membre A',
  adminA2: 'admin A2',
  memberA2: 'membre A2',
  adminB: 'admin B (fondateur SB)',
  memberB: 'membre B',
  superAdmin: 'super-admin (fondateur SA)',
  sansProfil: 'connecté sans foyer',
  founderC: 'compte C (sans profil)',
}

/** Faits relevés juste après les migrations, AVANT que le banc ne modifie quoi que ce soit. */
export interface MigrationFacts {
  /** Super-familles créées par la migration (attendu : 1). */
  superFamilies: { name: string; founder_id: string | null }[]
  /** Foyers sans super-famille après la migration (attendu : 0). */
  familiesWithoutSuperFamily: number
  /** Foyers rattachés à la super-famille créée (attendu : A et B). */
  familiesInIt: string[]
  /** Recettes par visibilité après la migration (avant les données de test). */
  recipesByVisibility: Record<string, number>
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
// Joué en super-utilisateur, sans claims : auth.uid() = NULL, ce que les
// triggers de garde laissent passer (mise en place, comme la console Supabase).
// Créneaux sans cuisinier (cook_id NULL) : les tentatives de « déplacement »
// testent ainsi RLS, pas le trigger du cuisinier (testé à part).
const sha = (token: string) => `encode(sha256(convert_to('${token}', 'UTF8')), 'hex')`
const FIXTURES_SQL = `
-- 1. Super-famille SA créée par la migration (familles existantes, fondateur =
--    super-admin) : identifiant fixé pour les tests (copie puis suppression).
INSERT INTO public.super_families (id, name, founder_id, created_at)
  SELECT '${ID.sfA}', name, founder_id, created_at FROM public.super_families;
UPDATE public.families SET super_family_id = '${ID.sfA}' WHERE super_family_id <> '${ID.sfA}';
DELETE FROM public.super_families WHERE id <> '${ID.sfA}';

-- 2. Super-famille SB (fondateur = admin B), le foyer B y est déplacé
INSERT INTO public.super_families (id, name, founder_id, created_at) VALUES
  ('${ID.sfB}', 'Super-famille B', '${ID.adminB}', '2026-01-05 00:00:00+00');
UPDATE public.families SET super_family_id = '${ID.sfB}' WHERE id = '${ID.famB}';

-- 3. Foyer A2 dans SA, et comptes supplémentaires
INSERT INTO public.families (id, name, super_family_id, created_at) VALUES
  ('${ID.famA2}', 'Foyer A2', '${ID.sfA}', '2026-01-06 00:00:00+00');

INSERT INTO auth.users (id, aud, role, email, created_at) VALUES
  ('${ID.adminA2}',  'authenticated', 'authenticated', 'admin-a2@test.local',  '2026-01-06 00:00:01+00'),
  ('${ID.memberA2}', 'authenticated', 'authenticated', 'membre-a2@test.local', '2026-01-06 00:00:02+00'),
  ('${ID.founderC}', 'authenticated', 'authenticated', 'fondateur-c@test.local', '2026-01-07 00:00:00+00'),
  ('${ID.nouveau1}', 'authenticated', 'authenticated', 'nouveau-1@test.local', '2026-01-08 00:00:01+00'),
  ('${ID.nouveau2}', 'authenticated', 'authenticated', 'nouveau-2@test.local', '2026-01-08 00:00:02+00');

INSERT INTO public.profiles (id, family_id, display_name, role) VALUES
  ('${ID.adminA2}',  '${ID.famA2}', 'Admin A2',  'admin'),
  ('${ID.memberA2}', '${ID.famA2}', 'Membre A2', 'member');

-- 4. Recettes (auteur = un membre du foyer propriétaire)
INSERT INTO public.recipes (id, family_id, title, created_by, visibility) VALUES
  ('${ID.recA}',       '${ID.famA}',  'Recette du foyer A',            '${ID.adminA}',  'famille'),
  ('${ID.recAshared}', '${ID.famA}',  'Recette de A partagée dans SA', '${ID.memberA}', 'super_famille'),
  ('${ID.recA2}',      '${ID.famA2}', 'Recette du foyer A2',           '${ID.adminA2}', 'famille'),
  ('${ID.recB}',       '${ID.famB}',  'Recette du foyer B',            '${ID.adminB}',  'famille');

INSERT INTO public.recipe_ingredients (id, recipe_id, name, quantity, unit) VALUES
  ('${ID.ingA}',       '${ID.recA}',       'Ingrédient A', 1, 'g'),
  ('${ID.ingAshared}', '${ID.recAshared}', 'Ingrédient A partagé', 1, 'g'),
  ('${ID.ingA2}',      '${ID.recA2}',      'Ingrédient A2', 1, 'g'),
  ('${ID.ingB}',       '${ID.recB}',       'Ingrédient B', 1, 'g');

INSERT INTO public.recipe_steps (id, recipe_id, position, instruction) VALUES
  ('${ID.stepA}',       '${ID.recA}',       0, 'Étape A'),
  ('${ID.stepAshared}', '${ID.recAshared}', 0, 'Étape A partagée'),
  ('${ID.stepA2}',      '${ID.recA2}',      0, 'Étape A2'),
  ('${ID.stepB}',       '${ID.recB}',       0, 'Étape B');

-- 5. Vie du foyer (semaines différentes : un « déplacement » ne heurte pas
--    l'unicité (family_id, week_start))
INSERT INTO public.meal_plans (id, family_id, week_start) VALUES
  ('${ID.planA}',  '${ID.famA}',  '2026-11-09'),
  ('${ID.planB}',  '${ID.famB}',  '2026-11-16'),
  ('${ID.planA2}', '${ID.famA2}', '2026-11-23');

INSERT INTO public.meal_slots (id, meal_plan_id, day_of_week, meal_type, recipe_id, portions) VALUES
  ('${ID.slotA}',  '${ID.planA}',  0, 'midi', '${ID.recA}',  4),
  ('${ID.slotB}',  '${ID.planB}',  1, 'soir', '${ID.recB}',  4),
  ('${ID.slotA2}', '${ID.planA2}', 2, 'midi', '${ID.recA2}', 4);

INSERT INTO public.shopping_lists (id, family_id, meal_plan_id, status) VALUES
  ('${ID.listA}',  '${ID.famA}',  '${ID.planA}',  'active'),
  ('${ID.listB}',  '${ID.famB}',  '${ID.planB}',  'active'),
  ('${ID.listA2}', '${ID.famA2}', '${ID.planA2}', 'active');

INSERT INTO public.shopping_list_items (id, shopping_list_id, name, quantity) VALUES
  ('${ID.itemA}',  '${ID.listA}',  'Lait (A)',  '1 l'),
  ('${ID.itemB}',  '${ID.listB}',  'Lait (B)',  '1 l'),
  ('${ID.itemA2}', '${ID.listA2}', 'Lait (A2)', '1 l');

INSERT INTO public.staples (id, family_id, name) VALUES
  ('${ID.stapleA}',  '${ID.famA}',  'Pain (A)'),
  ('${ID.stapleB}',  '${ID.famB}',  'Pain (B)'),
  ('${ID.stapleA2}', '${ID.famA2}', 'Pain (A2)');

INSERT INTO public.pantry_items (id, family_id, name) VALUES
  ('${ID.pantryA}',  '${ID.famA}',  'Sel (A)'),
  ('${ID.pantryB}',  '${ID.famB}',  'Sel (B)'),
  ('${ID.pantryA2}', '${ID.famA2}', 'Sel (A2)');

-- 6. Photos
INSERT INTO storage.buckets (id, name, public) VALUES ('${OTHER_BUCKET}', '${OTHER_BUCKET}', false);

INSERT INTO storage.objects (id, bucket_id, name, owner) VALUES
  ('${ID.objA}',       '${PHOTO_BUCKET}', '${objName.A}',       '${ID.memberA}'),
  ('${ID.objAshared}', '${PHOTO_BUCKET}', '${objName.Ashared}', '${ID.memberA}'),
  ('${ID.objA2}',      '${PHOTO_BUCKET}', '${objName.A2}',      '${ID.memberA2}'),
  ('${ID.objB}',       '${PHOTO_BUCKET}', '${objName.B}',       '${ID.memberB}');

INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('${PHOTO_BUCKET}', '${photoPath.A}', '${ID.memberA}'),
  ('${PHOTO_BUCKET}', '${photoPath.B}', '${ID.memberB}');

-- 7. Invitations en attente (jeton connu du banc, seule l'empreinte est stockée)
INSERT INTO public.invitations (id, token_hash, kind, family_id, role, created_by, expires_at) VALUES
  ('${ID.invA}',         ${sha(TOKEN.invA)},         'membre',    '${ID.famA}',  'member', '${ID.adminA}',     now() + interval '7 days'),
  ('${ID.invA2}',        ${sha(TOKEN.invA2)},        'membre',    '${ID.famA2}', 'admin',  '${ID.adminA2}',    now() + interval '7 days'),
  ('${ID.invB}',         ${sha(TOKEN.invB)},         'membre',    '${ID.famB}',  'member', '${ID.adminB}',     now() + interval '7 days'),
  ('${ID.invFondateur}', ${sha(TOKEN.invFondateur)}, 'fondateur', NULL,          NULL,     '${ID.superAdmin}', now() + interval '7 days');
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
  /** Constats faits juste après les migrations (avant les données de test). */
  facts: MigrationFacts
  /** Exécute fn dans une transaction TOUJOURS annulée à la fin. */
  scenario<T>(fn: (s: Scenario) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export interface Scenario {
  /** Joue la requête en tant qu'acteur (rôle + claims JWT), dans un SAVEPOINT. */
  as(actor: Actor, sql: string, params?: unknown[]): Promise<Outcome>
  /** Idem pour un compte quelconque (ex. créé pendant le test), rôle authenticated. */
  asUid(uid: string, sql: string, params?: unknown[]): Promise<Outcome>
  /** Requête avec la clé secrète (rôle service_role, comme la fonction serveur). */
  service(sql: string, params?: unknown[]): Promise<Outcome>
  /** Requête en super-utilisateur (contrôle de l'état réel de la base). */
  su<R = Record<string, any>>(sql: string, params?: unknown[]): Promise<R[]>
  /** Exécute fn dans un SAVEPOINT toujours annulé (essais isolés). */
  isolated<T>(fn: () => Promise<T>): Promise<T>
}

const ACTOR_UID: Record<Exclude<Actor, 'anon'>, string> = {
  adminA: ID.adminA,
  memberA: ID.memberA,
  adminA2: ID.adminA2,
  memberA2: ID.memberA2,
  adminB: ID.adminB,
  memberB: ID.memberB,
  superAdmin: ID.superAdmin,
  sansProfil: ID.sansProfil,
  founderC: ID.founderC,
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

/** Ce que la migration familles_invitations a fait des données existantes. */
async function readFacts(db: PGlite): Promise<MigrationFacts> {
  const exists = await db.query<{ t: string | null }>(`SELECT to_regclass('public.super_families')::text AS t`)
  if (!exists.rows[0].t) {
    return { superFamilies: [], familiesWithoutSuperFamily: -1, familiesInIt: [], recipesByVisibility: {} }
  }
  const sf = await db.query<{ name: string; founder_id: string | null }>(
    `SELECT name, founder_id FROM public.super_families ORDER BY created_at`,
  )
  const orphan = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.families WHERE super_family_id IS NULL`)
  const inIt = await db.query<{ id: string }>(
    `SELECT f.id FROM public.families f JOIN public.super_families s ON s.id = f.super_family_id ORDER BY f.id`,
  )
  const vis = await db.query<{ v: string; n: number }>(
    `SELECT visibility AS v, count(*)::int AS n FROM public.recipes GROUP BY 1`,
  )
  return {
    superFamilies: sf.rows,
    familiesWithoutSuperFamily: orphan.rows[0].n,
    familiesInIt: inIt.rows.map((r) => r.id),
    recipesByVisibility: Object.fromEntries(vis.rows.map((r) => [r.v, r.n])),
  }
}

/**
 * @param opts.fixtures false : migrations seulement, sans les données de test
 *   (utilisé par le générateur de recettes, qui rejoue une partie des migrations).
 */
export async function createBench(opts: { fixtures?: boolean } = {}): Promise<Bench> {
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
  if (opts.fixtures === false) {
    return { db, migrations, facts: undefined as never, scenario: async () => { throw new Error('Pas de scénario sans données de test') }, close: () => db.close() } as unknown as Bench
  }
  const facts = await readFacts(db)
  await runFile(db, 'données de test', FIXTURES_SQL)

  const who = await db.query<{ u: string; su: boolean }>(
    `SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su`,
  )
  if (!who.rows[0].su) throw new Error('Le banc doit tourner en super-utilisateur')

  let savepoint = 0
  /** Joue sql sous un rôle d'API, dans un SAVEPOINT. uid = null : aucun « sub ». */
  async function play(
    role: 'anon' | 'authenticated' | 'service_role',
    uid: string | null,
    sql: string,
    params: unknown[],
  ): Promise<Outcome> {
    const sp = `tentative_${++savepoint}`
    await db.exec(`SAVEPOINT ${sp}`)
    if (role === 'anon') {
      // Anonyme : rôle anon, AUCUN claim (auth.uid() = NULL)
      await db.exec(`SET LOCAL ROLE anon`)
      await db.query(`SELECT set_config('request.jwt.claims', '', true)`)
    } else {
      // service_role : JWT de la clé secrète, sans « sub » (auth.uid() = NULL)
      const claims = JSON.stringify(uid ? { sub: uid, role, aud: 'authenticated' } : { role })
      await db.exec(`SET LOCAL ROLE ${role}`)
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
  }
  const scenarioApi: Scenario = {
    as: (actor, sql, params = []) =>
      actor === 'anon' ? play('anon', null, sql, params) : play('authenticated', ACTOR_UID[actor], sql, params),
    asUid: (uid, sql, params = []) => play('authenticated', uid, sql, params),
    service: (sql, params = []) => play('service_role', null, sql, params),
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
    facts,
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
