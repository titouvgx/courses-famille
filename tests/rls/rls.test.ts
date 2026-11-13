/**
 * Banc d'attaque RLS : un foyer ne peut ni lire ni modifier les données d'un autre.
 *
 *   npx vitest run tests/rls
 *
 * Chaque test = une tentative, jouée dans une transaction annulée à la fin.
 *  - « attaque »   : la tentative DOIT être bloquée (erreur 42501 ou 0 ligne),
 *                    et l'état réel de la base (relu en super-utilisateur) ne
 *                    doit pas avoir changé.
 *  - « contrôle »  : contrôle positif, la même opération sur SES données DOIT
 *                    réussir (sinon un banc où tout est cassé passerait pour sûr).
 *  - « structure » : vérifications du schéma et du banc lui-même.
 * Voir README.md.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ACTOR_LABEL,
  createBench,
  ID,
  objName,
  other,
  OTHER_BUCKET,
  PHOTO_BUCKET,
  type Actor,
  type Bench,
  type Foyer,
  type Outcome,
  type Scenario,
} from './harness'

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
  if (message) expect(o.error!.message).toMatch(message)
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

async function countRows(s: Scenario, table: string) {
  return Number((await s.su<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))[0].n)
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

// ── Description des tables ─────────────────────────────────────────────────
const fam = { A: ID.famA, B: ID.famB } as const
const rec = { A: ID.recA, B: ID.recB } as const
const member = { A: 'memberA', B: 'memberB' } as const satisfies Record<Foyer, Actor>
const admin = { A: 'adminA', B: 'adminB' } as const satisfies Record<Foyer, Actor>

/** Les 15 tables du schéma public couvertes par le banc. */
const PUBLIC_TABLES = [
  'families',
  'profiles',
  'super_admins',
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
    row: { A: ID.planA, B: ID.planB },
    ownedBy: 'family_id = $1',
    insert: (f) => [
      `INSERT INTO public.meal_plans (family_id, week_start) VALUES ($1, '2027-01-04') RETURNING id`,
      [fam[f]],
    ],
    set: `week_start = '2030-01-07'`,
    moveCol: 'family_id',
    moveVal: fam,
    memberDelete: false,
  },
  {
    table: 'meal_slots',
    label: 'les créneaux du planning',
    row: { A: ID.slotA, B: ID.slotB },
    ownedBy: 'meal_plan_id IN (SELECT id FROM public.meal_plans WHERE family_id = $1)',
    insert: (f) => [
      `INSERT INTO public.meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id, portions)
       VALUES ($1, 5, 'soir', $2, 2) RETURNING id`,
      [f === 'A' ? ID.planA : ID.planB, rec[f]],
    ],
    set: 'portions = 9',
    moveCol: 'meal_plan_id',
    moveVal: { A: ID.planA, B: ID.planB },
    memberDelete: true,
  },
  {
    table: 'shopping_lists',
    label: 'la liste de courses',
    row: { A: ID.listA, B: ID.listB },
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
    row: { A: ID.itemA, B: ID.itemB },
    ownedBy: 'shopping_list_id IN (SELECT id FROM public.shopping_lists WHERE family_id = $1)',
    insert: (f) => [
      `INSERT INTO public.shopping_list_items (shopping_list_id, name) VALUES ($1, 'PIRATE') RETURNING id`,
      [f === 'A' ? ID.listA : ID.listB],
    ],
    set: 'checked = true, checked_at = now()',
    moveCol: 'shopping_list_id',
    moveVal: { A: ID.listA, B: ID.listB },
    memberDelete: true,
  },
  {
    table: 'staples',
    label: 'les achats habituels',
    row: { A: ID.stapleA, B: ID.stapleB },
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
    row: { A: ID.pantryA, B: ID.pantryB },
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
  families: [`INSERT INTO public.families (name) VALUES ('PIRATE') RETURNING id`, []],
  profiles: [
    `INSERT INTO public.profiles (id, family_id, display_name, role) VALUES ($1, $2, 'PIRATE', 'admin') RETURNING id`,
    [ID.sansProfil, ID.famA],
  ],
  super_admins: [`INSERT INTO public.super_admins (user_id) VALUES ($1) RETURNING user_id`, [ID.sansProfil]],
  recipe_categories: [`INSERT INTO public.recipe_categories (name) VALUES ('PIRATE') RETURNING id`, []],
  shopping_categories: [`INSERT INTO public.shopping_categories (name) VALUES ('PIRATE') RETURNING id`, []],
  known_ingredients: [`INSERT INTO public.known_ingredients (name) VALUES ('PIRATE') RETURNING id`, []],
  recipes: [`INSERT INTO public.recipes (family_id, title) VALUES ($1, 'PIRATE') RETURNING id`, [ID.famA]],
  recipe_ingredients: [
    `INSERT INTO public.recipe_ingredients (recipe_id, name) VALUES ($1, 'PIRATE') RETURNING id`,
    [ID.recA],
  ],
  recipe_steps: [
    `INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES ($1, 99, 'PIRATE') RETURNING id`,
    [ID.recA],
  ],
  ...(Object.fromEntries(SCOPED.map((t) => [t.table, t.insert('A')])) as Partial<Record<Table, [string, unknown[]]>>),
} as Record<Table, [string, unknown[]]>

