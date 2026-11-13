# Banc d'attaque RLS

Prouve, à chaque lancement, qu'**un foyer ne peut ni lire ni modifier les données d'un autre foyer**,
qu'un **anonyme** n'obtient rien et qu'un membre ne peut pas **s'élever en privilège**.

```bash
npx vitest run tests/rls
```

Durée : environ 4 s. Aucun réseau ni projet Supabase : tout tourne en mémoire dans
[PGlite](https://pglite.dev) (PostgreSQL 18 compilé en WebAssembly).

À la fin, un récapitulatif donne le nombre de **tentatives d'attaque** (bloquées ou non),
de **contrôles positifs** et de **contrôles de structure**, et la liste des échecs.

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase-stubs.sql` | Ce que Supabase installe sur un projet neuf : rôles `anon` / `authenticated` / `service_role`, **droits par défaut** sur `public` (ALL pour `anon` et `authenticated` : seul RLS protège), schéma `auth` (`auth.users`, `auth.uid()`, `auth.role()`, `auth.jwt()`), schéma `storage` (`buckets`, `objects` avec RLS, `foldername()`, `extension()`), publication `supabase_realtime`, extensions `pgcrypto` et `uuid-ossp` |
| `harness.ts` | Moteur : crée la base, rejoue les stubs puis **toutes** les migrations, ajoute les données de test, et fournit `scenario()` / `as()` / `su()` |
| `rls.test.ts` | Les tentatives (une par test, nommée en français) |

## Fonctionnement

1. **Migrations** : tous les fichiers `.sql` de `supabase/migrations/` sont rejoués dans l'ordre
   alphabétique (= chronologique), chacun dans sa transaction, comme la CLI Supabase.
   Une migration ajoutée au dossier est prise **sans rien modifier ici**.
   Les extensions demandées par un `CREATE EXTENSION` sont chargées automatiquement depuis
   `@electric-sql/pglite/contrib/` (erreur claire si PGlite ne la fournit pas).
2. **Crochet avant `seed_recipes`** : cette migration exige au moins une famille et un
   utilisateur (`RAISE EXCEPTION` sinon). Juste avant le premier fichier dont le nom contient
   `seed_recipes`, le banc crée :
   - les foyers **A** et **B** ;
   - dans chacun un **admin** et un **membre** ;
   - un **super-admin** (profil dans A, rôle `member`, ligne dans `super_admins`) ;
   - un compte Auth **sans profil** (connecté mais sans foyer).

   Les dates `created_at` sont fixées pour que « la première famille / le premier utilisateur »
   de `seed_recipes` soient de façon sûre le foyer A et l'admin A. Si un jour aucun fichier
   ne s'appelle `seed_recipes`, le crochet s'exécute après la dernière migration.
3. **Données de test** (après toutes les migrations), pour A et pour B : une recette avec
   ingrédient et étape, un planning (semaines différentes), un créneau, une liste de courses,
   un article, un habituel, un produit du placard, une photo dans `recipe-photos`.
   Identifiants fixes : voir `ID` dans `harness.ts`.
4. **Chaque test** s'exécute dans une transaction **toujours annulée** (`ROLLBACK`) : les tests
   sont indépendants. Pour jouer un utilisateur, le banc fait comme PostgREST :
   `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', '{"sub": …, "role": "authenticated"}', true)`
   (anonyme : `SET LOCAL ROLE anon`, aucun claim). La requête tourne dans un `SAVEPOINT`.

### Comment une attaque est jugée

- **Bloquée** = erreur `42501` (refus RLS ou trigger) **ou** 0 ligne lue / touchée
  (une écriture filtrée par RLS ne lève pas d'erreur : elle touche 0 ligne).
- L'état réel est **relu en super-utilisateur** avant et après : la ligne visée doit exister
  avant et être identique après (ou la table avoir le même nombre de lignes pour un INSERT,
  la même empreinte pour une écriture de masse).
- Toute **autre** erreur (colonne inconnue, contrainte d'unicité, clé étrangère…) fait échouer
  le test : un gabarit SQL cassé ne doit jamais passer pour un blocage. Un refus
  « permission denied for table » fait aussi échouer : il voudrait dire que les stubs sont
  plus stricts que Supabase.
- Les **contrôles positifs** rejouent les mêmes requêtes sur ses propres données et
  doivent réussir ; un contrôle de structure exécute aussi chaque gabarit en super-utilisateur.
- Les déplacements sont aussi tentés par un `UPDATE` **sans WHERE ni RETURNING** : dans ce
  cas PostgreSQL n'applique pas la règle SELECT à la nouvelle ligne, seul le `WITH CHECK`
  de la règle UPDATE protège.

### Couverture

- les 15 tables de `public`, en SELECT / INSERT / UPDATE / DELETE, pour l'anonyme et pour un
  compte sans foyer ; un test balaie aussi les tables **futures** ;
- entre foyers, dans les deux sens (A→B et B→A) : planning, créneaux, listes, articles,
  habituels, placard, foyers, profils (lecture, ajout, modification, suppression, déplacement
  `family_id` / `meal_plan_id` / `shopping_list_id` dans un sens et dans l'autre) ;
- élévation de privilège sur `profiles` et `super_admins` ;
- recettes partagées en lecture, modifiables / supprimables par le seul foyer propriétaire ;
- `recipes.image_url` (contrainte `recipes_image_url_origin` + trigger `trg_recipe_image_exists`, migration `photo_paths`) ;
- `meal_slots.cook_id` (trigger `guard_meal_slot_cook`) ;
- `storage.objects`, bucket `recipe-photos` ;
- fonctions RPC vues par un anonyme et par un membre ;
- structure : RLS partout, pas de rôle d'API qui contourne RLS, droits par défaut Supabase
  présents, publication Realtime limitée à des tables protégées, liste des fonctions
  `SECURITY DEFINER` ouvertes aux anonymes figée (toute nouvelle doit être revue).

## Ajouter une table ou une règle

Une **nouvelle table** dans `public` fait échouer le test de structure
« les 15 tables de public sont toutes couvertes » : ajoute-la à `PUBLIC_TABLES` et à
`INSERT_A` dans `rls.test.ts` (et à `SCOPED` si elle appartient à un foyer). Une nouvelle
fonction `SECURITY DEFINER` appelable par `anon` fait échouer le test correspondant.

Pour vérifier que le banc détecte bien une règle cassée, on peut le lancer sur une copie
modifiée des migrations :

```bash
RLS_MIGRATIONS_DIR=/tmp/migrations-modifiees npx vitest run tests/rls
```

## Différences avec le vrai Supabase (ce que le banc ne prouve PAS)

- **SQL direct au lieu de l'API** : le banc parle à PostgreSQL, pas à PostgREST, Storage ni
  Realtime. Il prouve ce que les règles de la base autorisent ; il ne voit ni les réglages
  de l'API (schémas exposés, `max_rows`, filtres obligatoires), ni Auth (inscriptions
  fermées, confirmation d'e-mail, durée des sessions), ni la vérification de signature des JWT.
- **Le SQL direct est plus puissant que l'API** : un attaquant réel ne peut ni choisir ses
  claims (`set_config`), ni lancer `TRUNCATE` (que RLS ne filtre pas et que les droits par
  défaut de Supabase accordent), ni exécuter des commandes arbitraires. Le banc ne joue
  donc que des requêtes qu'un client peut formuler (SELECT / INSERT / UPDATE / DELETE, RPC).
- **Storage** : seules les règles RLS de `storage.objects` sont testées. Le serveur Storage
  (taille max 2 Mo, types MIME, accès aux URL publiques, `upsert`, listage par préfixe)
  n'est pas simulé. Le bucket est **public** : une photo reste lisible par quiconque
  connaît son URL, quoi qu'en disent les règles.
- **Realtime** : le filtrage RLS des événements diffusés n'est pas testé (seule la
  composition de la publication l'est).
- **Rôles et propriétaires** : les migrations sont rejouées par le super-utilisateur de
  PGlite (sur Supabase : `postgres`, non super-utilisateur ; tables de `storage` et `auth`
  possédées par `supabase_storage_admin` / `supabase_auth_admin`). Une migration qui
  marcherait ici pourrait échouer sur Supabase faute de droits (et inversement).
- **Schémas simplifiés** : `auth.users`, `storage.buckets`, `storage.objects` n'ont que leurs
  colonnes principales ; pas de triggers internes de Storage, pas de `pg_graphql`,
  `pgsodium`, `supabase_vault`, `pg_net`… Les définitions de `storage.extension()` /
  `foldername()` sont celles des versions récentes de Supabase.
- **Version** : PGlite embarque PostgreSQL 18 ; la version du projet Supabase peut différer.
- **Données** : deux foyers et quelques lignes ; pas de test de performance des règles.
