# Courses en famille — Contexte projet

PWA familiale : recettes, planning de la semaine, liste de courses partagée en temps réel entre les membres d'une famille.
- **Site** : https://titouvgx.github.io/courses-famille/ — **Repo** : https://github.com/titouvgx/courses-famille (public)
- **Détails à lire seulement si besoin** : `docs/architecture.md` (modèle, Realtime, photos, hors connexion, vie du foyer, structure des fichiers, recettes livrées), `docs/design.md` (design « Mer », règles UI mobile), `docs/historique.md` (étapes passées, anciennes décisions), `supabase/prod/README.md` (mise en prod), `tests/rls/README.md` (banc d'attaque)

## Règles de travail (demandées par l'utilisateur)
- Tutoiement, explications simples (il doit pouvoir les raconter avec ses mots). Séparer vérifié / supposé, taux de fiabilité en % sur les réponses importantes, vérifier sur internet ce qui peut changer
- Signaler de soi-même risques et angles morts. Poser les questions si l'attendu n'est pas clair
- Économiser les tokens : pas de sous-agent sauf gros chantier parallèle demandé ; captures seulement des écrans modifiés ; sorties de commandes filtrées
- **Pousser sur `main` (= déploiement) seulement si vérifié** : `npm run check` sans erreur, `npm test`, `npm run build`, captures mobiles 393×852 regardées
- Idées de la « boîte à idées » : rien sans feu vert explicite

## Stack
Svelte 5 (runes uniquement : `$state`, `$derived`, `$effect`, `$props`) + TypeScript + Vite 8 · Supabase (Postgres + RLS, Auth, Realtime, Storage, fonction serveur Deno) · GitHub Pages (routeur hash `#/route`, pas de SSR) · service worker `pwa/sw.js` · Vitest (`tests/unit`, `tests/rls` dans PGlite)

**Pièges Svelte** : `{@const}` enfant DIRECT d'un bloc `{#each}`/`{#if}` ; la variable du canal Realtime ne doit PAS être en `$state` (boucle infinie).

## Routes (`src/lib/router.svelte.ts`)
`login`, `accueil` (défaut), `recettes`, `nouvelle-recette`, `recette/<id>`, `editer-recette/<id>`, `semaine`, `courses`, `historique`, `compte`, `frigo`, `famille` (Ma famille), `admin` (super-admin). Publiques (plein écran) : `rejoindre/<jeton>`, `mot-de-passe-oublie`, `nouveau-mot-de-passe` (`?token_hash=…&type=recovery` AVANT le `#`). Tab bar : Accueil | Recettes | Semaine | Courses | Historique

## Modèle familles (migration 17)
- **Une personne = une famille** (`profiles.family_id`, rôle `admin`/`member`) ; **une famille = une super-famille** (`families.super_family_id`)
- **Super-admin** (`super_admins`) : voit tout, crée les liens « fondateur » (`#/admin`)
- **Fondateur** (`super_families.founder_id`) : crée jusqu'à 3 familles (illimité si super-admin), invite et gère dans toutes ses familles, n'est membre que de la sienne
- **Admin de famille** : invite dans SA famille (membre ou admin), change les rôles (jamais le sien ni celui du fondateur), renomme la famille, retire un membre ; ne renomme pas les autres
- **Retirer** (`remove_member`, migration 19) = supprimer le compte (`auth.users` → profil en cascade, recettes gardées avec auteur NULL, ses liens supprimés) ; jamais soi-même, le fondateur ni un super-admin. **Supprimer une famille** (`delete_family`) : fondateur ou super-admin, famille vide (0 membre, 0 lien en attente), pas la sienne, pas celle du catalogue, aucune recette au planning d'une autre famille. Plus de `DELETE` direct sur `families` / `profiles`
- **Invitations** : lien à usage unique, 7 jours, annulable, seul `sha256(jeton)` stocké, 20 en attente max par personne. Compte créé par la fonction serveur `supabase/functions/accepter-invitation` (`createUser` puis `consume_invitation`, réservé `service_role` ; compte supprimé si le rattachement échoue)
- **Recettes** : `visibility` = `famille` (défaut) | `super_famille` | `catalogue` (50 recettes livrées, lecture seule sauf super-admin). Planning, listes, habituels, placard : par famille (`is_family`)
- Fonctions SQL : `create_invitation`, `revoke_invitation`, `invitation_info` (anonyme), `consume_invitation`, `create_family`, `remove_member`, `delete_family` ; aides `can_read_recipe`, `can_edit_recipe`, `can_invite`, `is_founder…` ; gardes `guard_profile_update`, `guard_family_write`, `guard_super_family_update`, `guard_recipe_write` (auteur → NULL permis si son compte n'existe plus), `guard_item_checked_by`, `guard_family_delete`
- API front : `src/lib/api/famille.ts` ; contexte (`family`, `superFamily`, `isFounder`, `isSuperAdmin`) dans `src/lib/profile.svelte.ts`

## Migrations (`supabase/migrations/`, dans l'ordre, SQL Editor)
1 schema · 2 rls_functions · 3 rls_policies · 4 seed_categories · 5 shopping_categories_icon · 6 known_ingredients · 7 seed_recipes (⚠️ échoue sans 1 compte + 1 famille) · 8 shared_recipes · 9 recipe_images · 10 realtime_publication · 11 recipe_photos_storage · 12 security_fixes · 13 household · 14 more_ingredients · 15 photo_paths (`image_url` = chemin `<recette>/<uuid>.webp|jpg` de notre bucket ou Unsplash ; fichier vérifié) · 16 recettes_v1 (**GÉNÉRÉE** par `npm run recettes`) · 17 familles_invitations · 18 recettes_photos (**GÉNÉRÉE**, depuis `supabase/recettes/photos.json`) · 19 admin_famille (retirer un membre, supprimer une famille vide, gardes)

**État des bases** (à tenir à jour) :
- `courses-test` : 1 à 19 appliquées et vérifiées le 14/11/2026 (513 ingrédients, 50 catalogue dont 49 avec photo, 0 table sans RLS ; contrôle 19 : `supabase/tests/controle_19_admin_famille.sql`, tout à true) ; fonction `accepter-invitation` redéployée (adresse `/accepter-invitation`, Verify JWT désactivé), invitation testée OK
- `courses-prod` : pas encore créée → guide `supabase/prod/README.md` (`npm run prod:sql`)

**Règle** : migration exécutée et vérifiée (requête de contrôle) AVANT de pousser le code qui en dépend. Nouvelle table = RLS par famille + attaques ajoutées dans `tests/rls` avant de pousser. Recettes livrées : `visibility = 'catalogue'`, JSON dans `supabase/recettes/` (jamais les vraies recettes de la famille dans le dépôt public), migrations générées jamais éditées à la main.

## Sécurité (OBLIGATOIRE)
- **Jamais de clé secrète** (`sb_secret_…` / service_role) ni mot de passe base dans le dépôt, `.env.local` ou variables GitHub : clé **publishable** seulement (garde-fous dans `vite.config.ts` et `src/lib/supabase.ts`)
- **RLS jamais désactivé**. RLS = lignes ; pour limiter des colonnes → trigger. Sur Supabase, viser `anon` explicitement dans les `REVOKE`
- **E-mail de l'utilisateur** : privé, jamais transmis à l'extérieur sans accord
- Ne pas lancer `npm audit fix --force`. Pas de ressource tierce (polices hébergées avec le site)
- **CSP** (`index.html`) : scripts du site ; connexions `*.supabase.co` et Unsplash seulement. Toute nouvelle source externe → l'ajouter à la CSP
- Actions GitHub épinglées par SHA, permissions minimales
- Droits côté appli = droits de la base ; une suppression filtrée par RLS (0 ligne) est signalée, jamais affichée comme réussie
- En place : `security-check.yml` (un inconnu ne lit rien, après chaque déploiement + lundi), `verifications.yml` (secrets, audit, types, tests, build ; le déploiement en dépend), banc RLS : 861 attaques bloquées, 191 contrôles positifs

## Pièges connus
- `signIn()` ne touche PAS `auth.loading` (sinon la page de connexion est remplacée par le spinner)
- Service worker : chaque déploiement recharge l'appli ouverte (différé pendant le formulaire recette) ; enregistré seulement en build
- `body` doit rester transparent (fond photo `AppBackdrop`) ; fenêtres `.overlay` en `z-index: 200` (tab bar à 100)
- Icônes : composant `Icon.svelte` ; émojis seulement pour les rayons et l'ingrédient 🥕. Animer seulement `transform`/`opacity`, `prefers-reduced-motion` respecté, zones de tap ≥ 44 px, `:hover` seulement souris

## Risques et faiblesses connus (à traiter en 1.0.x)
- `regenerateList` non atomique (suppression puis insertion) → piste : fonction Postgres en une transaction
- Supprimer une recette efface ses créneaux dans toutes les familles (cascade) → piste choisie : archiver plutôt que supprimer (à décider)
- `shopping_lists.meal_plan_id` peut pointer le planning d'une autre famille (incohérent, pas de fuite) ; `created_by` usurpable sur certaines tables ; photos orphelines listables par tout membre ; `recipe_exists()` révèle l'existence d'un id
- `sameProduct` : « Beurre de cacahuète » ≈ « Beurre »
- Pas de limite de longueur sur les textes de recettes ; pas de sauvegarde automatique (offre gratuite) ; tâches GitHub planifiées coupées après 60 jours sans commit ; e-mails Supabase ≈ 2/heure

## Versions et mise en ligne
- SemVer, source unique `package.json` (affichée dans l'appli) ; chaque changement notable → `CHANGELOG.md` section `[Non publié]` avec les migrations nécessaires
- Sortir X.Y.Z : bases à jour → `npm version X.Y.Z --no-git-tag-version` → CHANGELOG daté → check + test + build + captures → commit « Version X.Y.Z » sur main → vérifier site et Actions → `git tag vX.Y.Z && git push origin vX.Y.Z`
- Branche de travail → vérifications ; `main` → vérifications puis déploiement
- Réglages Supabase par base pour invitations / mot de passe oublié : fonction `accepter-invitation` déployée (Verify JWT désactivé, `supabase/functions/README.md`) ; Site URL + Redirect URLs = adresse du site ; modèle « Reset Password » : `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery#/nouveau-mot-de-passe`

## Suite
- **Administration v1** (migration 19) : en ligne le 14/11/2026. Hors v1 : déplacer une famille, désactiver un compte, gérer le catalogue dans l'appli (reste en JSON), quitter soi-même sa famille, supprimer une famille d'une autre super-famille depuis `#/admin`
- **Étape 10 : mise en prod → v1.0.0** (guide `supabase/prod/README.md`), après les tests de l'utilisateur sur téléphone
- **Validé, à faire ensuite** : booster des recettes du jour (accueil : booster qui se déchire, 5 cartes qui sortent vers leur place `floatLayout`, une ouverture par jour, bouton « Passer », mouvement réduit → cartes directes)
- **Boîte à idées (feu vert requis)** : liste par WhatsApp/SMS, recopier une semaine, favoris et notes, minuteurs en cuisine, notifications, livre de recettes PDF, figer la liste, arrondir les pièces, Nutri-Score, Playwright + sauvegardes, import de recette par lien
- **Décision produit** : l'appli reste familiale (pas de Play Store). Plan grand public dans les docs Claude de l'utilisateur : seulement sur demande

## Commandes
`npm run dev` · `npm run build` · `npm run check` (types) · `npm test` (unitaires + banc RLS) · `npm run test:unit` · `npm run test:rls` · `npm run recettes` (génère migrations 16 et 18) · `npm run prod:sql`