// ════════════════════════════════════════════════════════════════════════════
describe('Structure du schéma et fidélité du banc', () => {
  structure('les 15 tables de public sont toutes couvertes par le banc (aucune table oubliée)', async (s) => {
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
      for (const f of ['A', 'B'] as const) {
        for (const g of ['A', 'B'] as const) {
          const [sql, params] = t.insert(g)
          await isolated(`INSERT ${t.table} ${g}`, sql, params)
        }
        await isolated(`UPDATE ${t.table}`, `UPDATE public.${t.table} SET ${t.set} WHERE id = $1 RETURNING id`, [t.row[f]])
        await isolated(`DELETE ${t.table}`, `DELETE FROM public.${t.table} WHERE id = $1 RETURNING id`, [t.row[f]])
        await isolated(
          `déplacement ${t.table}`,
          `UPDATE public.${t.table} SET ${t.moveCol} = $2 WHERE id = $1 RETURNING id`,
          [t.row[f], t.moveVal[other(f)]],
        )
      }
    }
  })

  structure('seed_recipes a tourné : 20 recettes de démo dans le foyer A (crochet utilisateurs)', async (s) => {
    const r = await s.su<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.recipes WHERE family_id = $1 AND created_by = $2 AND id <> $3`,
      [ID.famA, ID.adminA, ID.recA],
    )
    expect(r[0].n).toBe(20)
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
       WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ORDER BY 1`,
    )
    // Toute nouvelle fonction SECURITY DEFINER ouverte aux anonymes doit être
    // revue (et ajoutée ici avec une attaque) : elle s'exécute avec les droits
    // du propriétaire, RLS ne la protège pas.
    expect(rows.map((r) => r.f)).toEqual([
      'guard_meal_slot_cook',
      'guard_profile_update',
      'is_admin',
      'is_family',
      'is_member',
      'is_super_admin',
      'user_family_id',
    ])
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
  ]
  for (const [name, sql, params, expected] of rpcs) {
    attaque(`anonyme appelle ${name} : n'obtient rien (${String(expected)})`, async (s) => {
      const o = await s.as('anon', sql, params)
      expect(o.error).toBeUndefined()
      expect(o.rows[0].v).toBe(expected)
    })
  }

  attaque('anonyme ne peut pas appeler recipe_exists() (fermée aux anonymes)', async (s) => {
    expectRefused(await s.as('anon', `SELECT public.recipe_exists($1)`, [ID.recA]), '42501', 'anon recipe_exists', /permission denied for function/)
  })

  attaque('anonyme ne peut pas appeler directement les fonctions trigger SECURITY DEFINER', async (s) => {
    for (const f of ['guard_profile_update', 'guard_meal_slot_cook']) {
      const o = await s.as('anon', `SELECT public.${f}()`)
      expectRefused(o, ['0A000', '42501'], `anon ${f}()`)
    }
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
  controle('connecté sans foyer lit known_ingredients (règle « TO authenticated » voulue)', async (s) => {
    expectOk(await s.as('sansProfil', `SELECT id FROM public.known_ingredients LIMIT 5`), 'sansProfil known_ingredients')
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Entre foyers : planning, créneaux, listes, articles, habituels, placard', () => {
  for (const t of SCOPED) {
    describe(t.table, () => {
      for (const X of ['A', 'B'] as const) {
        const Y = other(X)
        const m = member[X]
        const a = admin[X]
        const upd = `UPDATE public.${t.table} SET ${t.set} WHERE id = $1 RETURNING id`
        const del = `DELETE FROM public.${t.table} WHERE id = $1 RETURNING id`
        const move = `UPDATE public.${t.table} SET ${t.moveCol} = $2 WHERE id = $1 RETURNING id`
        const target = (f: Foyer) => ({ table: `public.${t.table}`, id: t.row[f] })

        attaque(`membre ${X} ne lit pas ${t.label} de ${Y}`, async (s) => {
          expect(await snapshot(s, `public.${t.table}`, 'id', t.row[Y])).not.toBeNull()
          expectBlocked(await s.as(m, `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row[Y]]), 'lecture par id')
        })
        attaque(`membre ${X}, en lisant toute la table ${t.table}, ne voit aucune ligne de ${Y}`, async (s) => {
          const theirs = (await s.su<{ id: string }>(`SELECT id FROM public.${t.table} WHERE ${t.ownedBy}`, [fam[Y]])).map(
            (r) => r.id,
          )
          expect(theirs.length).toBeGreaterThan(0)
          const o = await s.as(m, `SELECT id FROM public.${t.table}`)
          expect(o.error).toBeUndefined()
          expect(o.rows.map((r) => r.id).filter((id) => theirs.includes(id))).toEqual([])
        })
        attaque(`membre ${X} n'ajoute rien dans ${t.label} de ${Y}`, async (s) => {
          const [sql, params] = t.insert(Y)
          await attemptInsert(s, m, `public.${t.table}`, sql, params)
        })
        attaque(`membre ${X} ne modifie pas ${t.label} de ${Y}`, async (s) => {
          await attemptOnRow(s, m, target(Y), upd, [t.row[Y]])
        })
        attaque(`admin ${X} ne modifie pas ${t.label} de ${Y}`, async (s) => {
          await attemptOnRow(s, a, target(Y), upd, [t.row[Y]])
        })
        attaque(`membre ${X} ne supprime pas ${t.label} de ${Y}`, async (s) => {
          await attemptOnRow(s, m, target(Y), del, [t.row[Y]])
        })
        attaque(`admin ${X} ne supprime pas ${t.label} de ${Y}`, async (s) => {
          await attemptOnRow(s, a, target(Y), del, [t.row[Y]])
        })
        attaque(`membre ${X} ne déplace pas ${t.label} de son foyer vers ${Y} (UPDATE ${t.moveCol})`, async (s) => {
          await attemptOnRow(s, m, target(X), move, [t.row[X], t.moveVal[Y]])
        })
        attaque(`membre ${X} ne rapatrie pas ${t.label} de ${Y} dans son foyer (UPDATE ${t.moveCol})`, async (s) => {
          await attemptOnRow(s, m, target(Y), move, [t.row[Y], t.moveVal[X]])
        })
        attaque(`membre ${X} ne déplace pas en masse ${t.label} de son foyer vers ${Y} (UPDATE sans WHERE ni RETURNING)`, async (s) => {
          await attemptMass(s, m, `public.${t.table}`, `UPDATE public.${t.table} SET ${t.moveCol} = $1`, [t.moveVal[Y]])
        })

        // Contrôles positifs : les MÊMES requêtes sur ses propres données passent.
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
  for (const X of ['A', 'B'] as const) {
    const Y = other(X)
    const target = { table: 'public.families', id: fam[Y] }
    attaque(`membre ${X} ne lit pas le foyer ${Y}`, async (s) => {
      expectBlocked(await s.as(member[X], `SELECT * FROM public.families WHERE id = $1`, [fam[Y]]), 'lecture')
    })
    attaque(`membre ${X} ne renomme pas le foyer ${Y}`, async (s) => {
      await attemptOnRow(s, member[X], target, `UPDATE public.families SET name = 'PIRATE' WHERE id = $1 RETURNING id`, [fam[Y]])
    })
    attaque(`admin ${X} ne renomme pas le foyer ${Y}`, async (s) => {
      await attemptOnRow(s, admin[X], target, `UPDATE public.families SET name = 'PIRATE' WHERE id = $1 RETURNING id`, [fam[Y]])
    })
    attaque(`admin ${X} ne supprime pas le foyer ${Y}`, async (s) => {
      await attemptOnRow(s, admin[X], target, `DELETE FROM public.families WHERE id = $1 RETURNING id`, [fam[Y]])
    })
    controle(`membre ${X} lit son foyer, et seulement le sien`, async (s) => {
      const o = await s.as(member[X], `SELECT id FROM public.families`)
      expectOk(o, 'lecture', 1)
      expect(o.rows[0].id).toBe(fam[X])
    })
  }
  attaque('admin A ne crée pas de foyer (réservé au super-admin)', async (s) => {
    await attemptInsert(s, 'adminA', 'public.families', `INSERT INTO public.families (name) VALUES ('PIRATE') RETURNING id`, [])
  })
  attaque('admin A ne renomme pas son propre foyer (réservé au super-admin)', async (s) => {
    await attemptOnRow(s, 'adminA', { table: 'public.families', id: ID.famA }, `UPDATE public.families SET name = 'X' WHERE id = $1 RETURNING id`, [
      ID.famA,
    ])
  })
  attaque('admin A ne supprime pas son propre foyer (réservé au super-admin)', async (s) => {
    await attemptOnRow(s, 'adminA', { table: 'public.families', id: ID.famA }, `DELETE FROM public.families WHERE id = $1 RETURNING id`, [ID.famA])
  })
  controle('super-admin lit les deux foyers et peut renommer le foyer B', async (s) => {
    expectOk(await s.as('superAdmin', `SELECT id FROM public.families`), 'lecture', 2)
    expectOk(await s.as('superAdmin', `UPDATE public.families SET name = 'Foyer B bis' WHERE id = $1 RETURNING id`, [ID.famB]), 'maj', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Profils et élévation de privilège', () => {
  const P = 'public.profiles'
  const upd = (set: string) => `UPDATE public.profiles SET ${set} WHERE id = $1 RETURNING id`
  const row = (id: string) => ({ table: P, id })

  for (const X of ['A', 'B'] as const) {
    const Y = other(X)
    attaque(`membre ${X} ne lit pas les profils de ${Y}`, async (s) => {
      const o = await s.as(member[X], `SELECT id FROM public.profiles WHERE family_id = $1`, [fam[Y]])
      expectBlocked(o, 'profils de l\'autre foyer')
      expectBlocked(await s.as(member[X], `SELECT id FROM public.profiles WHERE id = $1`, [{ A: ID.memberA, B: ID.memberB }[Y]]), 'par id')
    })
    controle(`membre ${X} lit les profils de son foyer, et seulement eux`, async (s) => {
      const o = await s.as(member[X], `SELECT family_id FROM public.profiles`)
      expectOk(o, 'lecture')
      expect(new Set(o.rows.map((r) => r.family_id))).toEqual(new Set([fam[X]]))
    })
  }

  attaque('membre A ne se passe pas admin (UPDATE role)', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberA), upd(`role = 'admin'`), [ID.memberA])
  })
  attaque('membre A ne change pas son family_id vers le foyer B', async (s) => {
    await attemptOnRow(s, 'memberA', row(ID.memberA), upd('family_id = $2'), [ID.memberA, ID.famB])
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
  attaque('admin A ne modifie pas le nom d\'un profil de B', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberB), upd(`display_name = 'PIRATE'`), [ID.memberB])
  })
  attaque('admin A ne change pas le rôle d\'un membre de B', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberB), upd(`role = 'admin'`), [ID.memberB])
  })
  attaque('admin A ne rétrograde pas l\'admin B', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.adminB), upd(`role = 'member'`), [ID.adminB])
  })
  attaque('admin A n\'attire pas le membre B dans son foyer (UPDATE family_id)', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberB), upd('family_id = $2'), [ID.memberB, ID.famA])
  })
  attaque('admin A n\'envoie pas le membre A dans le foyer B (UPDATE family_id)', async (s) => {
    await attemptOnRow(s, 'adminA', row(ID.memberA), upd('family_id = $2'), [ID.memberA, ID.famB])
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
  attaque('admin B ne promeut pas le membre A', async (s) => {
    await attemptOnRow(s, 'adminB', row(ID.memberA), upd(`role = 'admin'`), [ID.memberA])
  })
  attaque('membre A ne crée pas de profil (même dans son foyer)', async (s) => {
    const [sql, params] = INSERT_A.profiles
    await attemptInsert(s, 'memberA', P, sql, params)
  })
  attaque('admin A ne crée pas de profil dans son foyer (réservé au super-admin)', async (s) => {
    const [sql, params] = INSERT_A.profiles
    await attemptInsert(s, 'adminA', P, sql, params)
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

  controle('membre A change son nom d\'affichage', async (s) => {
    expectOk(await s.as('memberA', upd(`display_name = 'Nouveau nom'`), [ID.memberA]), 'nom', 1)
    expect((await s.su(`SELECT display_name FROM public.profiles WHERE id = $1`, [ID.memberA]))[0].display_name).toBe('Nouveau nom')
  })
  controle('admin A promeut le membre A (même foyer)', async (s) => {
    expectOk(await s.as('adminA', upd(`role = 'admin'`), [ID.memberA]), 'promotion', 1)
    expect((await s.su(`SELECT role FROM public.profiles WHERE id = $1`, [ID.memberA]))[0].role).toBe('admin')
  })
  controle('super-admin modifie un profil du foyer B', async (s) => {
    expectOk(await s.as('superAdmin', upd(`display_name = 'Renommé'`), [ID.memberB]), 'super-admin', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('Super-admins', () => {
  const S = { table: 'public.super_admins', pk: 'user_id', id: ID.superAdmin }
  for (const actor of ['memberA', 'adminA', 'adminB'] as const) {
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
describe('Recettes : partagées en lecture, modifiables par le seul foyer propriétaire', () => {
  const recipeTables = [
    { table: 'recipes', label: 'la recette', row: rec, parentCol: 'family_id', parent: fam, set: `title = 'PIRATE'` },
    {
      table: 'recipe_ingredients',
      label: 'les ingrédients de la recette',
      row: { A: ID.ingA, B: ID.ingB },
      parentCol: 'recipe_id',
      parent: rec,
      set: `name = 'PIRATE'`,
    },
    {
      table: 'recipe_steps',
      label: 'les étapes de la recette',
      row: { A: ID.stepA, B: ID.stepB },
      parentCol: 'recipe_id',
      parent: rec,
      set: `instruction = 'PIRATE'`,
    },
  ] as const

  for (const t of recipeTables) {
    for (const X of ['A', 'B'] as const) {
      const Y = other(X)
      const target = (f: Foyer) => ({ table: `public.${t.table}`, id: t.row[f] })
      const upd = `UPDATE public.${t.table} SET ${t.set} WHERE id = $1 RETURNING id`
      const del = `DELETE FROM public.${t.table} WHERE id = $1 RETURNING id`
      const move = `UPDATE public.${t.table} SET ${t.parentCol} = $2 WHERE id = $1 RETURNING id`

      controle(`membre ${X} lit ${t.label} de ${Y} (recettes partagées)`, async (s) => {
        expectOk(await s.as(member[X], `SELECT * FROM public.${t.table} WHERE id = $1`, [t.row[Y]]), 'lecture', 1)
      })
      attaque(`membre ${X} ne modifie pas ${t.label} de ${Y}`, async (s) => {
        await attemptOnRow(s, member[X], target(Y), upd, [t.row[Y]])
      })
      attaque(`admin ${X} ne modifie pas ${t.label} de ${Y}`, async (s) => {
        await attemptOnRow(s, admin[X], target(Y), upd, [t.row[Y]])
      })
      attaque(`membre ${X} ne supprime pas ${t.label} de ${Y}`, async (s) => {
        await attemptOnRow(s, member[X], target(Y), del, [t.row[Y]])
      })
      attaque(`admin ${X} ne supprime pas ${t.label} de ${Y}`, async (s) => {
        await attemptOnRow(s, admin[X], target(Y), del, [t.row[Y]])
      })
      attaque(`membre ${X} ne déplace pas ${t.label} de son foyer vers ${Y} (UPDATE ${t.parentCol})`, async (s) => {
        await attemptOnRow(s, member[X], target(X), move, [t.row[X], t.parent[Y]])
      })
      attaque(`membre ${X} ne s'approprie pas ${t.label} de ${Y} (UPDATE ${t.parentCol})`, async (s) => {
        await attemptOnRow(s, member[X], target(Y), move, [t.row[Y], t.parent[X]])
      })
      attaque(`membre ${X} ne déplace pas en masse ${t.label} de son foyer vers ${Y} (UPDATE sans WHERE ni RETURNING)`, async (s) => {
        await attemptMass(s, member[X], `public.${t.table}`, `UPDATE public.${t.table} SET ${t.parentCol} = $1`, [t.parent[Y]])
      })
      controle(`membre ${X} modifie ${t.label} de son foyer`, async (s) => {
        expectOk(await s.as(member[X], upd, [t.row[X]]), 'modification', 1)
      })
    }
  }

  // Ajouts dans une recette d'un autre foyer
  for (const X of ['A', 'B'] as const) {
    const Y = other(X)
    attaque(`membre ${X} ne crée pas de recette au nom du foyer ${Y}`, async (s) => {
      await attemptInsert(s, member[X], 'public.recipes', `INSERT INTO public.recipes (family_id, title) VALUES ($1, 'PIRATE') RETURNING id`, [fam[Y]])
    })
    attaque(`membre ${X} n'ajoute pas d'ingrédient à une recette de ${Y}`, async (s) => {
      await attemptInsert(
        s,
        member[X],
        'public.recipe_ingredients',
        `INSERT INTO public.recipe_ingredients (recipe_id, name) VALUES ($1, 'PIRATE') RETURNING id`,
        [rec[Y]],
      )
    })
    attaque(`membre ${X} n'ajoute pas d'étape à une recette de ${Y}`, async (s) => {
      await attemptInsert(
        s,
        member[X],
        'public.recipe_steps',
        `INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES ($1, 9, 'PIRATE') RETURNING id`,
        [rec[Y]],
      )
    })
    controle(`membre ${X} crée une recette, un ingrédient et une étape dans son foyer`, async (s) => {
      expectOk(await s.as(member[X], `INSERT INTO public.recipes (family_id, title) VALUES ($1, 'Ma recette') RETURNING id`, [fam[X]]), 'recette', 1)
      expectOk(await s.as(member[X], `INSERT INTO public.recipe_ingredients (recipe_id, name) VALUES ($1, 'Sel') RETURNING id`, [rec[X]]), 'ingrédient', 1)
      expectOk(
        await s.as(member[X], `INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES ($1, 9, 'Servir') RETURNING id`, [rec[X]]),
        'étape',
        1,
      )
    })
    controle(`membre ${X} voit toutes les recettes (démo + deux foyers)`, async (s) => {
      expectOk(await s.as(member[X], `SELECT id FROM public.recipes`), 'lecture', 22)
    })
  }

  attaque('membre A (non admin) ne supprime pas une recette de son propre foyer', async (s) => {
    await attemptOnRow(s, 'memberA', { table: 'public.recipes', id: ID.recA }, `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [ID.recA])
  })
  attaque('super-admin (membre de A) ne supprime pas une recette du foyer B', async (s) => {
    await attemptOnRow(s, 'superAdmin', { table: 'public.recipes', id: ID.recB }, `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [ID.recB])
  })
  controle('admin A supprime une recette de son foyer', async (s) => {
    expectOk(await s.as('adminA', `DELETE FROM public.recipes WHERE id = $1 RETURNING id`, [ID.recA]), 'suppression', 1)
  })
  controle('membre A supprime un ingrédient et une étape de sa recette', async (s) => {
    expectOk(await s.as('memberA', `DELETE FROM public.recipe_ingredients WHERE id = $1 RETURNING id`, [ID.ingA]), 'ingrédient', 1)
    expectOk(await s.as('memberA', `DELETE FROM public.recipe_steps WHERE id = $1 RETURNING id`, [ID.stepA]), 'étape', 1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
describe('recipes.image_url : seulement le stockage Supabase ou Unsplash (security_fixes)', () => {
  const bad: [string, string][] = [
    ['un site quelconque (pixel espion)', 'https://espion.example/pixel.gif'],
    ['Unsplash en http', 'http://images.unsplash.com/photo-1'],
    ['un faux domaine Unsplash', 'https://images.unsplash.com.espion.example/x.jpg'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['un autre bucket Supabase', 'https://abcdefghijkl.supabase.co/storage/v1/object/public/autre-bucket/x.webp'],
    // L'en-tête de security_fixes promet « seulement le stockage Supabase DU PROJET » :
    // un autre projet Supabase (celui d'un attaquant) ne doit pas passer.
    ['le stockage d\'un AUTRE projet Supabase (projet d\'un attaquant)', 'https://projetattaquant.supabase.co/storage/v1/object/public/recipe-photos/pixel.webp'],
  ]
  for (const [label, url] of bad) {
    attaque(`membre A ne crée pas de recette dont l'image pointe vers ${label}`, async (s) => {
      const before = await countRows(s, 'public.recipes')
      const o = await s.as('memberA', `INSERT INTO public.recipes (family_id, title, image_url) VALUES ($1, 'Image', $2) RETURNING id`, [
        ID.famA,
        url,
      ])
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
  controle('image_url Unsplash et stockage Supabase recipe-photos acceptées', async (s) => {
    for (const url of [
      'https://images.unsplash.com/photo-1609607285694-e283bd2ea9a0?w=800',
      `https://abcdefghijkl.supabase.co/storage/v1/object/public/recipe-photos/${ID.recA}/x.webp`,
      null,
    ]) {
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
describe('Photos : storage.objects, bucket recipe-photos', () => {
  const ins = `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, auth.uid()) RETURNING id`
  const obj = { A: ID.objA, B: ID.objB } as const

  for (const X of ['A', 'B'] as const) {
    const Y = other(X)
    attaque(`membre ${X} ne dépose pas de photo dans le dossier d'une recette de ${Y}`, async (s) => {
      await attemptInsert(s, member[X], 'storage.objects', ins, [PHOTO_BUCKET, `${rec[Y]}/pirate.webp`])
    })
    attaque(`admin ${X} ne dépose pas de photo dans le dossier d'une recette de ${Y}`, async (s) => {
      await attemptInsert(s, admin[X], 'storage.objects', ins, [PHOTO_BUCKET, `${rec[Y]}/pirate.jpg`])
    })
    attaque(`membre ${X} ne supprime pas une photo d'une recette de ${Y}`, async (s) => {
      await attemptOnRow(s, member[X], { table: 'storage.objects', id: obj[Y] }, `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [obj[Y]])
    })
    attaque(`admin ${X} ne supprime pas une photo d'une recette de ${Y}`, async (s) => {
      await attemptOnRow(s, admin[X], { table: 'storage.objects', id: obj[Y] }, `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [obj[Y]])
    })
    attaque(`membre ${X} ne renomme/déplace pas une photo de ${Y} vers son dossier`, async (s) => {
      await attemptOnRow(s, member[X], { table: 'storage.objects', id: obj[Y] }, `UPDATE storage.objects SET name = $2 WHERE id = $1 RETURNING id`, [
        obj[Y],
        `${rec[X]}/vol.webp`,
      ])
    })
    controle(`membre ${X} dépose une photo dans le dossier d'une recette de son foyer`, async (s) => {
      expectOk(await s.as(member[X], ins, [PHOTO_BUCKET, `${rec[X]}/nouvelle.webp`]), 'dépôt', 1)
    })
    controle(`membre ${X} supprime une photo d'une recette de son foyer`, async (s) => {
      expectOk(await s.as(member[X], `DELETE FROM storage.objects WHERE id = $1 RETURNING id`, [obj[X]]), 'suppression', 1)
    })
    controle(`membre ${X} liste les photos (lecture partagée entre membres, voulue)`, async (s) => {
      expectOk(await s.as(member[X], `SELECT name FROM storage.objects WHERE bucket_id = $1`, [PHOTO_BUCKET]), 'liste', 2)
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
describe('Fonctions RPC, vues par un utilisateur connecté', () => {
  attaque('membre A ne se fait pas passer pour un membre du foyer B (is_family)', async (s) => {
    const o = await s.as('memberA', `SELECT public.is_family($1) AS v`, [ID.famB])
    expect(o.rows[0].v).toBe(false)
  })
  attaque('membre A n\'est pas admin ni super-admin', async (s) => {
    const o = await s.as('memberA', `SELECT public.is_admin() AS a, public.is_super_admin() AS s`)
    expect(o.rows[0]).toEqual({ a: false, s: false })
  })
  controle('membre A : user_family_id() = foyer A, is_member() = vrai', async (s) => {
    const o = await s.as('memberA', `SELECT public.user_family_id() AS f, public.is_member() AS m`)
    expect(o.rows[0]).toEqual({ f: ID.famA, m: true })
  })
  controle('membre B peut appeler recipe_exists() (réservée aux connectés)', async (s) => {
    const o = await s.as('memberB', `SELECT public.recipe_exists($1) AS v`, [ID.recA])
    expect(o.error).toBeUndefined()
    expect(o.rows[0].v).toBe(true)
  })
})
