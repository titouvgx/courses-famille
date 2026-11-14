# Banc d'attaque RLS

Prouve, à chaque lancement, qu'**un foyer ne peut ni lire ni modifier les données d'un autre foyer**
(même dans sa super-famille), qu'une **super-famille** ne voit rien d'une autre, qu'un **anonyme**
n'obtient rien, qu'un membre ne peut pas **s'élever en privilège**, et que les **invitations**
(liens à usage unique) ne se détournent pas.

## Modèle testé (migration `familles_invitations`)

- Une personne = **une famille** (`profiles.family_id`) ; une famille = **une super-famille**
  (`families.super_family_id`, obligatoire) ; `super_families.founder_id` = le **fondateur**
  (crée jusqu'à 3 familles, sans limite s'il est super-admin ; invite et gère les membres de
  toutes les familles de sa super-famille ; n'est membre que de la sienne).
- Données du foyer (planning, créneaux, listes, articles, habituels, placard) : **privées au foyer**,
  y compris vis-à-vis des autres familles de la super-famille et de son fondateur.
- Recettes : `visibility` = `famille` (le foyer), `super_famille` (lecture dans la super-famille,
  écriture par le foyer propriétaire), `catalogue` (recettes livrées : lecture par tous les membres,
  écriture par le super-admin seulement).
- Invitations : seule l'empreinte `sha256(jeton)` est stockée ; aucune écriture directe dans la table ;
  `create_invitation` / `revoke_invitation` / `create_family` (connectés), `invitation_info`
  (aussi anonymes), `consume_invitation` (**`service_role` seulement**, joué par le banc avec
  `SET LOCAL ROLE service_role`, comme la fonction serveur).

```bash
npx vitest run tests/rls
```

Durée : environ 7 s (plus de 1 000 tests). Aucun réseau ni projet Supabase : tout tourne en mémoire dans
[PGlite](https://pglite.dev) (PostgreSQL 18 compilé en WebAssembly).

À la fin, un récapitulatif donne le nombre de **tentatives d'attaque** (bloquées ou non),
de **contrôles positifs** et de **contrôles de structure**, et la liste des échecs.

## Fichiers

| Fichier | Rôle |
|---|---|
| `supabase-stubs.sql` | Ce que Supabase installe sur un projet neuf : rôles `anon` / `authenticated` / `service_role`, **droits par défaut** sur `public` (ALL pour `anon` et `authenticated` : seul RLS protège), schéma `auth` (`auth.users`, `auth.uid()`, `auth.role()`, `auth.jwt()`), schéma `storage` (`buckets`, `objects` avec RLS, `foldername()`, `extension()`), publication `supabase_realtime`, extensions `pgcrypto` et `uuid-ossp` |
| `harness.ts` | Moteur : crée la base, rejoue les stubs puis **toutes** les migrations, relève ce que la dernière a fait des données (`bench.facts`), ajoute les données de test, et fournit `scenario()` / `as()` / `asUid()` / `service()` / `su()` |
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
3. **Données de test** (après toutes les migrations, en super-utilisateur sans claims :
   `auth.uid()` = NULL, ce que les triggers de garde laissent passer) :
   - la super-famille créée par la migration (foyers A et B, fondateur = super-admin) reçoit un
     identifiant fixe : c'est **SA** ;
   - **SB** (fondateur = admin B) est créée et le foyer **B** y est déplacé ;
   - un foyer **A2** est ajouté dans SA, avec un **admin A2** et un **membre A2** ;
   - comptes Auth sans profil : **founderC** (futur fondateur via le lien « fondateur »),
     **nouveau1** / **nouveau2** (pour `consume_invitation`) ;
   - recettes : `recA` (A, `famille`), `recAshared` (A, `super_famille`), `recA2` (A2, `famille`),
     `recB` (B, `famille`), chacune avec ingrédient et étape, auteur = un membre du foyer ;
     les 50 recettes livrées sont au `catalogue` (le banc utilise « Bœuf bourguignon ») ;
   - pour A, A2 et B : planning (semaines différentes), créneau, liste, article, habituel,
     placard ; photos dans `recipe-photos` (dont une pour `recAshared` et une pour `recA2`) ;
   - invitations en attente : une par foyer (créées par son admin) + un lien « fondateur »
     (super-admin), jetons connus du banc (`TOKEN`), seule l'empreinte est en base.

   Identifiants fixes : voir `ID` dans `harness.ts`.
4. **Chaque test** s'exécute dans une transaction **toujours annulée** (`ROLLBACK`) : les tests
   sont indépendants. Pour jouer un utilisateur, le banc fait comme PostgREST :
   `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', '{"sub": …, "role": "authenticated"}', true)`
   (anonyme : `SET LOCAL ROLE anon`, aucun claim ; clé secrète : `SET LOCAL ROLE service_role`,
   claims sans `sub`). La requête tourne dans un `SAVEPOINT`.

### Comment une attaque est jugée

- **Bloquée** = erreur `42501` (refus RLS ou trigger) **ou** 0 ligne lue / touchée
  (une écriture filtrée par RLS ne lève pas d'erreur : elle touche 0 ligne). Certains refus
  attendus sont plus précis (code + message) : `22023` (lien invalide, nom invalide),
  `23514` (3 familles max, 20 liens en attente, recette partagée encore au planning d'une
  autre famille), `42501 permission denied for function` (fonction fermée à ce rôle).
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

- les 17 tables de `public`, en SELECT / INSERT / UPDATE / DELETE, pour l'anonyme et pour un
  compte sans foyer ; un test balaie aussi les tables **futures** ;
- entre foyers, dans quatre sens : A→B, B→A (**autre super-famille**) et A→A2, A2→A
  (**même super-famille**) : planning, créneaux, listes, articles, habituels, placard, profils,
  recettes « famille », photos (lecture, ajout, modification, suppression, déplacement dans un
  sens et dans l'autre, `UPDATE` de masse) ; le fondateur n'entre pas dans les données privées
  des autres familles de sa super-famille ;
- `families` (lecture dans la super-famille, renommage par l'admin de la famille ou le fondateur,
  pas de changement de super-famille) et `super_families` (lecture, renommage par le fondateur,
  fondateur non transférable, ni INSERT ni DELETE directs) ;
- élévation de privilège sur `profiles` (rôle : admin de la famille ou fondateur, jamais le sien)
  et `super_admins` ;
- recettes : visibilité `famille` / `super_famille` / `catalogue`, auteur = soi, famille et
  auteur figés, pas de recette `catalogue` hors super-admin, passage `super_famille` → `famille`
  refusé si une autre famille l'a au planning, on ne planifie qu'une recette lisible ;
- invitations : table fermée en écriture, lecture par qui peut inviter, `create_invitation`
  (droits, lien « fondateur » réservé au super-admin, jeton jamais en clair, 20 liens max),
  `revoke_invitation`, `invitation_info` (5 états, rien d'autre que type / rôle / nom),
  `consume_invitation` (usage unique, expiré / annulé / inconnu, compte déjà rattaché, noms,
  lien fondateur → super-famille + famille + profil admin) ; `create_family` (fondateur seulement,
  3 familles sauf super-admin) ;
- gardes : `checked_by` d'un autre foyer, `shopping_lists.meal_plan_id` d'un autre foyer,
  `recipes.image_url`, `meal_slots.cook_id` ;
- `storage.objects`, bucket `recipe-photos` : liste limitée aux recettes lisibles, envoi
  seulement dans une recette modifiable ;
- fonctions RPC vues par un anonyme et par un membre ;
- structure : RLS partout, pas de rôle d'API qui contourne RLS, droits par défaut Supabase
  présents, publication Realtime limitée à des tables protégées, liste des fonctions
  `SECURITY DEFINER` ouvertes aux anonymes figée (toute nouvelle doit être revue), droits
  d'exécution des fonctions d'invitation et des gardes, ce que la migration a fait des données
  existantes (une super-famille, fondateur = super-admin, recettes livrées au catalogue).

## Ajouter une table ou une règle

Une **nouvelle table** dans `public` fait échouer le test de structure
« les 17 tables de public sont toutes couvertes » : ajoute-la à `PUBLIC_TABLES` et à
`INSERT_A` dans `rls.test.ts` (et à `SCOPED` si elle appartient à un foyer : il faudra alors
une ligne pour A, A2 et B dans les données de test). Une nouvelle
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
- **Données** : trois foyers, trois super-familles au plus et quelques lignes ; pas de test de
  performance des règles.
- **Concurrence** : une seule session. Les limites comptées dans un trigger ou une fonction
  (3 familles par super-famille, 20 liens en attente) ne sont pas testées sous accès simultanés
  (deux appels en même temps pourraient chacun voir « 2 » et passer). L'usage unique d'un lien
  repose sur un `UPDATE … WHERE used_at IS NULL` atomique, non rejoué en parallèle.
- **Fonction serveur** `accepter-invitation` : non testée ici (création du compte Auth,
  suppression en cas d'échec) ; le banc appelle `consume_invitation` directement en `service_role`.
- **Oracles d'existence** non bloqués (identifiant à connaître, UUID aléatoire) :
  `family_super_family(<famille>)` répond aussi aux anonymes ; `recipe_exists()` et la clé
  étrangère `shopping_list_items.source_recipe_id` révèlent qu'une recette existe, même illisible.
