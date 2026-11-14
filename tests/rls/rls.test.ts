/**
 * Banc d'attaque RLS : un foyer ne peut ni lire ni modifier les données d'un autre.
 *
 *   npx vitest run tests/rls
 *
 * Modèle (migration familles_invitations) :
 *   super-famille SA (fondateur = super-admin) ⊃ foyers A et A2
 *   super-famille SB (fondateur = admin B)     ⊃ foyer B
 * Les données d'un foyer (planning, listes, placard…) restent privées au foyer,
 * même dans la super-famille. Recettes : 'famille' (le foyer), 'super_famille'
 * (lecture dans la super-famille), 'catalogue' (recettes livrées, lecture par
 * tous les membres, écriture super-admin seulement).
 *
 * Chaque test = une tentative, jouée dans une transaction annulée à la fin.
 *  - « attaque »   : la tentative DOIT être bloquée (erreur 42501 ou 0 ligne,
 *                    ou le refus précis attendu), et l'état réel de la base
 *                    (relu en super-utilisateur) ne doit pas avoir changé.
 *  - « contrôle »  : contrôle positif, l'opération permise DOIT réussir (sinon
 *                    un banc où tout est cassé passerait pour sûr).
 *  - « structure » : vérifications du schéma et du banc lui-même.
 * Voir README.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ACTOR_LABEL,
  createBench,
  ID,
  objName,
  photoPath,
  OTHER_BUCKET,
  PHOTO_BUCKET,
  TOKEN,
  type Actor,
  type Bench,
  type Foyer,
  type Outcome,
  type Scenario,
} from './harness'
import { lireRecettes } from '../../scripts/recettes/generer.ts'

/** 20 recettes de démo (seed_recipes) + nouvelles recettes livrées (migration recettes_v1). */
const NB_RECETTES_LIVREES = 20 + lireRecettes().nouvelles.length

// ── Base partagée par tout le fichier ──────────────────────────────────────
let bench: Bench
beforeAll(async () => {
  bench = await createBench()
}, 60_000)

// ── Comptage ───────────────────────────────────────────────────────────────
type Kind = 'attaque' | 'contrôle' | 'structure'
const stats: Record<Kind, { declared: number; passed: number; failed: string[] }> = {
  attaque: { declared: 0, passed: 0, failed: [] },
  contrôle: { declared: 0, passed: 0, failed: [] },
  structure: { declared: 0, passed: 0, failed: [] },
}

function register(kind: Kind, nom: string, fn: (s: Scenario) => Promise<void>) {
  stats[kind].declared++
  const title = kind === 'attaque' ? nom : `${kind} : ${nom}`
  it(title, async () => {
    try {
      await bench.scenario(fn)
      stats[kind].passed++
    } catch (e) {
      stats[kind].failed.push(nom)
      throw e
    }
  })
}
const attaque = (nom: string, fn: (s: Scenario) => Promise<void>) => register('attaque', nom, fn)
const controle = (nom: string, fn: (s: Scenario) => Promise<void>) => register('contrôle', nom, fn)
const structure = (nom: string, fn: (s: Scenario) => Promise<void>) => register('structure', nom, fn)

afterAll(async () => {
  const a = stats.attaque
  const c = stats.contrôle
  const st = stats.structure
  const ran = (k: Kind) => stats[k].passed + stats[k].failed.length
  const lines = [
    '',
    '══════════════ Banc d\'attaque RLS — récapitulatif ══════════════',
    `Migrations rejouées : ${bench?.migrations.length ?? 0} (${bench?.migrations.at(-1) ?? '—'} en dernier)`,
    `Tentatives d'attaque : ${ran('attaque')} jouées — ${a.passed} bloquées, ${a.failed.length} NON bloquées`,
    `Contrôles positifs   : ${ran('contrôle')} joués — ${c.passed} réussis, ${c.failed.length} en échec`,
    `Contrôles structure  : ${ran('structure')} joués — ${st.passed} réussis, ${st.failed.length} en échec`,
    ...a.failed.map((n) => `  ✗ FAILLE ? ${n}`),
    ...c.failed.map((n) => `  ✗ contrôle positif en échec : ${n}`),
    ...st.failed.map((n) => `  ✗ structure en échec : ${n}`),
    '═════════════════════════════════════════════════════════════════',
    '',
  ]
  // console.log est masqué par Vitest quand les tests passent : on écrit directement.
  process.stdout.write(lines.join('\n') + '\n')
  await bench?.close()
})

// ── Assertions ─────────────────────────────────────────────────────────────
function fmt(o: Outcome) {
  return o.error ? `erreur ${o.error.code} « ${o.error.message} »` : `${o.count} ligne(s)`
}

/** Bloqué = refus de sécurité (42501 : RLS ou trigger) OU 0 ligne lue/touchée.
 *  Toute autre erreur (colonne inconnue, contrainte, clé étrangère…) fait ÉCHOUER
 *  le test : un gabarit cassé ne doit jamais passer pour un blocage. */
function expectBlocked(o: Outcome, ctx: string) {
  if (o.error) {
    expect(o.error.code, `${ctx} — erreur inattendue (pas un refus de sécurité) : ${fmt(o)}`).toBe('42501')
    expect(
      o.error.message,
      `${ctx} — refus par absence de GRANT : les stubs seraient plus stricts que Supabase`,
    ).not.toMatch(/permission denied for (table|schema|sequence|column)/)
  } else {
    expect(o.count, `${ctx} — la tentative a RÉUSSI : ${fmt(o)}`).toBe(0)
  }
}

/** Refus explicite attendu (erreur avec ce code). */
function expectRefused(o: Outcome, code: string | string[], ctx: string, message?: RegExp) {
  const codes = Array.isArray(code) ? code : [code]
  expect(o.error, `${ctx} — devait être refusé, résultat : ${fmt(o)}`).toBeDefined()
  expect(codes, `${ctx} — ${fmt(o)}`).toContain(o.error!.code)
  if (message) expect(o.error!.message, ctx).toMatch(message)
}

/** Fonction non exécutable par ce rôle (droit EXECUTE retiré). */
function expectNoExecute(o: Outcome, ctx: string) {
  expectRefused(o, '42501', ctx, /permission denied for function/)
}

function expectOk(o: Outcome, ctx: string, n?: number) {
  expect(o.error, `${ctx} — ${fmt(o)}`).toBeUndefined()
  if (n === undefined) expect(o.count, `${ctx} — ${fmt(o)}`).toBeGreaterThan(0)
  else expect(o.count, `${ctx} — ${fmt(o)}`).toBe(n)
}

async function snapshot(s: Scenario, table: string, pk: string, id: string) {
  const r = await s.su<{ j: unknown }>(`SELECT to_jsonb(t) AS j FROM ${table} t WHERE ${pk} = $1`, [id])
  return r.length ? JSON.stringify(r[0].j) : null
}

async function countRows(s: Scenario, table: string, where = 'true', params: unknown[] = []) {
  return Number((await s.su<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params))[0].n)
}

/** Tentative d'écriture sur une ligne existante : bloquée ET ligne inchangée. */
async function attemptOnRow(
  s: Scenario,
  actor: Actor,
  target: { table: string; pk?: string; id: string },
  sql: string,
  params: unknown[],
) {
  const pk = target.pk ?? 'id'
  const before = await snapshot(s, target.table, pk, target.id)
  expect(before, `la ligne cible ${target.table}/${target.id} doit exister`).not.toBeNull()
  const o = await s.as(actor, sql, params)
  expectBlocked(o, `${ACTOR_LABEL[actor]} sur ${target.table}`)
  expect(await snapshot(s, target.table, pk, target.id), 'la ligne a changé en base').toBe(before)
}

/** Refus précis (code + message) ET ligne inchangée. */
async function refusedOnRow(
  s: Scenario,
  actor: Actor,
  target: { table: string; pk?: string; id: string },
  sql: string,
  params: unknown[],
  code: string,
  message?: RegExp,
) {
  const pk = target.pk ?? 'id'
  const before = await snapshot(s, target.table, pk, target.id)
  expect(before, `la ligne cible ${target.table}/${target.id} doit exister`).not.toBeNull()
  expectRefused(await s.as(actor, sql, params), code, `${ACTOR_LABEL[actor]} sur ${target.table}`, message)
  expect(await snapshot(s, target.table, pk, target.id), 'la ligne a changé en base').toBe(before)
}

/** Empreinte de toute une table (pour vérifier qu'une écriture de masse n'a rien changé). */
async function tableHash(s: Scenario, table: string, pk = 'id') {
  return (await s.su<{ h: string }>(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '' ORDER BY ${pk}), '')) AS h FROM ${table} t`))[0].h
}

/** Écriture de masse SANS WHERE ni RETURNING : la règle SELECT n'est alors pas
 *  appliquée à la nouvelle ligne, seul le WITH CHECK de la règle UPDATE protège. */
async function attemptMass(s: Scenario, actor: Actor, table: string, sql: string, params: unknown[]) {
  const before = await tableHash(s, table)
  const o = await s.as(actor, sql, params)
  expectBlocked(o, `${ACTOR_LABEL[actor]} écriture de masse ${table}`)
  expect(await tableHash(s, table), `${table} a changé`).toBe(before)
}

/** Tentative d'insertion : bloquée ET aucune ligne ajoutée. */
async function attemptInsert(s: Scenario, actor: Actor, table: string, sql: string, params: unknown[]) {
  const before = await countRows(s, table)
  const o = await s.as(actor, sql, params)
  expectBlocked(o, `${ACTOR_LABEL[actor]} INSERT ${table}`)
  expect(await countRows(s, table), `une ligne a été ajoutée dans ${table}`).toBe(before)
}

// ── Foyers, acteurs, couples attaquant → cible ─────────────────────────────
const FOYERS = ['A', 'A2', 'B'] as const satisfies readonly Foyer[]
const fam: Record<Foyer, string> = { A: ID.famA, A2: ID.famA2, B: ID.famB }
const superFam: Record<Foyer, string> = { A: ID.sfA, A2: ID.sfA, B: ID.sfB }
const rec: Record<Foyer, string> = { A: ID.recA, A2: ID.recA2, B: ID.recB }
const plan: Record<Foyer, string> = { A: ID.planA, A2: ID.planA2, B: ID.planB }
const list: Record<Foyer, string> = { A: ID.listA, A2: ID.listA2, B: ID.listB }
const member: Record<Foyer, Actor> = { A: 'memberA', A2: 'memberA2', B: 'memberB' }
const admin: Record<Foyer, Actor> = { A: 'adminA', A2: 'adminA2', B: 'adminB' }
const memberId: Record<Foyer, string> = { A: ID.memberA, A2: ID.memberA2, B: ID.memberB }
const adminId: Record<Foyer, string> = { A: ID.adminA, A2: ID.adminA2, B: ID.adminB }

/** Couples (attaquant X, cible Y) : autre super-famille (A ↔ B) et même
 *  super-famille (A ↔ A2) — les données d'un foyer restent privées dans les deux cas. */
const PAIRS: [Foyer, Foyer][] = [
  ['A', 'B'],
  ['B', 'A'],
  ['A', 'A2'],
  ['A2', 'A'],
]
/** Couples de super-familles différentes seulement. */
const PAIRS_SF: [Foyer, Foyer][] = [
  ['A', 'B'],
  ['B', 'A'],
  ['A2', 'B'],
]
const lien = (x: Foyer, y: Foyer) => (superFam[x] === superFam[y] ? 'même super-famille' : 'autre super-famille')

// ── Description des tables ─────────────────────────────────────────────────
/** Les 17 tables du schéma public couvertes par le banc. */
const PUBLIC_TABLES = [
  'super_families',
  'families',
  'profiles',
  'super_admins',
  'invitations',
  'recipe_categories',
  'shopping_categories',
  'recipes',
  'recipe_ingredients',
  'recipe_steps',
  'meal_plans',
  'meal_slots',
  'shopping_lists',
  'shopping_list_items',
  'known_ingredients',
  'staples',
  'pantry_items',
] as const
type Table = (typeof PUBLIC_TABLES)[number]
const PK: Partial<Record<Table, string>> = { super_admins: 'user_id' }
const pkOf = (t: Table) => PK[t] ?? 'id'

/** Tables rattachées à un foyer (données privées du foyer). */
interface Scoped {
  table: Table
  label: string
  row: Record<Foyer, string>
  /** Prédicat « la ligne appartient au foyer $1 ». */
  ownedBy: string
  insert: (f: Foyer) => [string, unknown[]]
  set: string
  moveCol: string
  moveVal: Record<Foyer, string>
  /** Un simple membre peut-il supprimer (sinon : admin seulement) ? */
  memberDelete: boolean
}

const SCOPED: Scoped[] = [
  {
    table: 'meal_plans',
    label: 'le planning',
    row: plan,
    ownedBy: 'family_id = $1',
    insert: (f) => [`INSERT INTO public.meal_plans (family_id, week_start) VALUES ($1, '2027-01-04') RETURNING id`, [fam[f]]],
    set: `week_start = '2030-01-07'`,
    moveCol: 'family_id',
    moveVal: fam,
    memberDelete: false,
  },
  {
    table: 'meal_slots',
    label: 'les créneaux du planning',
    row: { A: ID.slotA, A2: ID.slotA2, B: ID.slotB },
    ownedBy: 'meal_plan_id IN (SELECT id FROM public.meal_plans WHERE family_id = $1)',
    insert: (f) => [
      `INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id, portions)
       VALUES ($1, 5, 'soir', $2, 2) RETURNING id`,
      [plan[f], rec[f]],
    ],
    set: 'portions = 9',
    moveCol: 'meal_plan_id',
    moveVal: plan,
    memberDelete: true,
  },
  {
    table: 'shopping_lists',
    label: 'la liste de courses',
    row: list,
    ownedBy: 'family_id = $1',
    insert: (f) => [`INSERT INTO public.shopping_lists (family_id, status) VALUES ($1, 'active') RETURNING id`, [fam[f]]],
    set: `status = 'completed', completed_at = now()`,
    moveCol: 'family_id',
    moveVal: fam,
    memberDelete: false,
  },
  {
    table: 'shopping_list_items',
    label: 'les articles de la liste de courses',
    row: { A: ID.itemA, A2: ID.itemA2, B: ID.itemB },
    ownedBy: 'shopping_list_id IN (SELECT id FROM public.shopping_lists WHERE family_id = $1)',
    insert: (f) => [`INSERT INTO public.shopping_list_items (shopping_list_id, name) VALUES ($1, 'PIRATE') RETURNING id`, [list[f]]],
    set: 'checked = true, checked_at = now()',
    moveCol: 'shopping_list_id',
    moveVal: list,
    memberDelete: true,
  },
  {
    table: 'staples',
    label: 'les achats habituels',
    row: { A: ID.stapleA, A2: ID.stapleA2, B: ID.stapleB },
    ownedBy: 'family_id = $1',
    insert: (f) => [`INSERT INTO public.staples (family_id, name) VALUES ($1, 'PIRATE') RETURNING id`, [fam[f]]],
    set: `name = 'PIRATE'`,
    moveCol: 'family_id',
    moveVal: fam,
    memberDelete: true,
  },
  {
    table: 'pantry_items',
    label: 'le placard',
    row: { A: ID.pantryA, A2: ID.pantryA2, B: ID.pantryB },
    ownedBy: 'family_id = $1',
    insert: (f) => [`INSERT INTO public.pantry_items (family_id, name) VALUES ($1, 'PIRATE') RETURNING id`, [fam[f]]],
    set: `name = 'PIRATE'`,
    moveCol: 'family_id',
    moveVal: fam,
    memberDelete: true,
  },
]

/** Une insertion « légitime » par table (visant le foyer A) : réutilisée par
 *  les attaques anonymes / sans foyer, et validée en super-utilisateur. */
const INSERT_A: Record<Table, [string, unknown[]]> = {
  super_families: [`INSERT INTO public.super_families (name, founder_id) VALUES ('PIRATE', auth.uid()) RETURNING id`, []],
  families: [`INSERT INTO public.families (name, super_family_id) VALUES ('PIRATE', $1) RETURNING id`, [ID.sfA]],
  profiles: [
    `INSERT INTO public.profiles (id, family_id, display_name, role) VALUES ($1, $2, 'PIRATE', 'admin') RETURNING id`,
    [ID.sansProfil, ID.famA],
  ],
  super_admins: [`INSERT INTO public.super_admins (user_id) VALUES ($1) RETURNING user_id`, [ID.sansProfil]],
  invitations: [
    `INSERT INTO public.invitations (token_hash, kind, family_id, role, created_by, expires_at)
     VALUES (md5(random()::text), 'membre', $1, 'admin', coalesce(auth.uid(), $2), now() + interval '7 days') RETURNING id`,
    [ID.famA, ID.adminA],
  ],
  recipe_categories: [`INSERT INTO public.recipe_categories (name) VALUES ('PIRATE') RETURNING id`, []],
  shopping_categories: [`INSERT INTO public.shopping_categories (name) VALUES ('PIRATE') RETURNING id`, []],
  known_ingredients: [`INSERT INTO public.known_ingredients (name) VALUES ('PIRATE') RETURNING id`, []],
  recipes: [`INSERT INTO public.recipes (family_id, title, created_by) VALUES ($1, 'PIRATE', auth.uid()) RETURNING id`, [ID.famA]],
  recipe_ingredients: [`INSERT INTO public.recipe_ingredients (recipe_id, name) VALUES ($1, 'PIRATE') RETURNING id`, [ID.recA]],
  recipe_steps: [
    `INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES ($1, 99, 'PIRATE') RETURNING id`,
    [ID.recA],
  ],
  ...(Object.fromEntries(SCOPED.map((t) => [t.table, t.insert('A')])) as Partial<Record<Table, [string, unknown[]]>>),
} as Record<Table, [string, unknown[]]>

// ── Fonctions de la migration familles_invitations ────────────────────────
const CREATE_INV = `SELECT * FROM public.create_invitation($1, $2, $3, $4)`
const REVOKE_INV = `SELECT public.revoke_invitation($1) AS v`
const INFO_INV = `SELECT * FROM public.invitation_info($1)`
const CONSUME = `SELECT public.consume_invitation($1, $2, $3, $4) AS r`
const CREATE_FAMILY = `SELECT public.create_family($1, $2) AS id`

/** Crée un lien (doit réussir) et renvoie { id, token }. */
async function newInvitation(
  s: Scenario,
  actor: Actor,
  kind: string,
  family: string | null,
  role: string | null,
  label: string | null = null,
): Promise<{ id: string; token: string; expires_at: string }> {
  const o = await s.as(actor, CREATE_INV, [kind, family, role, label])
  expectOk(o, `${ACTOR_LABEL[actor]} create_invitation(${kind})`, 1)
  return o.rows[0] as { id: string; token: string; expires_at: string }
}

/** consume_invitation comme la fonction serveur (clé secrète). */
const consume = (s: Scenario, token: string | null, uid: string, name: string | null = 'Nouveau', famName: string | null = null) =>
  s.service(CONSUME, [token, uid, name, famName])

async function profileOf(s: Scenario, uid: string) {
  const r = await s.su<{ family_id: string; role: string; display_name: string }>(
    `SELECT family_id, role, display_name FROM public.profiles WHERE id = $1`,
    [uid],
  )
  return r[0] ?? null
}

async function invitationState(s: Scenario, id: string) {
  return (await s.su<{ used_at: string | null; used_by: string | null; revoked_at: string | null }>(
    `SELECT used_at, used_by, revoked_at FROM public.invitations WHERE id = $1`,
    [id],
  ))[0]
}

/** Recette du catalogue (livrée avec l'appli) et un de ses ingrédients / étapes. */
async function catalogue(s: Scenario) {
  const r = await s.su<{ rec: string; ing: string; step: string; family_id: string }>(
    `SELECT r.id AS rec, r.family_id,
            (SELECT id FROM public.recipe_ingredients WHERE recipe_id = r.id ORDER BY position, id LIMIT 1) AS ing,
            (SELECT id FROM public.recipe_steps WHERE recipe_id = r.id ORDER BY position, id LIMIT 1) AS step
     FROM public.recipes r WHERE r.visibility = 'catalogue' AND r.title = 'Bœuf bourguignon'`,
  )
  expect(r, 'recette du catalogue « Bœuf bourguignon »').toHaveLength(1)
  expect(r[0].ing && r[0].step, 'la recette du catalogue a des ingrédients et des étapes').toBeTruthy()
  return { recipes: r[0].rec, recipe_ingredients: r[0].ing, recipe_steps: r[0].step, family_id: r[0].family_id }
}

/** Le fondateur C prend son lien « fondateur » : renvoie sa super-famille et sa famille. */
async function becomeFounderC(s: Scenario) {
  const o = await consume(s, TOKEN.invFondateur, ID.founderC, 'Fondateur C', 'Famille C')
  expectOk(o, 'consume_invitation fondateur', 1)
  const fid = o.rows[0].r.family_id as string
  const sf = (await s.su<{ sf: string }>(`SELECT super_family_id AS sf FROM public.families WHERE id = $1`, [fid]))[0].sf
  return { fid, sf }
}

// ════════════════════════════════════════════════════════════════════════════
describe('Structure du schéma et fidélité du banc', () => {
  structure('les 17 tables de public sont toutes couvertes par le banc (aucune table oubliée)', async (s) => {
    const rows = await s.su<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)
    const found = rows.map((r) => r.t)
    const missing = found.filter((t) => !(PUBLIC_TABLES as readonly string[]).includes(t))
    expect(missing, `Nouvelle(s) table(s) non couverte(s) par le banc : ajoute des attaques dans rls.test.ts`).toEqual([])
    expect([...found].sort()).toEqual([...PUBLIC_TABLES].sort())
  })

  structure('RLS est activé sur toutes les tables de public et sur storage.objects', async (s) => {
    const rows = await s.su<{ t: string }>(
      `SELECT n.nspname || '.' || c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relkind IN ('r', 'p') AND (n.nspname = 'public' OR (n.nspname = 'storage' AND c.relname = 'objects'))
         AND NOT c.relrowsecurity`,
    )
    expect(rows.map((r) => r.t), 'tables SANS RLS').toEqual([])
  })

  structure('anon et authenticated ne contournent pas RLS et ne possèdent aucune table', async (s) => {
    const roles = await s.su<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
      `SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`,
    )
    expect(roles).toHaveLength(2)
    for (const r of roles) expect(r.rolbypassrls || r.rolsuper, r.rolname).toBe(false)
    const owned = await s.su(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname IN ('public', 'storage') AND pg_get_userbyid(c.relowner) IN ('anon', 'authenticated')`,
    )
    expect(owned).toEqual([])
  })

  structure('droits par défaut de Supabase en place (le banc n\'est pas plus strict que Supabase)', async (s) => {
    // Sans ces GRANT, tout serait refusé « par manque de droit » et le banc
    // conclurait à tort que RLS protège.
    for (const t of PUBLIC_TABLES) {
      const r = await s.su<{ a: boolean; u: boolean }>(
        `SELECT has_table_privilege('anon', $1, 'SELECT,INSERT,UPDATE,DELETE') AS a,
                has_table_privilege('authenticated', $1, 'SELECT,INSERT,UPDATE,DELETE') AS u`,
        [`public.${t}`],
      )
      expect(r[0].u, `authenticated n'a pas tous les droits sur ${t}`).toBe(true)
      expect(r[0].a, `anon n'a pas tous les droits sur ${t} (Supabase les donne par défaut)`).toBe(true)
    }
  })

  structure('les gabarits d\'écriture du banc sont valides (exécutés en super-utilisateur)', async (s) => {
    // Chaque gabarit est essayé isolément (SAVEPOINT) pour ne pas interférer.
    const isolated = (label: string, sql: string, params: unknown[]) =>
      s.isolated(async () => {
        let rows: unknown[]
        try {
          rows = await s.su(sql, params)
        } catch (e: any) {
          throw new Error(`gabarit invalide (${label}) : ${e?.message ?? e}`)
        }
        expect(rows.length, label).toBe(1)
      })
    for (const t of PUBLIC_TABLES) {
      const [sql, params] = INSERT_A[t]
      await isolated(`INSERT ${t}`, sql, params)
    }
    for (const t of SCOPED) {
      for (const f of FOYERS) {
        for (const g of FOYERS) {
          const [sql, params] = t.insert(g)
          await isolated(`INSERT ${t.table} ${g}`, sql, params)
          if (g !== f) {
            await isolated(`déplacement ${t.table} ${f}→${g}`, `UPDATE public.${t.table} SET ${t.moveCol} = $2 WHERE id = $1 RETURNING id`, [
              t.row[f],
              t.moveVal[g],
            ])
          }
        }
        await isolated(`UPDATE ${t.table}`, `UPDATE public.${t.table} SET ${t.set} WHERE id = $1 RETURNING id`, [t.row[f]])
        await isolated(`DELETE ${t.table}`, `DELETE FROM public.${t.table} WHERE id = $1 RETURNING id`, [t.row[f]])
      }
    }
  })

  structure('seed_recipes + recettes_v1 ont tourné : recettes livrées dans le foyer A, toutes au catalogue', async (s) => {
    const r = await s.su<{ n: number; cat: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE visibility = 'catalogue')::int AS cat
       FROM public.recipes WHERE family_id = $1 AND created_by = $2 AND id <> $3`,
      [ID.famA, ID.adminA, ID.recA],
    )
    expect(r[0].n).toBe(NB_RECETTES_LIVREES)
    expect(r[0].cat).toBe(NB_RECETTES_LIVREES)
    expect(await countRows(s, 'public.recipes', `visibility = 'catalogue'`)).toBe(NB_RECETTES_LIVREES)
  })

  structure('la migration rattache les foyers existants à UNE super-famille (fondateur = super-admin) et met les recettes livrées au catalogue', async () => {
    const f = bench.facts
    expect(f.superFamilies, 'une seule super-famille créée').toHaveLength(1)
    expect(f.superFamilies[0].founder_id, 'fondateur = premier super-admin').toBe(ID.superAdmin)
    expect(f.familiesWithoutSuperFamily).toBe(0)
    expect([...f.familiesInIt].sort()).toEqual([ID.famA, ID.famB].sort())
    expect(f.recipesByVisibility).toEqual({ catalogue: NB_RECETTES_LIVREES })
  })

  structure('données de test : SA ⊃ {A, A2} (fondateur super-admin), SB ⊃ {B} (fondateur admin B)', async (s) => {
    const rows = await s.su<{ id: string; sf: string; founder: string }>(
      `SELECT f.id, f.super_family_id AS sf, s.founder_id AS founder FROM public.families f
       JOIN public.super_families s ON s.id = f.super_family_id ORDER BY f.id`,
    )
    expect(rows).toEqual(
      [
        { id: ID.famA, sf: ID.sfA, founder: ID.superAdmin },
        { id: ID.famA2, sf: ID.sfA, founder: ID.superAdmin },
        { id: ID.famB, sf: ID.sfB, founder: ID.adminB },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    )
    const vis = await s.su<{ id: string; v: string; f: string; c: string }>(
      `SELECT r.id, r.visibility AS v, r.family_id AS f, p.family_id AS c FROM public.recipes r
       JOIN public.profiles p ON p.id = r.created_by WHERE r.id = ANY($1::uuid[]) ORDER BY r.id`,
      [[ID.recA, ID.recAshared, ID.recA2, ID.recB]],
    )
    expect(vis).toHaveLength(4)
    for (const r of vis) expect(r.c, `auteur de ${r.id} membre du foyer propriétaire`).toBe(r.f)
    expect(Object.fromEntries(vis.map((r) => [r.id, r.v]))).toEqual({
      [ID.recA]: 'famille',
      [ID.recAshared]: 'super_famille',
      [ID.recA2]: 'famille',
      [ID.recB]: 'famille',
    })
  })

  structure('chaque table de public contient des données (sinon « ne lit rien » ne prouverait rien)', async (s) => {
    for (const t of PUBLIC_TABLES) expect(await countRows(s, `public.${t}`), t).toBeGreaterThan(0)
    expect(await countRows(s, 'storage.objects')).toBeGreaterThan(0)
  })

  structure('la publication supabase_realtime ne diffuse que des tables protégées par RLS', async (s) => {
    const rows = await s.su<{ t: string; rls: boolean }>(
      `SELECT p.tablename AS t, c.relrowsecurity AS rls FROM pg_publication_tables p
       JOIN pg_class c ON c.relname = p.tablename
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
       WHERE p.pubname = 'supabase_realtime'`,
    )
    expect(rows.map((r) => r.t).sort()).toEqual(['meal_slots', 'shopping_list_items'])
    for (const r of rows) expect(r.rls, r.t).toBe(true)
  })

  structure('fonctions SECURITY DEFINER de public appelables par anon : liste connue et revue', async (s) => {
    const rows = await s.su<{ f: string }>(
      `SELECT p.proname AS f FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')`,
    )
    // Toute nouvelle fonction SECURITY DEFINER ouverte aux anonymes doit être
    // revue (et ajoutée ici avec une attaque) : elle s'exécute avec les droits
    // du propriétaire, RLS ne la protège pas.
    // guard_meal_slot_cook / guard_profile_update : fonctions de trigger, un appel
    // direct est refusé par PostgreSQL (testé plus bas).
    expect(rows.map((r) => r.f).sort()).toEqual(
      [
        'can_edit_recipe',
        'can_invite',
        'can_read_recipe',
        'family_super_family',
        'guard_meal_slot_cook',
        'invitation_info',
        'is_admin',
        'is_family',
        'is_founder',
        'is_founder_of_family',
        'is_member',
        'is_super_admin',
        'my_super_family_id',
        'user_family_id',
      ].sort(),
    )
  })

  structure('droits d\'exécution des fonctions d\'invitation, de famille et des gardes', async (s) => {
    const can = async (role: string, fn: string) =>
      (await s.su<{ v: boolean }>(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS v`, [role, fn]))[0].v
    const expected: [string, { anon: boolean; authenticated: boolean; service_role?: boolean }][] = [
      ['public.create_invitation(text, uuid, text, text)', { anon: false, authenticated: true }],
      ['public.revoke_invitation(uuid)', { anon: false, authenticated: true }],
      ['public.create_family(text, uuid)', { anon: false, authenticated: true }],
      ['public.invitation_info(text)', { anon: true, authenticated: true }],
      ['public.consume_invitation(text, uuid, text, text)', { anon: false, authenticated: false, service_role: true }],
      ['public.guard_family_write()', { anon: false, authenticated: false }],
      ['public.guard_super_family_update()', { anon: false, authenticated: false }],
      ['public.guard_recipe_write()', { anon: false, authenticated: false }],
      ['public.guard_item_checked_by()', { anon: false, authenticated: false }],
      ['public.check_recipe_image_exists()', { anon: false, authenticated: false }],
      ['public.recipe_exists(text)', { anon: false, authenticated: true }],
    ]
    for (const [fn, roles] of expected) {
      for (const [role, v] of Object.entries(roles)) expect(await can(role, fn), `${role} EXECUTE ${fn}`).toBe(v)
    }
  })

  structure('invitations : aucune colonne ne garde le jeton en clair ; super_family_id obligatoire', async (s) => {
    const cols = (await s.su<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invitations'`,
    )).map((r) => r.c)
    expect(cols).toContain('token_hash')
    expect(cols.filter((c) => /token|jeton|secret/.test(c) && c !== 'token_hash')).toEqual([])
    const nn = await s.su<{ n: string }>(
      `SELECT is_nullable AS n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'families' AND column_name = 'super_family_id'`,
    )
    expect(nn[0].n).toBe('NO')
    // Les jetons des données de test ne sont présents nulle part en clair
    for (const t of Object.values(TOKEN)) {
      expect(await countRows(s, 'public.invitations i', `to_jsonb(i)::text LIKE '%' || $1 || '%'`, [t])).toBe(0)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Anonyme (rôle anon, sans claims)', () => {
  for (const t of PUBLIC_TABLES) {
    attaque(`anonyme ne lit rien dans ${t}`, async (s) => {
      expect(await countRows(s, `public.${t}`)).toBeGreaterThan(0)
      const o = await s.as('anon', `SELECT * FROM public.${t}`)
      expectBlocked(o, `anon SELECT ${t}`)
    })
    attaque(`anonyme n'ajoute rien dans ${t}`, async (s) => {
      const [sql, params] = INSERT_A[t]
      await attemptInsert(s, 'anon', `public.${t}`, sql, params)
    })
    attaque(`anonyme ne modifie rien dans ${t}`, async (s) => {
      // SET pk = pk ne change rien : c'est le NOMBRE de lignes touchées qui compte.
      const before = await tableHash(s, `public.${t}`, pkOf(t))
      const o = await s.as('anon', `UPDATE public.${t} SET ${pkOf(t)} = ${pkOf(t)} RETURNING 1`)
      expectBlocked(o, `anon UPDATE ${t}`)
      expect(await tableHash(s, `public.${t}`, pkOf(t))).toBe(before)
    })
    attaque(`anonyme ne supprime rien dans ${t}`, async (s) => {
      const before = await countRows(s, `public.${t}`)
      const o = await s.as('anon', `DELETE FROM public.${t} RETURNING 1`)
      expectBlocked(o, `anon DELETE ${t}`)
      expect(await countRows(s, `public.${t}`)).toBe(before)
    })
  }

  attaque('anonyme ne lit aucune table de public, y compris celles ajoutées par de futures migrations', async (s) => {
    const tables = await s.su<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`)
    for (const { t } of tables) {
      const o = await s.as('anon', `SELECT * FROM public.${t} LIMIT 1`)
      expectBlocked(o, `anon SELECT ${t}`)
    }
  })

  attaque('anonyme ne liste aucune photo du bucket recipe-photos', async (s) => {
    expect(await countRows(s, 'storage.objects')).toBeGreaterThan(0)
    expectBlocked(await s.as('anon', `SELECT name FROM storage.objects WHERE bucket_id = $1`, [PHOTO_BUCKET]), 'anon liste')
  })

  attaque('anonyme ne dépose pas de photo dans recipe-photos', async (s) => {
    await attemptInsert(
      s,
      'anon',
      'storage.objects',
      `INSERT INTO storage.objects (bucket_id, name) VALUES ($1, $2) RETURNING id`,
      [PHOTO_BUCKET, `${ID.recA}/anon.webp`],
    )
  })

  attaque('anonyme ne supprime pas de photo', async (s) => {
    await attemptOnRow(s, 'anon', { table: 'storage.objects', id: ID.objA }, `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [
      ID.objA,
    ])
  })

  // Fonctions RPC (exposées par PostgREST sous /rest/v1/rpc/…)
  const rpcs: [string, string, unknown[], unknown][] = [
    ['is_member()', 'SELECT public.is_member() AS v', [], false],
    ['is_admin()', 'SELECT public.is_admin() AS v', [], false],
    ['is_super_admin()', 'SELECT public.is_super_admin() AS v', [], false],
    ['user_family_id()', 'SELECT public.user_family_id() AS v', [], null],
    ['is_family(foyer A)', 'SELECT public.is_family($1) AS v', [ID.famA], false],
    ['is_family(foyer B)', 'SELECT public.is_family($1) AS v', [ID.famB], false],
    ['my_super_family_id()', 'SELECT public.my_super_family_id() AS v', [], null],
    ['is_founder(SA)', 'SELECT public.is_founder($1) AS v', [ID.sfA], false],
    ['is_founder(SB)', 'SELECT public.is_founder($1) AS v', [ID.sfB], false],
    ['is_founder_of_family(foyer A2)', 'SELECT public.is_founder_of_family($1) AS v', [ID.famA2], false],
    ['can_invite(foyer A)', 'SELECT public.can_invite($1) AS v', [ID.famA], false],
    ['can_read_recipe(recette partagée de A)', 'SELECT public.can_read_recipe($1) AS v', [ID.recAshared], false],
    ['can_read_recipe(recette de B)', 'SELECT public.can_read_recipe($1) AS v', [ID.recB], false],
    ['can_edit_recipe(recette de A)', 'SELECT public.can_edit_recipe($1) AS v', [ID.recA], false],
    ['family_super_family(identifiant inconnu)', 'SELECT public.family_super_family($1) AS v', ['c0000000-0000-4000-8000-0000000000ff'], null],
  ]
  for (const [name, sql, params, expected] of rpcs) {
    attaque(`anonyme appelle ${name} : n'obtient rien (${String(expected)})`, async (s) => {
      const o = await s.as('anon', sql, params)
      expect(o.error).toBeUndefined()
      expect(o.rows[0].v).toBe(expected)
    })
  }
  attaque('anonyme appelle can_read_recipe() sur une recette du catalogue : faux', async (s) => {
    const c = await catalogue(s)
    const o = await s.as('anon', 'SELECT public.can_read_recipe($1) AS v', [c.recipes])
    expect(o.rows[0].v).toBe(false)
  })

  attaque('anonyme ne peut pas appeler recipe_exists() (fermée aux anonymes)', async (s) => {
    expectRefused(await s.as('anon', `SELECT public.recipe_exists($1)`, [ID.recA]), '42501', 'anon recipe_exists', /permission denied for function/)
  })

  attaque('anonyme ne peut pas appeler directement les fonctions trigger SECURITY DEFINER', async (s) => {
    for (const f of [
      'guard_profile_update',
      'guard_meal_slot_cook',
      'guard_family_write',
      'guard_super_family_update',
      'guard_recipe_write',
      'guard_item_checked_by',
      'check_recipe_image_exists',
    ]) {
      const o = await s.as('anon', `SELECT public.${f}()`)
      expectRefused(o, ['0A000', '42501'], `anon ${f}()`)
    }
  })

  attaque('anonyme n\'apprend pas la super-famille d\'une famille (family_super_family renvoie NULL)', async (s) => {
    const o = await s.as('anon', 'SELECT public.family_super_family($1) AS v', [ID.famA])
    expect(o.error).toBeFalsy()
    expect(o.rows[0].v).toBeNull()
  })

  attaque('membre B ne met pas dans sa liste un article rattaché à une recette privée de A (source_recipe_id)', async (s) => {
    const before = await countRows(s, 'public.shopping_list_items')
    const o = await s.as('memberB', `INSERT INTO public.shopping_list_items (shopping_list_id, name, source_recipe_id) VALUES ($1, 'Espion', $2) RETURNING id`, [ID.listB, ID.recA])
    expectRefused(o, '42501', 'source_recipe_id privé', /Recette d'origine inaccessible/)
    expect(await countRows(s, 'public.shopping_list_items')).toBe(before)
  })

  attaque('membre B ne rattache pas un article existant à une recette privée de A (UPDATE source_recipe_id)', async (s) => {
    const before = await snapshot(s, 'public.shopping_list_items', 'id', ID.itemB)
    const o = await s.as('memberB', `UPDATE public.shopping_list_items SET source_recipe_id = $2 WHERE id = $1 RETURNING id`, [ID.itemB, ID.recA])
    expectRefused(o, '42501', 'source_recipe_id privé (update)', /Recette d'origine inaccessible/)
    expect(await snapshot(s, 'public.shopping_list_items', 'id', ID.itemB)).toBe(before)
  })

  attaque('admin A ne crée pas de lien membre sans rôle (erreur claire 22023)', async (s) => {
    const before = await countRows(s, 'public.invitations')
    expectRefused(await s.as('adminA', CREATE_INV, ['membre', ID.famA, null, null]), '22023', 'rôle manquant', /Famille et rôle requis/)
    expect(await countRows(s, 'public.invitations')).toBe(before)
  })

  attaque('anonyme ne crée pas de lien d\'invitation (create_invitation fermée aux anonymes)', async (s) => {
    const before = await countRows(s, 'public.invitations')
    expectNoExecute(await s.as('anon', CREATE_INV, ['membre', ID.famA, 'admin', null]), 'anon membre')
    expectNoExecute(await s.as('anon', CREATE_INV, ['fondateur', null, null, null]), 'anon fondateur')
    expect(await countRows(s, 'public.invitations')).toBe(before)
  })
  attaque('anonyme n\'annule pas de lien (revoke_invitation fermée aux anonymes)', async (s) => {
    const before = await snapshot(s, 'public.invitations', 'id', ID.invA)
    expectNoExecute(await s.as('anon', REVOKE_INV, [ID.invA]), 'anon revoke')
    expect(await snapshot(s, 'public.invitations', 'id', ID.invA)).toBe(before)
  })
  attaque('anonyme ne crée pas de famille (create_family fermée aux anonymes)', async (s) => {
    const before = await countRows(s, 'public.families')
    expectNoExecute(await s.as('anon', CREATE_FAMILY, ['PIRATE', ID.sfA]), 'anon create_family')
    expect(await countRows(s, 'public.families')).toBe(before)
  })
  attaque('anonyme ne consomme pas de lien (consume_invitation réservée à la clé secrète)', async (s) => {
    expectNoExecute(await s.as('anon', CONSUME, [TOKEN.invA, ID.sansProfil, 'Intrus', null]), 'anon consume')
    expect((await invitationState(s, ID.invA)).used_at).toBeNull()
    expect(await profileOf(s, ID.sansProfil)).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Compte connecté sans profil (aucun foyer)', () => {
  for (const t of PUBLIC_TABLES.filter((t) => t !== 'known_ingredients')) {
    attaque(`connecté sans foyer ne lit rien dans ${t}`, async (s) => {
      expectBlocked(await s.as('sansProfil', `SELECT * FROM public.${t}`), `sansProfil SELECT ${t}`)
    })
  }
  for (const t of PUBLIC_TABLES) {
    attaque(`connecté sans foyer n'ajoute rien dans ${t}`, async (s) => {
      const [sql, params] = INSERT_A[t]
      await attemptInsert(s, 'sansProfil', `public.${t}`, sql, params)
    })
  }
  attaque('connecté sans foyer ne se crée pas lui-même un profil admin dans le foyer A', async (s) => {
    await attemptInsert(
      s,
      'sansProfil',
      'public.profiles',
      `INSERT INTO public.profiles (id, family_id, display_name, role) VALUES (auth.uid(), $1, 'Intrus', 'admin') RETURNING id`,
      [ID.famA],
    )
  })
  attaque('connecté sans foyer ne liste pas les photos', async (s) => {
    expectBlocked(await s.as('sansProfil', `SELECT name FROM storage.objects`), 'sansProfil storage')
  })
  attaque('connecté sans foyer ne dépose pas de photo dans le dossier d\'une recette', async (s) => {
    await attemptInsert(
      s,
      'sansProfil',
      'storage.objects',
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, auth.uid()) RETURNING id`,
      [PHOTO_BUCKET, `${ID.recA}/intrus.webp`],
    )
  })
  attaque('connecté sans foyer ne crée ni lien d\'invitation ni famille', async (s) => {
    const inv = await countRows(s, 'public.invitations')
    const fams = await countRows(s, 'public.families')
    expectRefused(await s.as('sansProfil', CREATE_INV, ['membre', ID.famA, 'admin', null]), '42501', 'membre')
    expectRefused(await s.as('sansProfil', CREATE_INV, ['fondateur', null, null, null]), '42501', 'fondateur')
    expectRefused(await s.as('sansProfil', CREATE_FAMILY, ['PIRATE', null]), '42501', 'create_family')
    expectRefused(await s.as('sansProfil', CREATE_FAMILY, ['PIRATE', ID.sfA]), '42501', 'create_family SA')
    expect(await countRows(s, 'public.invitations')).toBe(inv)
    expect(await countRows(s, 'public.families')).toBe(fams)
  })
  attaque('connecté sans foyer ne consomme pas lui-même un lien (consume_invitation fermée à authenticated)', async (s) => {
    expectNoExecute(await s.as('sansProfil', CONSUME, [TOKEN.invA, ID.sansProfil, 'Intrus', null]), 'sansProfil consume')
    expect(await profileOf(s, ID.sansProfil)).toBeNull()
    expect((await invitationState(s, ID.invA)).used_at).toBeNull()
  })
  attaque('connecté sans foyer ne lit pas les recettes du catalogue', async (s) => {
    const c = await catalogue(s)
    expectBlocked(await s.as('sansProfil', `SELECT id FROM public.recipes WHERE id = $1`, [c.recipes]), 'catalogue')
    expectBlocked(await s.as('sansProfil', `SELECT id FROM public.recipe_ingredients WHERE recipe_id = $1`, [c.recipes]), 'ingrédients catalogue')
  })
  controle('connecté sans foyer lit known_ingredients (règle « TO authenticated » voulue)', async (s) => {
    expectOk(await s.as('sansProfil', `SELECT id FROM public.known_ingredients LIMIT 5`), 'sansProfil known_ingredients')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Entre foyers : planning, créneaux, listes, articles, habituels, placard', () => {
  for (const t of SCOPED) {
    describe(t.table, () => {
      const upd = `UPDATE public.${t.table} SET ${t.set} WHERE id = $1 RETURNING id`
      const del = `DELETE FROM public.${t.table} WHERE id = $1 RETURNING id`
      const move = `UPDATE public.${t.table} SET ${t.moveCol} = $2 WHERE id = $1 RETURNING id`
      const target = (f: Foyer) => ({ table: `public.${t.table}`, id: t.row[f] })

      for (const [X, Y] of PAIRS) {
        const m = member[X]
        const a = admin[X]
        const ctx = `${Y} (${lien(X, Y)})`

        attaque(`membre ${X} ne lit pas ${t.label} de ${ctx}`, async (s) => {
          expect(await snapshot(s, `public.${t.table}`, 'id', t.row[Y])).not.toBeNull()
          expectBlocked(await s.as(m, `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row[Y]]), 'lecture par id')
        })
        attaque(`membre ${X}, en lisant toute la table ${t.table}, ne voit aucune ligne de ${ctx}`, async (s) => {
          const theirs = (await s.su<{ id: string }>(`SELECT id FROM public.${t.table} WHERE ${t.ownedBy}`, [fam[Y]])).map(
            (r) => r.id,
          )
          expect(theirs.length).toBeGreaterThan(0)
          const o = await s.as(m, `SELECT id FROM public.${t.table}`)
          expect(o.error).toBeUndefined()
          expect(o.rows.map((r) => r.id).filter((id) => theirs.includes(id))).toEqual([])
        })
        attaque(`membre ${X} n'ajoute rien dans ${t.label} de ${ctx}`, async (s) => {
          const [sql, params] = t.insert(Y)
          await attemptInsert(s, m, `public.${t.table}`, sql, params)
        })
        attaque(`membre ${X} ne modifie pas ${t.label} de ${ctx}`, async (s) => {
          await attemptOnRow(s, m, target(Y), upd, [t.row[Y]])
        })
        attaque(`admin ${X} ne modifie pas ${t.label} de ${ctx}`, async (s) => {
          await attemptOnRow(s, a, target(Y), upd, [t.row[Y]])
        })
        attaque(`membre ${X} ne supprime pas ${t.label} de ${ctx}`, async (s) => {
          await attemptOnRow(s, m, target(Y), del, [t.row[Y]])
        })
        attaque(`admin ${X} ne supprime pas ${t.label} de ${ctx}`, async (s) => {
          await attemptOnRow(s, a, target(Y), del, [t.row[Y]])
        })
        attaque(`membre ${X} ne déplace pas ${t.label} de son foyer vers ${ctx} (UPDATE ${t.moveCol})`, async (s) => {
          await attemptOnRow(s, m, target(X), move, [t.row[X], t.moveVal[Y]])
        })
        attaque(`membre ${X} ne rapatrie pas ${t.label} de ${ctx} dans son foyer (UPDATE ${t.moveCol})`, async (s) => {
          await attemptOnRow(s, m, target(Y), move, [t.row[Y], t.moveVal[X]])
        })
        attaque(`membre ${X} ne déplace pas en masse ${t.label} de son foyer vers ${ctx} (UPDATE sans WHERE ni RETURNING)`, async (s) => {
          await attemptMass(s, m, `public.${t.table}`, `UPDATE public.${t.table} SET ${t.moveCol} = $1`, [t.moveVal[Y]])
        })
      }

      // Le fondateur d'une super-famille n'est membre que de SA famille : les
      // données privées des autres familles de sa super-famille lui restent fermées.
      attaque(`le fondateur de SA (super-admin, membre de A seulement) ne lit pas ${t.label} de A2`, async (s) => {
        const o = await s.as('superAdmin', `SELECT id FROM public.${t.table} WHERE id = $1`, [t.row.A2])
        expectBlocked(o, 'super-admin lit A2')
      })

      // Contrôles positifs : les MÊMES requêtes sur ses propres données passent.
      for (const X of FOYERS) {
        const m = member[X]
        const a = admin[X]
        controle(`membre ${X} lit ${t.label} de son foyer`, async (s) => {
          expectOk(await s.as(m, `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row[X]]), 'lecture', 1)
        })
        controle(`membre ${X} ajoute dans ${t.label} de son foyer`, async (s) => {
          const [sql, params] = t.insert(X)
          const before = await countRows(s, `public.${t.table}`)
          expectOk(await s.as(m, sql, params), 'insertion', 1)
          expect(await countRows(s, `public.${t.table}`)).toBe(before + 1)
        })
        controle(`membre ${X} modifie ${t.label} de son foyer`, async (s) => {
          const before = await snapshot(s, `public.${t.table}`, 'id', t.row[X])
          expectOk(await s.as(m, upd, [t.row[X]]), 'modification', 1)
          expect(await snapshot(s, `public.${t.table}`, 'id', t.row[X])).not.toBe(before)
        })
        if (t.memberDelete) {
          controle(`membre ${X} supprime dans ${t.label} de son foyer`, async (s) => {
            expectOk(await s.as(m, del, [t.row[X]]), 'suppression', 1)
            expect(await snapshot(s, `public.${t.table}`, 'id', t.row[X])).toBeNull()
          })
        } else {
          attaque(`membre ${X} (non admin) ne supprime pas ${t.label} de son propre foyer`, async (s) => {
            await attemptOnRow(s, m, target(X), del, [t.row[X]])
          })
          controle(`admin ${X} supprime ${t.label} de son foyer`, async (s) => {
            expectOk(await s.as(a, del, [t.row[X]]), 'suppression admin', 1)
            expect(await snapshot(s, `public.${t.table}`, 'id', t.row[X])).toBeNull()
          })
        }
      }
    })
  }
})

// ════════════════════════════════════════════════════════════════════════════
describe('Foyers (families)', () => {
  const rename = `UPDATE public.families SET name = 'PIRATE' WHERE id = $1 RETURNING id`
  const delFam = `DELETE FROM public.families WHERE id = $1 RETURNING id`
  for (const [X, Y] of PAIRS) {
    const target = { table: 'public.families', id: fam[Y] }
    const ctx = `${Y} (${lien(X, Y)})`
    if (superFam[X] !== superFam[Y]) {
      attaque(`membre ${X} ne lit pas le foyer ${ctx}`, async (s) => {
        expectBlocked(await s.as(member[X], `SELECT * FROM public.families WHERE id = $1`, [fam[Y]]), 'lecture')
      })
    } else {
      controle(`membre ${X} lit le nom du foyer ${ctx}`, async (s) => {
        expectOk(await s.as(member[X], `SELECT name FROM public.families WHERE id = $1`, [fam[Y]]), 'lecture', 1)
      })
    }
    attaque(`membre ${X} ne renomme pas le foyer ${ctx}`, async (s) => {
      await attemptOnRow(s, member[X], target, rename, [fam[Y]])
    })
    attaque(`admin ${X} ne renomme pas le foyer ${ctx}`, async (s) => {
      await attemptOnRow(s, admin[X], target, rename, [fam[Y]])
    })
    attaque(`admin ${X} ne supprime pas le foyer ${ctx}`, async (s) => {
      await attemptOnRow(s, admin[X], target, delFam, [fam[Y]])
    })
  }
  const visibles: Record<Foyer, string[]> = { A: [ID.famA, ID.famA2], A2: [ID.famA, ID.famA2], B: [ID.famB] }
  for (const X of FOYERS) {
    controle(`membre ${X} lit son foyer et ceux de sa super-famille, et seulement eux`, async (s) => {
      const o = await s.as(member[X], `SELECT id FROM public.families`)
      expectOk(o, 'lecture', visibles[X].length)
      expect(o.rows.map((r) => r.id).sort()).toEqual([...visibles[X]].sort())
    })
  }
  attaque('admin A ne crée pas de foyer par INSERT direct (même dans sa super-famille)', async (s) => {
    const [sql, params] = INSERT_A.families
    await attemptInsert(s, 'adminA', 'public.families', sql, params)
  })
  attaque('admin B (fondateur de SB) ne crée pas de foyer par INSERT direct (create_family seulement)', async (s) => {
    await attemptInsert(s, 'adminB', 'public.families', `INSERT INTO public.families (name, super_family_id) VALUES ('PIRATE', $1) RETURNING id`, [
      ID.sfB,
    ])
  })
  attaque('membre A (non admin) ne renomme pas son propre foyer', async (s) => {
    await attemptOnRow(s, 'memberA', { table: 'public.families', id: ID.famA }, rename, [ID.famA])
  })
  attaque('admin A ne supprime pas son propre foyer (réservé au super-admin)', async (s) => {
    await attemptOnRow(s, 'adminA', { table: 'public.families', id: ID.famA }, delFam, [ID.famA])
  })
  attaque('admin A ne donne pas un nom vide à son foyer', async (s) => {
    const before = await snapshot(s, 'public.families', 'id', ID.famA)
    expectRefused(await s.as('adminA', `UPDATE public.families SET name = '   ' WHERE id = $1 RETURNING id`, [ID.famA]), '23514', 'nom vide')
    expect(await snapshot(s, 'public.families', 'id', ID.famA)).toBe(before)
  })
  for (const X of ['A', 'A2'] as const) {
    controle(`admin ${X} renomme son foyer`, async (s) => {
      expectOk(await s.as(admin[X], `UPDATE public.families SET name = 'Nouveau nom' WHERE id = $1 RETURNING id`, [fam[X]]), 'renommage', 1)
      expect((await s.su(`SELECT name FROM public.families WHERE id = $1`, [fam[X]]))[0].name).toBe('Nouveau nom')
    })
  }
  controle('super-admin lit les trois foyers et peut renommer le foyer B', async (s) => {
    expectOk(await s.as('superAdmin', `SELECT id FROM public.families`), 'lecture', 3)
    expectOk(await s.as('superAdmin', `UPDATE public.families SET name = 'Foyer B bis' WHERE id = $1 RETURNING id`, [ID.famB]), 'maj', 1)
  })

  // Changer de super-famille (trigger guard_family_write)
  attaque('admin A ne fait pas passer son foyer dans la super-famille SB', async (s) => {
    await refusedOnRow(
      s,
      'adminA',
      { table: 'public.families', id: ID.famA },
      `UPDATE public.families SET super_family_id = $2 WHERE id = $1 RETURNING id`,
      [ID.famA, ID.sfB],
      '42501',
      /super-famille/,
    )
  })
  attaque('membre A (non admin) ne change pas la super-famille de son foyer', async (s) => {
    await attemptOnRow(s, 'memberA', { table: 'public.families', id: ID.famA }, `UPDATE public.families SET super_family_id = $2 WHERE id = $1 RETURNING id`, [
      ID.famA,
      ID.sfB,
    ])
  })
  attaque('admin B (fondateur de SB) ne fait pas passer le foyer B dans SA', async (s) => {
    await refusedOnRow(
      s,
      'adminB',
      { table: 'public.families', id: ID.famB },
      `UPDATE public.families SET super_family_id = $2 WHERE id = $1 RETURNING id`,
      [ID.famB, ID.sfA],
      '42501',
      /super-famille/,
    )
  })
  attaque('admin B (fondateur de SB) n\'attire pas le foyer A dans SB', async (s) => {
    await attemptOnRow(s, 'adminB', { table: 'public.families', id: ID.famA }, `UPDATE public.families SET super_family_id = $2 WHERE id = $1 RETURNING id`, [
      ID.famA,
      ID.sfB,
    ])
  })
  attaque('admin A ne change pas de super-famille par un UPDATE sans WHERE ni RETURNING', async (s) => {
    await attemptMass(s, 'adminA', 'public.families', `UPDATE public.families SET super_family_id = $1`, [ID.sfB])
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Super-familles (super_families)', () => {
  const SF = 'public.super_families'
  for (const [X, Y] of PAIRS_SF) {
    attaque(`membre ${X} ne lit pas la super-famille de ${Y}`, async (s) => {
      expectBlocked(await s.as(member[X], `SELECT * FROM public.super_families WHERE id = $1`, [superFam[Y]]), 'lecture')
    })
    attaque(`admin ${X} ne renomme pas la super-famille de ${Y}`, async (s) => {
      await attemptOnRow(s, admin[X], { table: SF, id: superFam[Y] }, `UPDATE public.super_families SET name = 'PIRATE' WHERE id = $1 RETURNING id`, [
        superFam[Y],
      ])
    })
  }
  for (const X of FOYERS) {
    controle(`membre ${X} lit sa super-famille, et seulement elle`, async (s) => {
      const o = await s.as(member[X], `SELECT id FROM public.super_families`)
      expectOk(o, 'lecture', 1)
      expect(o.rows[0].id).toBe(superFam[X])
    })
  }
  for (const actor of ['memberA', 'adminA', 'adminA2', 'adminB', 'superAdmin'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne crée pas de super-famille par INSERT direct`, async (s) => {
      const [sql, params] = INSERT_A.super_families
      await attemptInsert(s, actor, SF, sql, params)
    })
  }
  for (const actor of ['memberA', 'adminA', 'adminA2'] as const) {
    attaque(`${ACTOR_LABEL[actor]} (pas fondateur) ne renomme pas SA`, async (s) => {
      await attemptOnRow(s, actor, { table: SF, id: ID.sfA }, `UPDATE public.super_families SET name = 'PIRATE' WHERE id = $1 RETURNING id`, [ID.sfA])
    })
  }
  attaque('membre B ne renomme pas SB (seul le fondateur)', async (s) => {
    await attemptOnRow(s, 'memberB', { table: SF, id: ID.sfB }, `UPDATE public.super_families SET name = 'PIRATE' WHERE id = $1 RETURNING id`, [ID.sfB])
  })
  attaque('membre B ne s\'approprie pas SB (UPDATE founder_id = soi)', async (s) => {
    await attemptOnRow(s, 'memberB', { table: SF, id: ID.sfB }, `UPDATE public.super_families SET founder_id = auth.uid() WHERE id = $1 RETURNING id`, [
      ID.sfB,
    ])
  })
  attaque('le fondateur de SB ne transfère pas sa super-famille au membre B', async (s) => {
    await refusedOnRow(
      s,
      'adminB',
      { table: SF, id: ID.sfB },
      `UPDATE public.super_families SET founder_id = $2 WHERE id = $1 RETURNING id`,
      [ID.sfB, ID.memberB],
      '42501',
      /fondateur/,
    )
  })
  attaque('le fondateur de SB ne transfère pas sa super-famille par un UPDATE sans WHERE ni RETURNING', async (s) => {
    await attemptMass(s, 'adminB', SF, `UPDATE public.super_families SET founder_id = $1`, [ID.adminA])
  })
  attaque('le fondateur de SB ne change pas l\'identifiant de sa super-famille', async (s) => {
    await refusedOnRow(
      s,
      'adminB',
      { table: SF, id: ID.sfB },
      `UPDATE public.super_families SET id = gen_random_uuid() WHERE id = $1 RETURNING id`,
      [ID.sfB],
      '42501',
      /fondateur/,
    )
  })
  for (const [actor, sf] of [
    ['adminB', ID.sfB],
    ['superAdmin', ID.sfA],
    ['adminA', ID.sfA],
  ] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne supprime pas de super-famille (aucune règle DELETE)`, async (s) => {
      await attemptOnRow(s, actor, { table: SF, id: sf }, `DELETE FROM public.super_families WHERE id = $1 RETURNING id`, [sf])
    })
  }
  controle('le fondateur de SB renomme sa super-famille', async (s) => {
    expectOk(await s.as('adminB', `UPDATE public.super_families SET name = 'SB renommée' WHERE id = $1 RETURNING id`, [ID.sfB]), 'renommage', 1)
  })
  controle('le super-admin (fondateur de SA) renomme SA et lit les deux super-familles', async (s) => {
    expectOk(await s.as('superAdmin', `UPDATE public.super_families SET name = 'SA renommée' WHERE id = $1 RETURNING id`, [ID.sfA]), 'renommage', 1)
    expectOk(await s.as('superAdmin', `SELECT id FROM public.super_families`), 'lecture', 2)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Profils et élévation de privilège', () => {
  const P = 'public.profiles'
  const upd = (set: string) => `UPDATE public.profiles SET ${set} WHERE id = $1 RETURNING id`
  const row = (id: string) => ({ table: P, id })

  for (const [X, Y] of PAIRS) {
    const ctx = `${Y} (${lien(X, Y)})`
    attaque(`membre ${X} ne lit pas les profils de ${ctx}`, async (s) => {
      const o = await s.as(member[X], `SELECT id FROM public.profiles WHERE family_id = $1`, [fam[Y]])
      expectBlocked(o, 'profils de l\'autre foyer')
      expectBlocked(await s.as(member[X], `SELECT id FROM public.profiles WHERE id = $1`, [memberId[Y]]), 'par id')
    })
    attaque(`admin ${X} ne lit pas les profils de ${ctx}`, async (s) => {
      expectBlocked(await s.as(admin[X], `SELECT id FROM public.profiles WHERE family_id = $1`, [fam[Y]]), 'admin')
    })
    attaque(`admin ${X} ne change pas le rôle d'un membre de ${ctx}`, async (s) => {
      await attemptOnRow(s, admin[X], row(memberId[Y]), upd(`role = 'admin'`), [memberId[Y]])
    })
    attaque(`admin ${X} ne rétrograde pas l'admin de ${ctx}`, async (s) => {
      await attemptOnRow(s, admin[X], row(adminId[Y]), upd(`role = 'member'`), [adminId[Y]])
    })
    attaque(`admin ${X} ne renomme pas un profil de ${ctx}`, async (s) => {
      await attemptOnRow(s, admin[X], row(memberId[Y]), upd(`display_name = 'PIRATE'`), [memberId[Y]])
    })
  }
  for (const X of FOYERS) {
    controle(`membre ${X} lit les profils de son foyer, et seulement eux`, async (s) => {
      const o = await s.as(member[X], `SELECT family_id FROM public.profiles`)
      expectOk(o, 'lecture')
      expect(new Set(o.rows.map((r) => r.family_id))).toEqual(new Set([fam[X]]))
    })
  }
  attaque('admin B (fondateur de SB) ne lit pas les profils de SA', async (s) => {
    expectBlocked(await s.as('adminB', `SELECT id FROM public.profiles WHERE family_id = ANY($1::uuid[])`, [[ID.famA, ID.famA2]]), 'fondateur SB')
  })

  attaque('membre A ne se passe pas admin (UPDATE role)', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberA), upd(`role = 'admin'`), [ID.memberA])
  })
  attaque('membre A ne change pas son family_id vers le foyer B', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberA), upd('family_id = $2'), [ID.memberA, ID.famB])
  })
  attaque('membre A ne change pas son family_id vers le foyer A2 (même super-famille)', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberA), upd('family_id = $2'), [ID.memberA, ID.famA2])
  })
  attaque('membre A ne change pas l\'identifiant de son profil', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberA), upd('id = $2'), [ID.memberA, ID.sansProfil])
  })
  attaque('membre A ne rétrograde pas l\'admin A (rôle d\'un autre)', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.adminA), upd(`role = 'member'`), [ID.adminA])
  })
  attaque('membre A ne renomme pas le profil de l\'admin A', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.adminA), upd(`display_name = 'PIRATE'`), [ID.adminA])
  })
  attaque('membre A ne modifie pas le profil du membre B', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberB), upd(`display_name = 'PIRATE'`), [ID.memberB])
  })
  attaque('admin A n\'attire pas le membre B dans son foyer (UPDATE family_id)', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberB), upd('family_id = $2'), [ID.memberB, ID.famA])
  })
  attaque('admin A n\'envoie pas le membre A dans le foyer B (UPDATE family_id)', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberA), upd('family_id = $2'), [ID.memberA, ID.famB])
  })
  attaque('admin A n\'envoie pas le membre A dans le foyer A2 (même super-famille)', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberA), upd('family_id = $2'), [ID.memberA, ID.famA2])
  })
  attaque('membre A ne change pas de foyer par un UPDATE sans WHERE ni RETURNING', async (s) => {
    await attemptMass(s, 'memberA', P, `UPDATE public.profiles SET family_id = $1`, [ID.famB])
  })
  attaque('membre A ne se passe pas admin par un UPDATE sans WHERE ni RETURNING', async (s) => {
    await attemptMass(s, 'memberA', P, `UPDATE public.profiles SET role = 'admin'`, [])
  })
  attaque('admin A n\'envoie pas tout son foyer vers B par un UPDATE sans WHERE ni RETURNING', async (s) => {
    await attemptMass(s, 'adminA', P, `UPDATE public.profiles SET family_id = $1`, [ID.famB])
  })
  attaque('admin A ne change pas de foyer lui-même', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.adminA), upd('family_id = $2'), [ID.adminA, ID.famB])
  })
  attaque('admin A ne modifie pas son propre rôle', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.adminA), upd(`role = 'member'`), [ID.adminA])
  })
  attaque('membre A ne crée pas de profil (même dans son foyer)', async (s) => {
    const [sql, params] = INSERT_A.profiles
    await attemptInsert(s, 'memberA', P, sql, params)
  })
  attaque('admin A ne crée pas de profil dans son foyer (invitation seulement)', async (s) => {
    const [sql, params] = INSERT_A.profiles
    await attemptInsert(s, 'adminA', P, sql, params)
  })
  attaque('admin B (fondateur de SB) ne crée pas de profil dans son foyer (invitation seulement)', async (s) => {
    await attemptInsert(s, 'adminB', P, `INSERT INTO public.profiles (id, family_id, display_name, role) VALUES ($1, $2, 'X', 'member') RETURNING id`, [
      ID.sansProfil,
      ID.famB,
    ])
  })
  attaque('membre A ne supprime pas le profil du membre B', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberB), `DELETE FROM public.profiles WHERE id = $1 RETURNING id`, [ID.memberB])
  })
  attaque('admin A ne supprime pas le profil du membre A (réservé au super-admin)', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberA), `DELETE FROM public.profiles WHERE id = $1 RETURNING id`, [ID.memberA])
  })
  attaque('admin A ne supprime pas le profil de l\'admin B', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.adminB), `DELETE FROM public.profiles WHERE id = $1 RETURNING id`, [ID.adminB])
  })
  attaque('admin B (fondateur de SB) ne change pas un rôle dans A2 (autre super-famille)', async (s) => {
    await attemptOnRow(s, 'adminB', row(ID.memberA2), upd(`role = 'admin'`), [ID.memberA2])
  })

  controle('membre A change son nom d\'affichage', async (s) => {
    expectOk(await s.as('memberA', upd(`display_name = 'Nouveau nom'`), [ID.memberA]), 'nom', 1)
    expect((await s.su(`SELECT display_name FROM public.profiles WHERE id = $1`, [ID.memberA]))[0].display_name).toBe('Nouveau nom')
  })
  controle('admin A promeut le membre A (même foyer)', async (s) => {
    expectOk(await s.as('adminA', upd(`role = 'admin'`), [ID.memberA]), 'promotion', 1)
    expect((await profileOf(s, ID.memberA)).role).toBe('admin')
  })
  controle('admin A2 promeut le membre A2 (même foyer)', async (s) => {
    expectOk(await s.as('adminA2', upd(`role = 'admin'`), [ID.memberA2]), 'promotion', 1)
    expect((await profileOf(s, ID.memberA2)).role).toBe('admin')
  })
  controle('le fondateur de SA (super-admin) lit les profils de A2 et change le rôle du membre A2', async (s) => {
    expectOk(await s.as('superAdmin', `SELECT id FROM public.profiles WHERE family_id = $1`, [ID.famA2]), 'lecture', 2)
    expectOk(await s.as('superAdmin', upd(`role = 'admin'`), [ID.memberA2]), 'promotion', 1)
    expect((await profileOf(s, ID.memberA2)).role).toBe('admin')
  })
  controle('super-admin modifie un profil du foyer B', async (s) => {
    expectOk(await s.as('superAdmin', upd(`display_name = 'Renommé'`), [ID.memberB]), 'super-admin', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Super-admins', () => {
  const S = { table: 'public.super_admins', pk: 'user_id', id: ID.superAdmin }
  for (const actor of ['memberA', 'adminA', 'adminB', 'adminA2'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne lit pas la liste des super-admins`, async (s) => {
      expectBlocked(await s.as(actor, `SELECT * FROM public.super_admins`), 'lecture')
    })
    attaque(`${ACTOR_LABEL[actor]} ne se déclare pas super-admin`, async (s) => {
      await attemptInsert(s, actor, S.table, `INSERT INTO public.super_admins (user_id) VALUES (auth.uid()) RETURNING user_id`, [])
    })
  }
  attaque('admin A ne remplace pas le super-admin par lui-même (UPDATE user_id)', async (s) => {
    await attemptOnRow(s, 'adminA', S, `UPDATE public.super_admins SET user_id = $2 WHERE user_id = $1 RETURNING user_id`, [
      ID.superAdmin,
      ID.adminA,
    ])
  })
  attaque('admin A ne supprime pas le super-admin', async (s) => {
    await attemptOnRow(s, 'adminA', S, `DELETE FROM public.super_admins WHERE user_id = $1 RETURNING user_id`, [ID.superAdmin])
  })
  attaque('même le super-admin n\'ajoute pas de super-admin via l\'API (console uniquement)', async (s) => {
    await attemptInsert(s, 'superAdmin', S.table, `INSERT INTO public.super_admins (user_id) VALUES ($1) RETURNING user_id`, [ID.adminB])
  })
  controle('le super-admin se voit dans super_admins', async (s) => {
    expectOk(await s.as('superAdmin', `SELECT user_id FROM public.super_admins`), 'lecture', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Données de référence : catégories et known_ingredients', () => {
  for (const t of ['recipe_categories', 'shopping_categories', 'known_ingredients'] as const) {
    controle(`membre A lit ${t}`, async (s) => {
      expectOk(await s.as('memberA', `SELECT id FROM public.${t} LIMIT 3`), 'lecture')
    })
    for (const actor of ['memberA', 'adminA'] as const) {
      attaque(`${ACTOR_LABEL[actor]} n'ajoute rien dans ${t}`, async (s) => {
        const [sql, params] = INSERT_A[t]
        await attemptInsert(s, actor, `public.${t}`, sql, params)
      })
      attaque(`${ACTOR_LABEL[actor]} ne modifie rien dans ${t}`, async (s) => {
        const id = (await s.su<{ id: string }>(`SELECT id FROM public.${t} ORDER BY name LIMIT 1`))[0].id
        await attemptOnRow(s, actor, { table: `public.${t}`, id }, `UPDATE public.${t} SET name = 'PIRATE' WHERE id = $1 RETURNING id`, [id])
      })
      attaque(`${ACTOR_LABEL[actor]} ne supprime rien dans ${t}`, async (s) => {
        const before = await countRows(s, `public.${t}`)
        expectBlocked(await s.as(actor, `DELETE FROM public.${t} RETURNING id`), 'suppression')
        expect(await countRows(s, `public.${t}`)).toBe(before)
      })
    }
  }
  attaque('même le super-admin n\'écrit pas dans known_ingredients via l\'API (aucune règle d\'écriture)', async (s) => {
    const [sql, params] = INSERT_A.known_ingredients
    await attemptInsert(s, 'superAdmin', 'public.known_ingredients', sql, params)
  })
  controle('super-admin ajoute une catégorie de recette (règle super-admin)', async (s) => {
    const [sql, params] = INSERT_A.recipe_categories
    expectOk(await s.as('superAdmin', sql, params), 'insertion', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Recettes : visibilité famille / super-famille / catalogue', () => {
  type RT = 'recipes' | 'recipe_ingredients' | 'recipe_steps'
  const recipeTables: {
    table: RT
    label: string
    row: Record<Foyer | 'Ashared', string>
    parentCol: string
    parent: Record<Foyer, string>
    set: string
  }[] = [
    {
      table: 'recipes',
      label: 'la recette',
      row: { ...rec, Ashared: ID.recAshared },
      parentCol: 'family_id',
      parent: fam,
      set: `title = 'PIRATE'`,
    },
    {
      table: 'recipe_ingredients',
      label: 'les ingrédients de la recette',
      row: { A: ID.ingA, A2: ID.ingA2, B: ID.ingB, Ashared: ID.ingAshared },
      parentCol: 'recipe_id',
      parent: rec,
      set: `name = 'PIRATE'`,
    },
    {
      table: 'recipe_steps',
      label: 'les étapes de la recette',
      row: { A: ID.stepA, A2: ID.stepA2, B: ID.stepB, Ashared: ID.stepAshared },
      parentCol: 'recipe_id',
      parent: rec,
      set: `instruction = 'PIRATE'`,
    },
  ]

  for (const t of recipeTables) {
    const upd = `UPDATE public.${t.table} SET ${t.set} WHERE id = $1 RETURNING id`
    const del = `DELETE FROM public.${t.table} WHERE id = $1 RETURNING id`
    const move = `UPDATE public.${t.table} SET ${t.parentCol} = $2 WHERE id = $1 RETURNING id`
    const target = (id: string) => ({ table: `public.${t.table}`, id })

    // Recettes « famille » : privées au foyer, même dans la super-famille
    for (const [X, Y] of PAIRS) {
      const ctx = `${Y} (« famille », ${lien(X, Y)})`
      attaque(`membre ${X} ne lit pas ${t.label} de ${ctx}`, async (s) => {
        expectBlocked(await s.as(member[X], `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row[Y]]), 'lecture')
      })
      attaque(`membre ${X} ne modifie pas ${t.label} de ${ctx}`, async (s) => {
        await attemptOnRow(s, member[X], target(t.row[Y]), upd, [t.row[Y]])
      })
      attaque(`admin ${X} ne modifie pas ${t.label} de ${ctx}`, async (s) => {
        await attemptOnRow(s, admin[X], target(t.row[Y]), upd, [t.row[Y]])
      })
      attaque(`membre ${X} ne supprime pas ${t.label} de ${ctx}`, async (s) => {
        await attemptOnRow(s, member[X], target(t.row[Y]), del, [t.row[Y]])
      })
      attaque(`admin ${X} ne supprime pas ${t.label} de ${ctx}`, async (s) => {
        await attemptOnRow(s, admin[X], target(t.row[Y]), del, [t.row[Y]])
      })
      attaque(`membre ${X} ne déplace pas ${t.label} de son foyer vers ${Y} (UPDATE ${t.parentCol})`, async (s) => {
        await attemptOnRow(s, member[X], target(t.row[X]), move, [t.row[X], t.parent[Y]])
      })
      attaque(`membre ${X} ne s'approprie pas ${t.label} de ${Y} (UPDATE ${t.parentCol})`, async (s) => {
        await attemptOnRow(s, member[X], target(t.row[Y]), move, [t.row[Y], t.parent[X]])
      })
      attaque(`membre ${X} ne déplace pas en masse ${t.label} de son foyer vers ${Y} (UPDATE sans WHERE ni RETURNING)`, async (s) => {
        await attemptMass(s, member[X], `public.${t.table}`, `UPDATE public.${t.table} SET ${t.parentCol} = $1`, [t.parent[Y]])
      })
    }
    for (const X of FOYERS) {
      controle(`membre ${X} lit et modifie ${t.label} de son foyer`, async (s) => {
        expectOk(await s.as(member[X], `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row[X]]), 'lecture', 1)
        expectOk(await s.as(member[X], upd, [t.row[X]]), 'modification', 1)
      })
    }

    // Recette « super_famille » de A : lisible dans SA, modifiable par A seulement
    controle(`membre A2 lit ${t.label} partagée par A (même super-famille)`, async (s) => {
      expectOk(await s.as('memberA2', `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row.Ashared]), 'lecture', 1)
    })
    for (const actor of ['memberB', 'adminB'] as const) {
      attaque(`${ACTOR_LABEL[actor]} ne lit pas ${t.label} partagée par A (autre super-famille)`, async (s) => {
        expectBlocked(await s.as(actor, `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row.Ashared]), 'lecture')
      })
    }
    for (const actor of ['memberA2', 'adminA2', 'adminB'] as const) {
      attaque(`${ACTOR_LABEL[actor]} ne modifie pas ${t.label} partagée par A (lecture seule)`, async (s) => {
        await attemptOnRow(s, actor, target(t.row.Ashared), upd, [t.row.Ashared])
      })
      attaque(`${ACTOR_LABEL[actor]} ne supprime pas ${t.label} partagée par A`, async (s) => {
        await attemptOnRow(s, actor, target(t.row.Ashared), del, [t.row.Ashared])
      })
    }
    controle(`membre A modifie ${t.label} qu'il partage`, async (s) => {
      expectOk(await s.as('memberA', upd, [t.row.Ashared]), 'modification', 1)
    })

    // Catalogue : lecture par tous les membres, écriture super-admin seulement
    for (const actor of ['memberA', 'memberA2', 'memberB'] as const) {
      controle(`${ACTOR_LABEL[actor]} lit ${t.label} du catalogue`, async (s) => {
        const c = await catalogue(s)
        expectOk(await s.as(actor, `SELECT * FROM public.${t.table} WHERE id = $1`, [c[t.table]]), 'lecture', 1)
      })
    }
    for (const actor of ['memberA', 'adminA', 'memberB', 'adminA2'] as const) {
      const proprio = actor === 'memberA' || actor === 'adminA' ? ' (foyer propriétaire)' : ''
      attaque(`${ACTOR_LABEL[actor]}${proprio} ne modifie pas ${t.label} du catalogue`, async (s) => {
        const c = await catalogue(s)
        await attemptOnRow(s, actor, target(c[t.table]), upd, [c[t.table]])
      })
      attaque(`${ACTOR_LABEL[actor]}${proprio} ne supprime pas ${t.label} du catalogue`, async (s) => {
        const c = await catalogue(s)
        await attemptOnRow(s, actor, target(c[t.table]), del, [c[t.table]])
      })
    }
    controle(`super-admin modifie ${t.label} du catalogue`, async (s) => {
      const c = await catalogue(s)
      expectOk(await s.as('superAdmin', upd, [c[t.table]]), 'modification', 1)
    })
  }

  // Ajouts dans une recette qu'on ne peut pas modifier
  const addIng = `INSERT INTO public.recipe_ingredients (recipe_id, name) VALUES ($1, 'PIRATE') RETURNING id`
  const addStep = `INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES ($1, 9, 'PIRATE') RETURNING id`
  for (const [X, Y] of PAIRS) {
    attaque(`membre ${X} ne crée pas de recette au nom du foyer ${Y}`, async (s) => {
      await attemptInsert(s, member[X], 'public.recipes', `INSERT INTO public.recipes (family_id, title, created_by) VALUES ($1, 'PIRATE', auth.uid()) RETURNING id`, [
        fam[Y],
      ])
    })
    attaque(`membre ${X} n'ajoute pas d'ingrédient ni d'étape à une recette de ${Y}`, async (s) => {
      await attemptInsert(s, member[X], 'public.recipe_ingredients', addIng, [rec[Y]])
      await attemptInsert(s, member[X], 'public.recipe_steps', addStep, [rec[Y]])
    })
  }
  attaque('membre A2 n\'ajoute pas d\'ingrédient ni d\'étape à la recette partagée par A', async (s) => {
    await attemptInsert(s, 'memberA2', 'public.recipe_ingredients', addIng, [ID.recAshared])
    await attemptInsert(s, 'memberA2', 'public.recipe_steps', addStep, [ID.recAshared])
  })
  attaque('admin A (foyer propriétaire) n\'ajoute pas d\'ingrédient ni d\'étape à une recette du catalogue', async (s) => {
    const c = await catalogue(s)
    await attemptInsert(s, 'adminA', 'public.recipe_ingredients', addIng, [c.recipes])
    await attemptInsert(s, 'adminA', 'public.recipe_steps', addStep, [c.recipes])
  })
  attaque('membre A2 ne rattache pas un ingrédient de sa recette à la recette partagée par A', async (s) => {
    await attemptOnRow(s, 'memberA2', { table: 'public.recipe_ingredients', id: ID.ingA2 }, `UPDATE public.recipe_ingredients SET recipe_id = $2 WHERE id = $1 RETURNING id`, [
      ID.ingA2,
      ID.recAshared,
    ])
  })
  for (const X of FOYERS) {
    controle(`membre ${X} crée une recette, un ingrédient et une étape dans son foyer`, async (s) => {
      expectOk(
        await s.as(member[X], `INSERT INTO public.recipes (family_id, title, created_by) VALUES ($1, 'Ma recette', auth.uid()) RETURNING id`, [fam[X]]),
        'recette',
        1,
      )
      expectOk(await s.as(member[X], `INSERT INTO public.recipe_ingredients (recipe_id, name) VALUES ($1, 'Sel') RETURNING id`, [rec[X]]), 'ingrédient', 1)
      expectOk(
        await s.as(member[X], `INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES ($1, 9, 'Servir') RETURNING id`, [rec[X]]),
        'étape',
        1,
      )
    })
  }

  // Ce que chacun voit
  const propres: Record<Foyer, string[]> = {
    A: [ID.recA, ID.recAshared],
    A2: [ID.recA2, ID.recAshared],
    B: [ID.recB],
  }
  for (const X of FOYERS) {
    controle(`membre ${X} voit le catalogue + ses recettes + celles partagées dans sa super-famille, rien d'autre`, async (s) => {
      const o = await s.as(member[X], `SELECT id, visibility FROM public.recipes`)
      expectOk(o, 'lecture', NB_RECETTES_LIVREES + propres[X].length)
      expect(o.rows.filter((r) => r.visibility === 'catalogue')).toHaveLength(NB_RECETTES_LIVREES)
      expect(o.rows.filter((r) => r.visibility !== 'catalogue').map((r) => r.id).sort()).toEqual([...propres[X]].sort())
    })
  }
  controle('super-admin voit toutes les recettes', async (s) => {
    expectOk(await s.as('superAdmin', `SELECT id FROM public.recipes`), 'lecture', NB_RECETTES_LIVREES + 4)
  })

  // Catalogue : création / passage interdits
  for (const actor of ['memberA', 'adminA'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne crée pas de recette « catalogue »`, async (s) => {
      await attemptInsert(
        s,
        actor,
        'public.recipes',
        `INSERT INTO public.recipes (family_id, title, created_by, visibility) VALUES ($1, 'PIRATE', auth.uid(), 'catalogue') RETURNING id`,
        [ID.famA],
      )
    })
    attaque(`${ACTOR_LABEL[actor]} ne passe pas sa recette au catalogue`, async (s) => {
      await attemptOnRow(s, actor, { table: 'public.recipes', id: ID.recA }, `UPDATE public.recipes SET visibility = 'catalogue' WHERE id = $1 RETURNING id`, [
        ID.recA,
      ])
    })
    attaque(`${ACTOR_LABEL[actor]} ne sort pas une recette du catalogue (pour la modifier ensuite)`, async (s) => {
      const c = await catalogue(s)
      await attemptOnRow(s, actor, { table: 'public.recipes', id: c.recipes }, `UPDATE public.recipes SET visibility = 'famille' WHERE id = $1 RETURNING id`, [
        c.recipes,
      ])
    })
  }
  attaque('membre A ne passe pas en masse les recettes du catalogue en « famille » (UPDATE sans WHERE ni RETURNING)', async (s) => {
    // Ses 2 recettes à lui peuvent changer (c'est permis) ; le catalogue, jamais.
    const cat = () =>
      s.su<{ h: string }>(
        `SELECT md5(string_agg(to_jsonb(t)::text, '' ORDER BY id)) AS h FROM public.recipes t WHERE family_id = $1 AND id <> ALL($2::uuid[])`,
        [ID.famA, [ID.recA, ID.recAshared]],
      )
    const before = (await cat())[0].h
    const o = await s.as('memberA', `UPDATE public.recipes SET visibility = 'famille'`)
    expect(o.error, fmt(o)).toBeUndefined()
    expect(o.count, 'seules ses 2 recettes sont touchées').toBe(2)
    expect(await countRows(s, 'public.recipes', `visibility = 'catalogue'`)).toBe(NB_RECETTES_LIVREES)
    expect((await cat())[0].h, 'le catalogue a changé').toBe(before)
  })
  controle('super-admin crée une recette du catalogue', async (s) => {
    expectOk(
      await s.as('superAdmin', `INSERT INTO public.recipes (family_id, title, created_by, visibility) VALUES ($1, 'Livrée', auth.uid(), 'catalogue') RETURNING id`, [
        ID.famA,
      ]),
      'catalogue',
      1,
    )
  })

  // Auteur et foyer figés (trigger guard_recipe_write)
  for (const [label, author] of [
    ['l\'admin A (autre membre du foyer)', ID.adminA],
    ['le membre B', ID.memberB],
    ['personne (NULL)', null],
  ] as const) {
    attaque(`membre A ne crée pas de recette en donnant pour auteur ${label}`, async (s) => {
      const before = await countRows(s, 'public.recipes')
      const o = await s.as('memberA', `INSERT INTO public.recipes (family_id, title, created_by) VALUES ($1, 'Usurpée', $2) RETURNING id`, [ID.famA, author])
      expectRefused(o, '42501', 'created_by usurpé', /Auteur/)
      expect(await countRows(s, 'public.recipes')).toBe(before)
    })
  }
  attaque('membre A ne change pas l\'auteur de la recette de son foyer', async (s) => {
    await refusedOnRow(
      s,
      'memberA',
      { table: 'public.recipes', id: ID.recA },
      `UPDATE public.recipes SET created_by = auth.uid() WHERE id = $1 RETURNING id`,
      [ID.recA],
      '42501',
      /famille ou auteur/,
    )
  })
  attaque('admin A ne fait pas passer sa recette dans le foyer A2 (UPDATE family_id)', async (s) => {
    await attemptOnRow(s, 'adminA', { table: 'public.recipes', id: ID.recAshared }, `UPDATE public.recipes SET family_id = $2 WHERE id = $1 RETURNING id`, [
      ID.recAshared,
      ID.famA2,
    ])
  })

  // Passage « super_famille » → « famille » (trigger guard_recipe_write)
  const toFamille = `UPDATE public.recipes SET visibility = 'famille' WHERE id = $1 RETURNING id`
  controle('membre A2 planifie la recette partagée par A', async (s) => {
    expectOk(
      await s.as('memberA2', `INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id) VALUES ($1, 3, 'soir', $2) RETURNING id`, [
        ID.planA2,
        ID.recAshared,
      ]),
      'planification',
      1,
    )
  })
  attaque('recette partagée au planning de A2 : l\'admin A ne la repasse pas en « famille »', async (s) => {
    await s.su(`INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id) VALUES ($1, 3, 'soir', $2)`, [ID.planA2, ID.recAshared])
    await refusedOnRow(s, 'adminA', { table: 'public.recipes', id: ID.recAshared }, toFamille, [ID.recAshared], '23514', /planning d'une autre famille/)
  })
  attaque('recette partagée au planning de A2 : le membre A ne la repasse pas en « famille » par un UPDATE de masse', async (s) => {
    await s.su(`INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id) VALUES ($1, 3, 'soir', $2)`, [ID.planA2, ID.recAshared])
    const before = await tableHash(s, 'public.recipes')
    const o = await s.as('memberA', `UPDATE public.recipes SET visibility = 'famille' WHERE visibility = 'super_famille'`)
    expectRefused(o, '23514', 'masse', /planning d'une autre famille/)
    expect(await tableHash(s, 'public.recipes')).toBe(before)
  })
  controle('sans planning d\'une autre famille, l\'admin A repasse sa recette partagée en « famille » (même planifiée chez lui)', async (s) => {
    await s.su(`INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id) VALUES ($1, 3, 'soir', $2)`, [ID.planA, ID.recAshared])
    expectOk(await s.as('adminA', toFamille, [ID.recAshared]), 'repasse en famille', 1)
  })
  controle('membre A partage sa recette dans la super-famille (« famille » → « super_famille »)', async (s) => {
    expectOk(await s.as('memberA', `UPDATE public.recipes SET visibility = 'super_famille' WHERE id = $1 RETURNING id`, [ID.recA]), 'partage', 1)
    expectOk(await s.as('memberA2', `SELECT id FROM public.recipes WHERE id = $1`, [ID.recA]), 'A2 la lit', 1)
    expectBlocked(await s.as('memberB', `SELECT id FROM public.recipes WHERE id = $1`, [ID.recA]), 'B ne la lit pas')
  })

  // Planning : on ne planifie que ce qu'on peut lire
  const addSlot = `INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id) VALUES ($1, 6, 'soir', $2) RETURNING id`
  for (const [actor, planId, recId, label] of [
    ['memberA2', ID.planA2, ID.recA, 'la recette « famille » de A'],
    ['memberB', ID.planB, ID.recA, 'la recette « famille » de A'],
    ['memberB', ID.planB, ID.recAshared, 'la recette partagée de A (autre super-famille)'],
    ['memberA', ID.planA, ID.recA2, 'la recette « famille » de A2'],
  ] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne planifie pas ${label} (INSERT créneau)`, async (s) => {
      await attemptInsert(s, actor, 'public.meal_slots', addSlot, [planId, recId])
    })
  }
  attaque('membre A2 ne met pas la recette « famille » de A dans un créneau existant (UPDATE recipe_id)', async (s) => {
    await attemptOnRow(s, 'memberA2', { table: 'public.meal_slots', id: ID.slotA2 }, `UPDATE public.meal_slots SET recipe_id = $2 WHERE id = $1 RETURNING id`, [
      ID.slotA2,
      ID.recA,
    ])
  })
  attaque('membre A2 ne met pas la recette « famille » de A dans ses créneaux par un UPDATE sans WHERE ni RETURNING', async (s) => {
    await attemptMass(s, 'memberA2', 'public.meal_slots', `UPDATE public.meal_slots SET recipe_id = $1`, [ID.recA])
  })
  controle('membre B planifie une recette du catalogue', async (s) => {
    const c = await catalogue(s)
    expectOk(await s.as('memberB', addSlot, [ID.planB, c.recipes]), 'catalogue', 1)
  })

  // Suppressions
  attaque('membre A (non admin) ne supprime pas une recette de son propre foyer', async (s) => {
    await attemptOnRow(s, 'memberA', { table: 'public.recipes', id: ID.recA }, `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [ID.recA])
  })
  controle('admin A supprime une recette de son foyer', async (s) => {
    expectOk(await s.as('adminA', `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [ID.recA]), 'suppression', 1)
  })
  controle('super-admin supprime n\'importe quelle recette (foyer B, autre super-famille ; catalogue)', async (s) => {
    const c = await catalogue(s)
    expectOk(await s.as('superAdmin', `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [ID.recB]), 'recette B', 1)
    expectOk(await s.as('superAdmin', `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [c.recipes]), 'catalogue', 1)
  })
  controle('membre A supprime un ingrédient et une étape de sa recette', async (s) => {
    expectOk(await s.as('memberA', `DELETE FROM public.recipe_ingredients WHERE id = $1 RETURNING id`, [ID.ingA]), 'ingrédient', 1)
    expectOk(await s.as('memberA', `DELETE FROM public.recipe_steps WHERE id = $1 RETURNING id`, [ID.stepA]), 'étape', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('recipes.image_url : chemin de notre bucket ou Unsplash seulement (security_fixes + photo_paths)', () => {
  const bad: [string, string][] = [
    ['un site quelconque (pixel espion)', 'https://espion.example/pixel.gif'],
    ['Unsplash en http', 'http://images.unsplash.com/photo-1'],
    ['un faux domaine Unsplash', 'https://images.unsplash.com.espion.example/x.jpg'],
    ['un chemin bizarre chez Unsplash', 'https://images.unsplash.com/../espion/x.gif'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['un autre bucket Supabase', 'https://abcdefghijkl.supabase.co/storage/v1/object/public/autre-bucket/x.webp'],
    // Faille corrigée par photo_paths : le stockage d'un AUTRE projet Supabase (celui d'un attaquant)
    ['le stockage d\'un AUTRE projet Supabase (projet d\'un attaquant)', 'https://projetattaquant.supabase.co/storage/v1/object/public/recipe-photos/pixel.webp'],
    // Plus aucune URL complète, même de notre projet : seulement un chemin
    ['une URL complète de stockage Supabase (même « recipe-photos »)', `https://abcdefghijkl.supabase.co/storage/v1/object/public/recipe-photos/${ID.recA}/c0ffee00-0000-4000-8000-00000000000a.webp`],
    ['un chemin qui remonte de dossier', `../${ID.recA}/c0ffee00-0000-4000-8000-00000000000a.webp`],
    ['un chemin au mauvais format (svg)', `${ID.recA}/c0ffee00-0000-4000-8000-00000000000a.svg`],
  ]
  for (const [label, url] of bad) {
    attaque(`membre A ne crée pas de recette dont l'image pointe vers ${label}`, async (s) => {
      const before = await countRows(s, 'public.recipes')
      const o = await s.as(
        'memberA',
        `INSERT INTO public.recipes (family_id, title, image_url, created_by) VALUES ($1, 'Image', $2, auth.uid()) RETURNING id`,
        [ID.famA, url],
      )
      expectRefused(o, '23514', `image_url ${url}`, /recipes_image_url_origin/)
      expect(await countRows(s, 'public.recipes')).toBe(before)
    })
  }
  attaque('membre A ne remplace pas l\'image de sa recette par un site quelconque', async (s) => {
    const before = await snapshot(s, 'public.recipes', 'id', ID.recA)
    const o = await s.as('memberA', `UPDATE public.recipes SET image_url = $2 WHERE id = $1 RETURNING id`, [ID.recA, 'https://espion.example/p.gif'])
    expectRefused(o, '23514', 'image_url update', /recipes_image_url_origin/)
    expect(await snapshot(s, 'public.recipes', 'id', ID.recA)).toBe(before)
  })
  attaque('membre A ne met pas sur sa recette la photo rangée dans le dossier d\'une recette de B', async (s) => {
    const before = await snapshot(s, 'public.recipes', 'id', ID.recA)
    const o = await s.as('memberA', `UPDATE public.recipes SET image_url = $2 WHERE id = $1 RETURNING id`, [ID.recA, photoPath.B])
    expectRefused(o, '23514', 'photo de B', /recipes_image_url_origin/)
    expect(await snapshot(s, 'public.recipes', 'id', ID.recA)).toBe(before)
  })
  attaque('membre A ne met pas sur sa recette un chemin qui ne correspond à aucun fichier envoyé', async (s) => {
    const before = await snapshot(s, 'public.recipes', 'id', ID.recA)
    const o = await s.as('memberA', `UPDATE public.recipes SET image_url = $2 WHERE id = $1 RETURNING id`, [
      ID.recA,
      `${ID.recA}/deadbeef-0000-4000-8000-000000000000.webp`,
    ])
    expectRefused(o, '23514', 'fichier inexistant', /Photo introuvable/)
    expect(await snapshot(s, 'public.recipes', 'id', ID.recA)).toBe(before)
  })
  controle('image_url : photo Unsplash, chemin d\'une photo envoyée dans le dossier de la recette, ou rien', async (s) => {
    for (const url of ['https://images.unsplash.com/photo-1609607285694-e283bd2ea9a0?w=800&h=600&fit=crop&auto=format', photoPath.A, null]) {
      expectOk(await s.as('memberA', `UPDATE public.recipes SET image_url = $2 WHERE id = $1 RETURNING id`, [ID.recA, url]), String(url), 1)
    }
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('meal_slots.cook_id : le cuisinier doit être du foyer (trigger de household)', () => {
  attaque('membre A ne désigne pas le membre B comme cuisinier d\'un créneau de A (UPDATE)', async (s) => {
    const before = await snapshot(s, 'public.meal_slots', 'id', ID.slotA)
    const o = await s.as('memberA', `UPDATE public.meal_slots SET cook_id = $2 WHERE id = $1 RETURNING id`, [ID.slotA, ID.memberB])
    expectRefused(o, '42501', 'cook_id B', /cuisinier/)
    expect(await snapshot(s, 'public.meal_slots', 'id', ID.slotA)).toBe(before)
  })
  attaque('membre A ne désigne pas le membre A2 (même super-famille) comme cuisinier', async (s) => {
    const o = await s.as('memberA', `UPDATE public.meal_slots SET cook_id = $2 WHERE id = $1 RETURNING id`, [ID.slotA, ID.memberA2])
    expectRefused(o, '42501', 'cook_id A2', /cuisinier/)
  })
  attaque('membre A ne crée pas de créneau avec le membre B comme cuisinier (INSERT)', async (s) => {
    const before = await countRows(s, 'public.meal_slots')
    const o = await s.as(
      'memberA',
      `INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id, cook_id) VALUES ($1, 6, 'midi', $2, $3) RETURNING id`,
      [ID.planA, ID.recA, ID.adminB],
    )
    expectRefused(o, '42501', 'cook_id B insert', /cuisinier/)
    expect(await countRows(s, 'public.meal_slots')).toBe(before)
  })
  attaque('membre A ne désigne pas un compte sans foyer comme cuisinier', async (s) => {
    const o = await s.as('memberA', `UPDATE public.meal_slots SET cook_id = $2 WHERE id = $1 RETURNING id`, [ID.slotA, ID.sansProfil])
    expectRefused(o, '42501', 'cook_id sans profil', /cuisinier/)
  })
  attaque('membre A ne déplace pas un créneau AVEC cuisinier de A vers le planning de B', async (s) => {
    await s.su(`UPDATE public.meal_slots SET cook_id = $2 WHERE id = $1`, [ID.slotA, ID.memberA])
    await attemptOnRow(s, 'memberA', { table: 'public.meal_slots', id: ID.slotA }, `UPDATE public.meal_slots SET meal_plan_id = $2 WHERE id = $1 RETURNING id`, [
      ID.slotA,
      ID.planB,
    ])
  })
  controle('membre A désigne l\'admin A comme cuisinier', async (s) => {
    expectOk(await s.as('memberA', `UPDATE public.meal_slots SET cook_id = $2 WHERE id = $1 RETURNING id`, [ID.slotA, ID.adminA]), 'cook A', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Gardes : « coché par » et planning rattaché à une liste', () => {
  const setChecker = `UPDATE public.shopping_list_items SET checked = true, checked_by = $2 WHERE id = $1 RETURNING id`
  for (const [label, who] of [
    ['le membre B (autre super-famille)', ID.memberB],
    ['le membre A2 (même super-famille, autre foyer)', ID.memberA2],
    ['un compte sans foyer', ID.sansProfil],
  ] as const) {
    attaque(`membre A ne coche pas un article de A au nom de ${label}`, async (s) => {
      await refusedOnRow(s, 'memberA', { table: 'public.shopping_list_items', id: ID.itemA }, setChecker, [ID.itemA, who], '42501', /Coché par/)
    })
  }
  attaque('membre A n\'ajoute pas un article déjà coché par le membre B', async (s) => {
    const before = await countRows(s, 'public.shopping_list_items')
    const o = await s.as(
      'memberA',
      `INSERT INTO public.shopping_list_items (shopping_list_id, name, checked, checked_by) VALUES ($1, 'X', true, $2) RETURNING id`,
      [ID.listA, ID.memberB],
    )
    expectRefused(o, '42501', 'insert checked_by', /Coché par/)
    expect(await countRows(s, 'public.shopping_list_items')).toBe(before)
  })
  controle('membre A coche un article à son nom ou au nom de l\'admin A', async (s) => {
    expectOk(await s.as('memberA', setChecker, [ID.itemA, ID.memberA]), 'soi', 1)
    expectOk(await s.as('memberA', setChecker, [ID.itemA, ID.adminA]), 'admin A', 1)
  })

  const addList = `INSERT INTO public.shopping_lists (family_id, meal_plan_id, status) VALUES ($1, $2, 'active') RETURNING id`
  const setPlan = `UPDATE public.shopping_lists SET meal_plan_id = $2 WHERE id = $1 RETURNING id`
  for (const [label, planId] of [
    ['du foyer B (autre super-famille)', ID.planB],
    ['du foyer A2 (même super-famille)', ID.planA2],
  ] as const) {
    attaque(`membre A ne crée pas de liste rattachée au planning ${label}`, async (s) => {
      await attemptInsert(s, 'memberA', 'public.shopping_lists', addList, [ID.famA, planId])
    })
    attaque(`membre A ne rattache pas sa liste au planning ${label} (UPDATE)`, async (s) => {
      await attemptOnRow(s, 'memberA', { table: 'public.shopping_lists', id: ID.listA }, setPlan, [ID.listA, planId])
    })
    attaque(`membre A ne rattache pas ses listes au planning ${label} par un UPDATE sans WHERE ni RETURNING`, async (s) => {
      await attemptMass(s, 'memberA', 'public.shopping_lists', `UPDATE public.shopping_lists SET meal_plan_id = $1`, [planId])
    })
  }
  controle('membre A crée une liste rattachée à son planning, ou sans planning', async (s) => {
    expectOk(await s.as('memberA', addList, [ID.famA, ID.planA]), 'avec planning', 1)
    expectOk(await s.as('memberA', addList, [ID.famA, null]), 'sans planning', 1)
    expectOk(await s.as('memberA', setPlan, [ID.listA, null]), 'détache', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Photos : storage.objects, bucket recipe-photos', () => {
  const ins = `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, auth.uid()) RETURNING id`
  const obj: Record<Foyer, string> = { A: ID.objA, A2: ID.objA2, B: ID.objB }

  for (const [X, Y] of PAIRS) {
    const ctx = `${Y} (${lien(X, Y)})`
    attaque(`membre ${X} ne dépose pas de photo dans le dossier d'une recette de ${ctx}`, async (s) => {
      await attemptInsert(s, member[X], 'storage.objects', ins, [PHOTO_BUCKET, `${rec[Y]}/pirate.webp`])
    })
    attaque(`admin ${X} ne dépose pas de photo dans le dossier d'une recette de ${ctx}`, async (s) => {
      await attemptInsert(s, admin[X], 'storage.objects', ins, [PHOTO_BUCKET, `${rec[Y]}/pirate.jpg`])
    })
    attaque(`membre ${X} ne supprime pas une photo d'une recette de ${ctx}`, async (s) => {
      await attemptOnRow(s, member[X], { table: 'storage.objects', id: obj[Y] }, `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [obj[Y]])
    })
    attaque(`admin ${X} ne supprime pas une photo d'une recette de ${ctx}`, async (s) => {
      await attemptOnRow(s, admin[X], { table: 'storage.objects', id: obj[Y] }, `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [obj[Y]])
    })
    attaque(`membre ${X} ne renomme/déplace pas une photo de ${ctx} vers son dossier`, async (s) => {
      await attemptOnRow(s, member[X], { table: 'storage.objects', id: obj[Y] }, `UPDATE storage.objects SET name = $2 WHERE id = $1 RETURNING id`, [
        obj[Y],
        `${rec[X]}/vol.webp`,
      ])
    })
  }
  for (const actor of ['memberA2', 'adminA2'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne dépose pas de photo dans le dossier de la recette partagée par A (envoi = recette modifiable)`, async (s) => {
      await attemptInsert(s, actor, 'storage.objects', ins, [PHOTO_BUCKET, `${ID.recAshared}/pirate.webp`])
    })
    attaque(`${ACTOR_LABEL[actor]} ne supprime pas la photo de la recette partagée par A`, async (s) => {
      await attemptOnRow(s, actor, { table: 'storage.objects', id: ID.objAshared }, `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [
        ID.objAshared,
      ])
    })
  }
  for (const actor of ['memberA', 'adminA'] as const) {
    attaque(`${ACTOR_LABEL[actor]} (foyer propriétaire) ne dépose pas de photo dans le dossier d'une recette du catalogue`, async (s) => {
      const c = await catalogue(s)
      await attemptInsert(s, actor, 'storage.objects', ins, [PHOTO_BUCKET, `${c.recipes}/pirate.webp`])
    })
  }
  controle('super-admin dépose une photo dans le dossier d\'une recette du catalogue', async (s) => {
    const c = await catalogue(s)
    expectOk(await s.as('superAdmin', ins, [PHOTO_BUCKET, `${c.recipes}/officielle.webp`]), 'dépôt', 1)
  })
  for (const X of FOYERS) {
    controle(`membre ${X} dépose une photo dans le dossier d'une recette de son foyer`, async (s) => {
      expectOk(await s.as(member[X], ins, [PHOTO_BUCKET, `${rec[X]}/nouvelle.webp`]), 'dépôt', 1)
    })
    controle(`membre ${X} supprime une photo d'une recette de son foyer`, async (s) => {
      expectOk(await s.as(member[X], `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [obj[X]]), 'suppression', 1)
    })
  }
  controle('membre A dépose une photo dans le dossier de la recette qu\'il partage', async (s) => {
    expectOk(await s.as('memberA', ins, [PHOTO_BUCKET, `${ID.recAshared}/nouvelle.webp`]), 'dépôt', 1)
  })

  // Liste des photos : seulement celles des recettes lisibles
  const lisibles: Record<Foyer, string[]> = {
    A: [objName.A, photoPath.A, objName.Ashared],
    A2: [objName.A2, objName.Ashared],
    B: [objName.B, photoPath.B],
  }
  const toutes = [objName.A, photoPath.A, objName.Ashared, objName.A2, objName.B, photoPath.B]
  for (const X of FOYERS) {
    attaque(`membre ${X} ne liste pas les photos des recettes qu'il ne peut pas lire`, async (s) => {
      const o = await s.as(member[X], `SELECT name FROM storage.objects WHERE bucket_id = $1`, [PHOTO_BUCKET])
      expect(o.error).toBeUndefined()
      const interdites = toutes.filter((n) => !lisibles[X].includes(n))
      expect(o.rows.map((r) => r.name).filter((n) => interdites.includes(n))).toEqual([])
    })
    controle(`membre ${X} liste les photos des recettes qu'il peut lire`, async (s) => {
      const o = await s.as(member[X], `SELECT name FROM storage.objects WHERE bucket_id = $1`, [PHOTO_BUCKET])
      expectOk(o, 'liste', lisibles[X].length)
      expect(o.rows.map((r) => r.name).sort()).toEqual([...lisibles[X]].sort())
    })
  }
  attaque('membre A n\'écrase pas sa propre photo (pas de règle UPDATE)', async (s) => {
    await attemptOnRow(s, 'memberA', { table: 'storage.objects', id: ID.objA }, `UPDATE storage.objects SET metadata = '{"x":1}' WHERE id = $1 RETURNING id`, [
      ID.objA,
    ])
  })
  for (const [label, name] of [
    ['dans un sous-dossier', `${ID.recA}/sous/x.webp`],
    ['avec une extension .svg', `${ID.recA}/x.svg`],
    ['avec une extension .html', `${ID.recA}/x.html`],
    ['à la racine du bucket', 'x.webp'],
    ['dans le dossier d\'une recette inexistante', 'a0000000-0000-4000-8000-0000000000ff/x.webp'],
  ] as const) {
    attaque(`membre A ne dépose pas de fichier ${label}`, async (s) => {
      await attemptInsert(s, 'memberA', 'storage.objects', ins, [PHOTO_BUCKET, name])
    })
  }
  attaque('membre A ne dépose rien dans un autre bucket', async (s) => {
    await attemptInsert(s, 'memberA', 'storage.objects', ins, [OTHER_BUCKET, `${ID.recA}/x.webp`])
  })
  attaque('membre A ne lit pas les objets d\'un autre bucket', async (s) => {
    await s.su(`INSERT INTO storage.objects (bucket_id, name) VALUES ($1, 'prive.txt')`, [OTHER_BUCKET])
    expectBlocked(await s.as('memberA', `SELECT name FROM storage.objects WHERE bucket_id = $1`, [OTHER_BUCKET]), 'autre bucket')
  })
  controle('le chemin des photos de test correspond bien au dossier de leur recette', async (s) => {
    const r = await s.su<{ name: string }>(`SELECT name FROM storage.objects WHERE id = $1`, [ID.objA])
    expect(r[0].name).toBe(objName.A)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Invitations : la table', () => {
  const I = 'public.invitations'
  const inv: Record<Foyer, string> = { A: ID.invA, A2: ID.invA2, B: ID.invB }
  attaque('membre A (non admin) ne lit aucune invitation, même de son foyer', async (s) => {
    expectBlocked(await s.as('memberA', `SELECT * FROM public.invitations`), 'membre A')
  })
  for (const [X, Y] of PAIRS) {
    attaque(`admin ${X} ne lit pas les invitations de ${Y} (${lien(X, Y)})`, async (s) => {
      expectBlocked(await s.as(admin[X], `SELECT * FROM public.invitations WHERE id = $1`, [inv[Y]]), 'lecture')
    })
  }
  for (const actor of ['adminA', 'adminB', 'adminA2'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne lit pas les liens « fondateur »`, async (s) => {
      expectBlocked(await s.as(actor, `SELECT * FROM public.invitations WHERE kind = 'fondateur'`), 'fondateur')
    })
  }
  for (const X of FOYERS) {
    controle(`admin ${X} lit les invitations de son foyer, et seulement elles`, async (s) => {
      const o = await s.as(admin[X], `SELECT id FROM public.invitations`)
      expectOk(o, 'lecture', 1)
      expect(o.rows[0].id).toBe(inv[X])
    })
  }
  controle('le super-admin (fondateur de SA) lit toutes les invitations, dont celles de A2 et les liens fondateur', async (s) => {
    expectOk(await s.as('superAdmin', `SELECT id FROM public.invitations`), 'lecture', 4)
  })

  // Aucune écriture directe : tout passe par les fonctions
  for (const actor of ['adminA', 'superAdmin', 'adminB'] as const) {
    attaque(`${ACTOR_LABEL[actor]} n'insère pas directement de lien dans invitations`, async (s) => {
      await attemptInsert(
        s,
        actor,
        I,
        `INSERT INTO public.invitations (token_hash, kind, family_id, role, created_by, expires_at)
         VALUES (md5('choisi'), 'membre', $1, 'admin', auth.uid(), now() + interval '1 year') RETURNING id`,
        [actor === 'adminB' ? ID.famB : ID.famA],
      )
    })
  }
  for (const [label, set] of [
    ['ne prolonge pas un lien', `expires_at = now() + interval '10 years'`],
    ['ne change pas le rôle d\'un lien', `role = 'admin'`],
    ['ne remet pas à zéro un lien (used_at, revoked_at)', `used_at = NULL, revoked_at = NULL`],
    ['ne remplace pas l\'empreinte du jeton par une valeur connue', `token_hash = md5('choisi')`],
  ] as const) {
    for (const actor of ['adminA', 'superAdmin'] as const) {
      attaque(`${ACTOR_LABEL[actor]} ${label} par UPDATE direct`, async (s) => {
        await attemptOnRow(s, actor, { table: I, id: ID.invA }, `UPDATE public.invitations SET ${set} WHERE id = $1 RETURNING id`, [ID.invA])
      })
    }
  }
  for (const actor of ['adminA', 'superAdmin'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne supprime pas directement un lien`, async (s) => {
      await attemptOnRow(s, actor, { table: I, id: ID.invA }, `DELETE FROM public.invitations WHERE id = $1 RETURNING id`, [ID.invA])
    })
  }
})

// ════════════════════════════════════════════════════════════════════════════
describe('Invitations : create_invitation / revoke_invitation / invitation_info', () => {
  // Création
  for (const [actor, famId, label] of [
    ['memberA', ID.famA, 'son propre foyer (non admin)'],
    ['adminA', ID.famB, 'le foyer B (autre super-famille)'],
    ['adminA', ID.famA2, 'le foyer A2 (même super-famille)'],
    ['adminA2', ID.famA, 'le foyer A (même super-famille)'],
    ['adminB', ID.famA, 'le foyer A (le fondateur de SB n\'a pas de droit sur SA)'],
    ['memberB', ID.famB, 'son propre foyer (membre de SB, non admin, non fondateur)'],
  ] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne crée pas de lien pour ${label}`, async (s) => {
      const before = await countRows(s, 'public.invitations')
      for (const role of ['member', 'admin']) {
        expectRefused(await s.as(actor, CREATE_INV, ['membre', famId, role, null]), '42501', `${actor} ${role}`, /inviter/)
      }
      expect(await countRows(s, 'public.invitations')).toBe(before)
    })
  }
  for (const actor of ['memberA', 'adminA', 'adminA2', 'adminB', 'memberB'] as const) {
    attaque(`${ACTOR_LABEL[actor]} ne crée pas de lien « fondateur » (super-admin seulement)`, async (s) => {
      const before = await countRows(s, 'public.invitations')
      expectRefused(await s.as(actor, CREATE_INV, ['fondateur', null, null, null]), '42501', actor, /super-admin/)
      expect(await countRows(s, 'public.invitations')).toBe(before)
    })
  }
  attaque('type ou rôle d\'invitation invalide refusé', async (s) => {
    const before = await countRows(s, 'public.invitations')
    expectRefused(await s.as('adminA', CREATE_INV, ['super_admin', ID.famA, 'admin', null]), '22023', 'type inconnu')
    expectRefused(await s.as('adminA', CREATE_INV, ['membre', ID.famA, 'super_admin', null]), '22023', 'rôle inconnu')
    expectRefused(await s.as('adminA', CREATE_INV, ['membre', null, 'member', null]), '22023', 'sans famille')
    expect(await countRows(s, 'public.invitations')).toBe(before)
  })
  for (const [actor, famId, role, label] of [
    ['adminA', ID.famA, 'member', 'admin A crée un lien pour son foyer'],
    ['adminA2', ID.famA2, 'admin', 'admin A2 crée un lien (rôle admin) pour son foyer'],
    ['superAdmin', ID.famA2, 'member', 'le fondateur de SA (super-admin) crée un lien pour A2, dont il n\'est pas membre'],
    ['adminB', ID.famB, 'member', 'le fondateur de SB crée un lien pour B'],
  ] as const) {
    controle(label, async (s) => {
      const r = await newInvitation(s, actor, 'membre', famId, role, 'Pour mamie')
      const row = (await s.su(`SELECT kind, family_id, role, label, created_by FROM public.invitations WHERE id = $1`, [r.id]))[0]
      expect(row).toEqual({ kind: 'membre', family_id: famId, role, label: 'Pour mamie', created_by: (await s.su(`SELECT $1::uuid AS u`, [actorUid(actor)]))[0].u })
    })
  }
  controle('le super-admin crée un lien « fondateur » (sans famille ni rôle)', async (s) => {
    const r = await newInvitation(s, 'superAdmin', 'fondateur', ID.famA, 'admin')
    const row = (await s.su(`SELECT kind, family_id, role FROM public.invitations WHERE id = $1`, [r.id]))[0]
    expect(row).toEqual({ kind: 'fondateur', family_id: null, role: null })
  })
  controle('le jeton renvoyé n\'est pas stocké en clair : token_hash = SHA-256 du jeton, valable 7 jours', async (s) => {
    const r = await newInvitation(s, 'adminA', 'membre', ID.famA, 'member')
    expect(r.token).toMatch(/^[0-9a-f]{64}$/)
    const row = (await s.su<{ h: string; ok: boolean; days: number }>(
      `SELECT token_hash AS h, token_hash = encode(sha256(convert_to($2, 'UTF8')), 'hex') AS ok,
              round(extract(epoch FROM expires_at - now()) / 86400)::int AS days
       FROM public.invitations WHERE id = $1`,
      [r.id, r.token],
    ))[0]
    expect(row.ok).toBe(true)
    expect(row.h).not.toBe(r.token)
    expect(row.days).toBe(7)
    expect(await countRows(s, 'public.invitations i', `to_jsonb(i)::text LIKE '%' || $1 || '%'`, [r.token])).toBe(0)
    // Deux liens n'ont jamais le même jeton
    const r2 = await newInvitation(s, 'adminA', 'membre', ID.famA, 'member')
    expect(r2.token).not.toBe(r.token)
  })
  attaque('20 liens en attente au maximum par personne', async (s) => {
    const pending = () =>
      countRows(s, 'public.invitations', `created_by = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, [ID.adminA])
    const start = await pending()
    expect(start).toBeLessThan(20)
    for (let i = start; i < 20; i++) await newInvitation(s, 'adminA', 'membre', ID.famA, 'member')
    expect(await pending()).toBe(20)
    const before = await countRows(s, 'public.invitations')
    expectRefused(await s.as('adminA', CREATE_INV, ['membre', ID.famA, 'member', null]), '23514', '21e lien', /Trop de liens/)
    expect(await countRows(s, 'public.invitations')).toBe(before)
    // Un lien annulé libère une place
    expectOk(await s.as('adminA', REVOKE_INV, [ID.invA]), 'revoke', 1)
    await newInvitation(s, 'adminA', 'membre', ID.famA, 'member')
  })

  // Annulation
  for (const [actor, invId, label] of [
    ['memberA', ID.invA, 'un lien de son foyer (non admin)'],
    ['adminB', ID.invA, 'un lien du foyer A (autre super-famille)'],
    ['adminA2', ID.invA, 'un lien du foyer A (même super-famille)'],
    ['adminA', ID.invA2, 'un lien du foyer A2 (même super-famille)'],
    ['adminA', ID.invB, 'un lien du foyer B'],
    ['adminA', ID.invFondateur, 'un lien « fondateur »'],
    ['adminB', ID.invFondateur, 'un lien « fondateur » (fondateur de SB)'],
    ['sansProfil', ID.invA, 'un lien (connecté sans foyer)'],
  ] as const) {
    attaque(`${ACTOR_LABEL[actor]} n'annule pas ${label}`, async (s) => {
      await refusedOnRow(s, actor, { table: 'public.invitations', id: invId }, REVOKE_INV, [invId], '42501', /introuvable/)
    })
  }
  attaque('un identifiant de lien inconnu donne la même réponse qu\'un lien interdit (pas d\'oracle)', async (s) => {
    expectRefused(await s.as('adminA', REVOKE_INV, ['c0000000-0000-4000-8000-0000000000ff']), '42501', 'inconnu', /introuvable/)
  })
  controle('admin A annule un lien de son foyer (une seule fois)', async (s) => {
    const o = await s.as('adminA', REVOKE_INV, [ID.invA])
    expectOk(o, 'revoke', 1)
    expect(o.rows[0].v).toBe(true)
    expect((await invitationState(s, ID.invA)).revoked_at).not.toBeNull()
    expect((await s.as('adminA', REVOKE_INV, [ID.invA])).rows[0].v).toBe(false)
  })
  controle('le fondateur de SA (super-admin) annule un lien de A2', async (s) => {
    expect((await s.as('superAdmin', REVOKE_INV, [ID.invA2])).rows[0].v).toBe(true)
  })

  // invitation_info (page « Rejoindre », sans compte)
  const info = async (s: Scenario, token: string | null) => {
    const o = await s.as('anon', INFO_INV, [token])
    expectOk(o, 'invitation_info', 1)
    return o.rows[0]
  }
  controle('invitation_info (anonyme) : lien valide → état, type, rôle et nom de la famille, rien d\'autre', async (s) => {
    const r = await info(s, TOKEN.invA)
    expect(r).toEqual({ status: 'valide', kind: 'membre', role: 'member', family_name: 'Foyer A' })
    expect(await info(s, TOKEN.invFondateur)).toEqual({ status: 'valide', kind: 'fondateur', role: null, family_name: null })
  })
  controle('invitation_info : lien inconnu, vide ou NULL → « inconnue » sans autre information', async (s) => {
    for (const t of ['nimporte-quoi', '', null]) {
      expect(await info(s, t)).toEqual({ status: 'inconnue', kind: null, role: null, family_name: null })
    }
  })
  attaque('invitation_info : l\'empreinte stockée ne sert pas de jeton', async (s) => {
    const h = (await s.su<{ h: string }>(`SELECT token_hash AS h FROM public.invitations WHERE id = $1`, [ID.invA]))[0].h
    expect((await info(s, h)).status).toBe('inconnue')
  })
  controle('invitation_info : « annulee », « expiree », « utilisee »', async (s) => {
    await s.su(`UPDATE public.invitations SET revoked_at = now() WHERE id = $1`, [ID.invA])
    expect((await info(s, TOKEN.invA)).status).toBe('annulee')
    await s.su(`UPDATE public.invitations SET expires_at = now() - interval '1 second' WHERE id = $1`, [ID.invB])
    expect((await info(s, TOKEN.invB)).status).toBe('expiree')
    await s.su(`UPDATE public.invitations SET used_at = now(), used_by = $2 WHERE id = $1`, [ID.invA2, ID.nouveau1])
    expect((await info(s, TOKEN.invA2)).status).toBe('utilisee')
  })
})

function actorUid(actor: Actor): string | null {
  const m: Partial<Record<Actor, string>> = {
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
  return m[actor] ?? null
}

// ════════════════════════════════════════════════════════════════════════════
describe('Invitations : consume_invitation (fonction serveur, clé secrète)', () => {
  controle('lien « membre » valide → profil créé dans la bonne famille avec le bon rôle, lien marqué utilisé', async (s) => {
    const o = await consume(s, TOKEN.invA, ID.nouveau1, '  Mamie  ')
    expectOk(o, 'consume', 1)
    expect(o.rows[0].r).toEqual({ kind: 'membre', family_id: ID.famA })
    expect(await profileOf(s, ID.nouveau1)).toEqual({ family_id: ID.famA, role: 'member', display_name: 'Mamie' })
    const st = await invitationState(s, ID.invA)
    expect(st.used_at).not.toBeNull()
    expect(st.used_by).toBe(ID.nouveau1)
    // Le nouveau membre vit bien dans le foyer A
    const who = await s.asUid(ID.nouveau1, `SELECT public.user_family_id() AS f, public.is_admin() AS a`)
    expect(who.rows[0]).toEqual({ f: ID.famA, a: false })
    expectOk(await s.asUid(ID.nouveau1, `SELECT id FROM public.recipes WHERE id = $1`, [ID.recA]), 'lit recA', 1)
    expectBlocked(await s.asUid(ID.nouveau1, `SELECT id FROM public.recipes WHERE id = $1`, [ID.recA2]), 'ne lit pas recA2')
  })
  controle('lien « membre » avec rôle admin (A2) → profil admin dans A2', async (s) => {
    expectOk(await consume(s, TOKEN.invA2, ID.nouveau1), 'consume', 1)
    expect(await profileOf(s, ID.nouveau1)).toMatchObject({ family_id: ID.famA2, role: 'admin' })
  })
  controle('lien créé par l\'appli (create_invitation) puis consommé', async (s) => {
    const r = await newInvitation(s, 'adminB', 'membre', ID.famB, 'member')
    expectOk(await consume(s, r.token, ID.nouveau1), 'consume', 1)
    expect(await profileOf(s, ID.nouveau1)).toMatchObject({ family_id: ID.famB, role: 'member' })
  })
  attaque('un lien ne sert qu\'une fois (deuxième compte refusé)', async (s) => {
    expectOk(await consume(s, TOKEN.invA, ID.nouveau1), 'premier', 1)
    expectRefused(await consume(s, TOKEN.invA, ID.nouveau2), '22023', 'second', /invalide, expiré ou déjà utilisé/)
    expect(await profileOf(s, ID.nouveau2)).toBeNull()
    expect((await invitationState(s, ID.invA)).used_by).toBe(ID.nouveau1)
  })
  attaque('lien expiré refusé', async (s) => {
    await s.su(`UPDATE public.invitations SET expires_at = now() - interval '1 second' WHERE id = $1`, [ID.invA])
    expectRefused(await consume(s, TOKEN.invA, ID.nouveau1), '22023', 'expiré', /invalide, expiré/)
    expect(await profileOf(s, ID.nouveau1)).toBeNull()
    expect((await invitationState(s, ID.invA)).used_at).toBeNull()
  })
  attaque('lien annulé refusé', async (s) => {
    expectOk(await s.as('adminA', REVOKE_INV, [ID.invA]), 'revoke', 1)
    expectRefused(await consume(s, TOKEN.invA, ID.nouveau1), '22023', 'annulé', /invalide/)
    expect(await profileOf(s, ID.nouveau1)).toBeNull()
  })
  attaque('lien inconnu, vide, NULL ou empreinte stockée refusés', async (s) => {
    const h = (await s.su<{ h: string }>(`SELECT token_hash AS h FROM public.invitations WHERE id = $1`, [ID.invA]))[0].h
    for (const t of ['nimporte-quoi', '', null, h]) {
      expectRefused(await consume(s, t, ID.nouveau1), '22023', `jeton ${String(t)}`, /invalide/)
    }
    expect(await profileOf(s, ID.nouveau1)).toBeNull()
  })
  attaque('nom d\'affichage vide ou trop long refusé (lien non consommé)', async (s) => {
    for (const name of ['', '    ', null, 'x'.repeat(41)]) {
      expectRefused(await consume(s, TOKEN.invA, ID.nouveau1, name), '22023', `nom ${String(name)}`, /Prénom ou nom invalide/)
    }
    expect(await profileOf(s, ID.nouveau1)).toBeNull()
    expect((await invitationState(s, ID.invA)).used_at).toBeNull()
  })
  attaque('compte ayant déjà un profil refusé (le membre B ne rejoint pas le foyer A)', async (s) => {
    const before = await snapshot(s, 'public.profiles', 'id', ID.memberB)
    expectRefused(await consume(s, TOKEN.invA, ID.memberB, 'Membre B'), '22023', 'déjà un profil', /déjà une famille/)
    expect(await snapshot(s, 'public.profiles', 'id', ID.memberB)).toBe(before)
    expect((await invitationState(s, ID.invA)).used_at).toBeNull()
  })
  attaque('compte ayant déjà un profil refusé aussi pour un lien « fondateur » (rien n\'est créé)', async (s) => {
    const sf = await countRows(s, 'public.super_families')
    const fams = await countRows(s, 'public.families')
    expectRefused(await consume(s, TOKEN.invFondateur, ID.adminA, 'Admin A', 'Ma super-famille'), '22023', 'déjà un profil', /déjà une famille/)
    expect(await countRows(s, 'public.super_families')).toBe(sf)
    expect(await countRows(s, 'public.families')).toBe(fams)
    expect((await profileOf(s, ID.adminA)).family_id).toBe(ID.famA)
  })
  attaque('un lien « membre » ne permet ni de choisir sa famille ni de créer une super-famille', async (s) => {
    const sf = await countRows(s, 'public.super_families')
    expectOk(await consume(s, TOKEN.invA, ID.nouveau1, 'Nouveau', 'Ma propre super-famille'), 'consume', 1)
    expect(await countRows(s, 'public.super_families')).toBe(sf)
    expect((await profileOf(s, ID.nouveau1)).family_id).toBe(ID.famA)
  })
  for (const [label, fn] of [
    ['admin A (authenticated)', (s: Scenario) => s.as('adminA', CONSUME, [TOKEN.invA, ID.nouveau1, 'X', null])],
    ['le futur membre lui-même (authenticated, sans profil)', (s: Scenario) => s.asUid(ID.nouveau1, CONSUME, [TOKEN.invA, ID.nouveau1, 'X', null])],
    ['le super-admin (authenticated)', (s: Scenario) => s.as('superAdmin', CONSUME, [TOKEN.invFondateur, ID.nouveau1, 'X', 'Y'])],
    ['un anonyme', (s: Scenario) => s.as('anon', CONSUME, [TOKEN.invA, ID.nouveau1, 'X', null])],
  ] as const) {
    attaque(`${label} ne peut pas appeler consume_invitation`, async (s) => {
      expectNoExecute(await fn(s), label)
      expect(await profileOf(s, ID.nouveau1)).toBeNull()
      expect((await invitationState(s, ID.invA)).used_at).toBeNull()
    })
  }

  // Lien « fondateur »
  controle('lien « fondateur » → super-famille + famille + profil admin, founder_id = le compte', async (s) => {
    const sfBefore = await countRows(s, 'public.super_families')
    const o = await consume(s, TOKEN.invFondateur, ID.founderC, 'Fondateur C', '  Famille C  ')
    expectOk(o, 'consume fondateur', 1)
    expect(o.rows[0].r.kind).toBe('fondateur')
    const fid = o.rows[0].r.family_id as string
    expect(await countRows(s, 'public.super_families')).toBe(sfBefore + 1)
    const row = (await s.su(
      `SELECT f.name AS fam, s.name AS sfname, s.founder_id, s.id AS sf FROM public.families f
       JOIN public.super_families s ON s.id = f.super_family_id WHERE f.id = $1`,
      [fid],
    ))[0]
    expect(row).toMatchObject({ fam: 'Famille C', sfname: 'Famille C', founder_id: ID.founderC })
    expect(row.sf).not.toBe(ID.sfA)
    expect(row.sf).not.toBe(ID.sfB)
    expect(await profileOf(s, ID.founderC)).toEqual({ family_id: fid, role: 'admin', display_name: 'Fondateur C' })
    expect((await invitationState(s, ID.invFondateur)).used_by).toBe(ID.founderC)
  })
  attaque('lien « fondateur » : nom de famille vide ou trop long refusé, rien n\'est créé', async (s) => {
    const sf = await countRows(s, 'public.super_families')
    const fams = await countRows(s, 'public.families')
    for (const fname of [null, '', '   ', 'x'.repeat(61)]) {
      expectRefused(await consume(s, TOKEN.invFondateur, ID.founderC, 'Fondateur C', fname), '22023', `nom ${String(fname)}`, /Nom de famille invalide/)
    }
    expect(await countRows(s, 'public.super_families')).toBe(sf)
    expect(await countRows(s, 'public.families')).toBe(fams)
    expect(await profileOf(s, ID.founderC)).toBeNull()
    expect((await invitationState(s, ID.invFondateur)).used_at).toBeNull()
  })
  attaque('le nouveau fondateur C est isolé des super-familles SA et SB', async (s) => {
    const { sf } = await becomeFounderC(s)
    expectBlocked(await s.as('founderC', `SELECT id FROM public.recipes WHERE id = ANY($1::uuid[])`, [[ID.recA, ID.recAshared, ID.recA2, ID.recB]]), 'recettes')
    expectBlocked(await s.as('founderC', `SELECT id FROM public.families WHERE super_family_id <> $1`, [sf]), 'familles')
    expectBlocked(await s.as('founderC', `SELECT id FROM public.super_families WHERE id <> $1`, [sf]), 'super-familles')
    expectBlocked(await s.as('founderC', `SELECT id FROM public.profiles WHERE id <> auth.uid()`), 'profils')
    expectRefused(await s.as('founderC', CREATE_INV, ['membre', ID.famA, 'admin', null]), '42501', 'invite dans A')
  })
  controle('le nouveau fondateur C lit le catalogue, sa super-famille, et invite dans sa famille', async (s) => {
    const { sf, fid } = await becomeFounderC(s)
    const c = await catalogue(s)
    expectOk(await s.as('founderC', `SELECT id FROM public.recipes WHERE id = $1`, [c.recipes]), 'catalogue', 1)
    expectOk(await s.as('founderC', `SELECT id FROM public.super_families`), 'super-famille', 1)
    expect((await s.as('founderC', `SELECT public.is_founder($1) AS v`, [sf])).rows[0].v).toBe(true)
    await newInvitation(s, 'founderC', 'membre', fid, 'member')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Familles : create_family et pouvoirs du fondateur', () => {
  const LIMITE = /3 familles au maximum/
  for (const [actor, sf, label] of [
    ['memberA', null, 'membre A (non fondateur)'],
    ['adminA', null, 'admin A (non fondateur)'],
    ['adminA', ID.sfA, 'admin A dans SA (non fondateur)'],
    ['adminA2', ID.sfA, 'admin A2 dans SA (non fondateur)'],
    ['adminB', ID.sfA, 'le fondateur de SB dans SA'],
    ['memberB', ID.sfB, 'membre B dans SB (non fondateur)'],
  ] as const) {
    attaque(`${label} ne crée pas de famille`, async (s) => {
      const before = await countRows(s, 'public.families')
      expectRefused(await s.as(actor, CREATE_FAMILY, ['PIRATE', sf]), '42501', label, /Seul le fondateur/)
      expect(await countRows(s, 'public.families')).toBe(before)
    })
  }
  attaque('nom de famille invalide refusé (vide, espaces, NULL, trop long)', async (s) => {
    const before = await countRows(s, 'public.families')
    for (const name of ['', '   ', null, 'x'.repeat(61)]) {
      expectRefused(await s.as('adminB', CREATE_FAMILY, [name, null]), '22023', `nom ${String(name)}`, /Nom de famille invalide/)
    }
    expect(await countRows(s, 'public.families')).toBe(before)
  })
  attaque('un fondateur ordinaire (lien « fondateur ») crée 2 familles de plus, pas une 4e', async (s) => {
    const { sf } = await becomeFounderC(s)
    for (const n of ['C2', 'C3']) expectOk(await s.as('founderC', CREATE_FAMILY, [`Famille ${n}`, null]), n, 1)
    expect(await countRows(s, 'public.families', 'super_family_id = $1', [sf])).toBe(3)
    expectRefused(await s.as('founderC', CREATE_FAMILY, ['Famille C4', null]), '23514', '4e famille', LIMITE)
    expectRefused(await s.as('founderC', CREATE_FAMILY, ['Famille C4', sf]), '23514', '4e famille (SF explicite)', LIMITE)
    expect(await countRows(s, 'public.families', 'super_family_id = $1', [sf])).toBe(3)
  })
  attaque('le fondateur de SB (non super-admin) est limité à 3 familles', async (s) => {
    expectOk(await s.as('adminB', CREATE_FAMILY, ['Foyer B2', null]), 'B2', 1)
    expectOk(await s.as('adminB', CREATE_FAMILY, ['Foyer B3', ID.sfB]), 'B3', 1)
    expectRefused(await s.as('adminB', CREATE_FAMILY, ['Foyer B4', null]), '23514', 'B4', LIMITE)
    expect(await countRows(s, 'public.families', 'super_family_id = $1', [ID.sfB])).toBe(3)
  })
  attaque('même le super-admin ne dépasse pas 3 familles dans la super-famille d\'un fondateur ordinaire', async (s) => {
    expectOk(await s.as('superAdmin', CREATE_FAMILY, ['Foyer B2', ID.sfB]), 'B2', 1)
    expectOk(await s.as('superAdmin', CREATE_FAMILY, ['Foyer B3', ID.sfB]), 'B3', 1)
    expectRefused(await s.as('superAdmin', CREATE_FAMILY, ['Foyer B4', ID.sfB]), '23514', 'B4', LIMITE)
  })
  controle('le super-admin (fondateur de SA) crée des familles sans limite', async (s) => {
    for (let i = 1; i <= 5; i++) expectOk(await s.as('superAdmin', CREATE_FAMILY, [`Foyer SA ${i}`, null]), `famille ${i}`, 1)
    expect(await countRows(s, 'public.families', 'super_family_id = $1', [ID.sfA])).toBe(7)
  })
  controle('le fondateur de SB crée une famille, la renomme, y invite, voit ses membres et change leur rôle', async (s) => {
    const fid = (await s.as('adminB', CREATE_FAMILY, ['Foyer B2', null])).rows[0].id as string
    expect((await s.su(`SELECT super_family_id AS sf FROM public.families WHERE id = $1`, [fid]))[0].sf).toBe(ID.sfB)
    expectOk(await s.as('adminB', `UPDATE public.families SET name = 'Foyer B2 bis' WHERE id = $1 RETURNING id`, [fid]), 'renommage', 1)
    const r = await newInvitation(s, 'adminB', 'membre', fid, 'member')
    expectOk(await consume(s, r.token, ID.nouveau1, 'Cousin'), 'consume', 1)
    expectOk(await s.as('adminB', `SELECT id FROM public.profiles WHERE family_id = $1`, [fid]), 'voit les membres', 1)
    expectOk(await s.as('adminB', `UPDATE public.profiles SET role = 'admin' WHERE id = $1 RETURNING id`, [ID.nouveau1]), 'promotion', 1)
    expect((await profileOf(s, ID.nouveau1)).role).toBe('admin')
    // Le membre B voit le nom de la nouvelle famille (même super-famille), pas ses membres
    expectOk(await s.as('memberB', `SELECT id FROM public.families WHERE id = $1`, [fid]), 'nom visible', 1)
    expectBlocked(await s.as('memberB', `SELECT id FROM public.profiles WHERE family_id = $1`, [fid]), 'membres invisibles')
  })
  attaque('le fondateur de SB n\'est pas membre de ses autres familles : leur planning, listes et placard lui restent fermés', async (s) => {
    const fid = (await s.as('adminB', CREATE_FAMILY, ['Foyer B2', null])).rows[0].id as string
    await s.su(`INSERT INTO public.meal_plans (family_id, week_start) VALUES ($1, '2026-11-30')`, [fid])
    await s.su(`INSERT INTO public.pantry_items (family_id, name) VALUES ($1, 'Sel (B2)')`, [fid])
    expect((await s.as('adminB', `SELECT public.is_family($1) AS v`, [fid])).rows[0].v).toBe(false)
    expectBlocked(await s.as('adminB', `SELECT id FROM public.meal_plans WHERE family_id = $1`, [fid]), 'planning')
    expectBlocked(await s.as('adminB', `SELECT id FROM public.pantry_items WHERE family_id = $1`, [fid]), 'placard')
    await attemptInsert(s, 'adminB', 'public.staples', `INSERT INTO public.staples (family_id, name) VALUES ($1, 'PIRATE') RETURNING id`, [fid])
  })
  attaque('le fondateur de SB ne déplace pas un membre d\'une de ses familles vers une autre', async (s) => {
    const fid = (await s.as('adminB', CREATE_FAMILY, ['Foyer B2', null])).rows[0].id as string
    await refusedOnRow(
      s,
      'adminB',
      { table: 'public.profiles', id: ID.memberB },
      `UPDATE public.profiles SET family_id = $2 WHERE id = $1 RETURNING id`,
      [ID.memberB, fid],
      '42501',
      /changer de foyer/,
    )
  })
  attaque('l\'admin d\'une famille créée par le fondateur de SB ne change pas un rôle dans le foyer B', async (s) => {
    const fid = (await s.as('adminB', CREATE_FAMILY, ['Foyer B2', null])).rows[0].id as string
    const r = await newInvitation(s, 'adminB', 'membre', fid, 'admin')
    expectOk(await consume(s, r.token, ID.nouveau1, 'Admin B2'), 'consume', 1)
    const before = await snapshot(s, 'public.profiles', 'id', ID.memberB)
    expectBlocked(await s.asUid(ID.nouveau1, `UPDATE public.profiles SET role = 'admin' WHERE id = $1 RETURNING id`, [ID.memberB]), 'rôle dans B')
    expect(await snapshot(s, 'public.profiles', 'id', ID.memberB)).toBe(before)
    expectRefused(await s.asUid(ID.nouveau1, CREATE_INV, ['membre', ID.famB, 'admin', null]), '42501', 'invite dans B', /inviter/)
    expectRefused(await s.asUid(ID.nouveau1, CREATE_FAMILY, ['PIRATE', ID.sfB]), '42501', 'create_family', /Seul le fondateur/)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Fonctions RPC, vues par un utilisateur connecté', () => {
  attaque('membre A ne se fait pas passer pour un membre du foyer B ni du foyer A2 (is_family)', async (s) => {
    const o = await s.as('memberA', `SELECT public.is_family($1) AS b, public.is_family($2) AS a2`, [ID.famB, ID.famA2])
    expect(o.rows[0]).toEqual({ b: false, a2: false })
  })
  attaque('membre A n\'est pas admin ni super-admin', async (s) => {
    const o = await s.as('memberA', `SELECT public.is_admin() AS a, public.is_super_admin() AS s`)
    expect(o.rows[0]).toEqual({ a: false, s: false })
  })
  attaque('membre B : ni fondateur de SA, ni inviteur dans A, ni lecteur de recA / recAshared', async (s) => {
    const o = await s.as(
      'memberB',
      `SELECT public.is_founder($1) AS f, public.is_founder($2) AS fb, public.can_invite($3) AS i,
              public.can_read_recipe($4) AS r1, public.can_read_recipe($5) AS r2, public.can_edit_recipe($6) AS e`,
      [ID.sfA, ID.sfB, ID.famA, ID.recA, ID.recAshared, ID.recB],
    )
    expect(o.rows[0]).toEqual({ f: false, fb: false, i: false, r1: false, r2: false, e: true })
  })
  attaque('admin A2 : lit la recette partagée de A sans pouvoir la modifier ; n\'invite pas dans A', async (s) => {
    const o = await s.as(
      'adminA2',
      `SELECT public.can_read_recipe($1) AS r, public.can_edit_recipe($1) AS e, public.can_invite($2) AS i, public.can_invite($3) AS i2`,
      [ID.recAshared, ID.famA, ID.famA2],
    )
    expect(o.rows[0]).toEqual({ r: true, e: false, i: false, i2: true })
  })
  controle('membre A : user_family_id() = foyer A, is_member() = vrai, my_super_family_id() = SA', async (s) => {
    const o = await s.as('memberA', `SELECT public.user_family_id() AS f, public.is_member() AS m, public.my_super_family_id() AS sf`)
    expect(o.rows[0]).toEqual({ f: ID.famA, m: true, sf: ID.sfA })
  })
  controle('admin B est fondateur de SB et peut inviter dans B', async (s) => {
    const o = await s.as('adminB', `SELECT public.is_founder($1) AS f, public.is_founder_of_family($2) AS ff, public.can_invite($2) AS i`, [ID.sfB, ID.famB])
    expect(o.rows[0]).toEqual({ f: true, ff: true, i: true })
  })
  controle('membre B peut appeler recipe_exists() (réservée aux connectés)', async (s) => {
    const o = await s.as('memberB', `SELECT public.recipe_exists($1) AS v`, [ID.recA])
    expect(o.error).toBeUndefined()
    expect(o.rows[0].v).toBe(true)
  })
})
