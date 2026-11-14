# Courses en famille — Contexte projet

## Présentation

PWA de gestion de courses en famille. Permet de créer des recettes, planifier les repas de la semaine, et générer automatiquement une liste de courses partagée en temps réel entre les membres d'un foyer.

**URL prod** : https://titouvgx.github.io/courses-famille/
**Repo** : https://github.com/titouvgx/courses-famille (public)

## Stack technique

- **Frontend** : Svelte 5 (runes) + TypeScript + Vite 8
- **Backend** : Supabase (PostgreSQL + Auth + Realtime)
- **Hébergement** : GitHub Pages (SPA avec hash router `#/route`)
- **PWA** : manifest.json + service worker (`pwa/sw.js`, modèle copié au build avec un cache propre à chaque déploiement)
- **Pas de SSR** — tout est client-side
- **Version** : `package.json` (source unique), affichée dans l'appli — voir « Versionnement »
- **Tests** : Vitest (`tests/unit` calculs, `tests/rls` banc d'attaque RLS dans PGlite)

### Svelte 5 — conventions

Ce projet utilise exclusivement les **runes Svelte 5** :
- `$state()` pour l'état réactif
- `$derived()` et `$derived.by()` pour les valeurs calculées
- `$effect()` pour les effets de bord
- `$props()` pour les props de composants
- `onDestroy` (import depuis `svelte`) pour le cleanup

**Piège connu** : `{@const}` doit être un enfant **direct** d'un bloc `{#each}`, `{#if}`, etc. — PAS dans un `<div>` à l'intérieur du bloc.

### Routeur hash

Le routeur (`src/lib/router.svelte.ts`) utilise le hash (`#/recettes`, `#/recette/<id>`) pour la compatibilité GitHub Pages. Les routes :
- `login`, `accueil` (route par défaut), `recettes`, `nouvelle-recette`, `recette/<id>`, `editer-recette/<id>`
- `semaine`, `courses`, `historique`, `compte`, `frigo` (« Qu'est-ce qu'on mange ? », onglet Accueil actif)
- `famille` (Ma famille : membres, rôles, invitations ; fondateur : ses familles), `admin` (super-admin)
- **Pages publiques** (`PUBLIC_ROUTES`, plein écran, hors coque connectée) : `rejoindre/<jeton>`, `mot-de-passe-oublie`, `nouveau-mot-de-passe` (arrivée depuis l'e-mail avec `?token_hash=…&type=recovery` AVANT le `#`, retiré de l'adresse aussitôt)

Tab bar : Accueil | Recettes | Semaine | Courses | Historique

## Architecture Supabase

### Deux projets

- **courses-test** : développement actif
- **courses-prod** : production (pas encore branché, étape 10)

### Modèle de données (17 tables)

```
families, profiles, super_admins,
recipe_categories, shopping_categories,
recipes, recipe_ingredients, recipe_steps,
meal_plans, meal_slots,
shopping_lists, shopping_list_items,
known_ingredients (autocomplétion, migration 6),
staples (habituels) et pantry_items (placard) — migration 13,
super_families et invitations — migration 17
```

### Familles, super-familles, invitations (migration 17)
- **Une personne = une famille** (`profiles.family_id`) ; **une famille = une super-famille** (`families.super_family_id`)
- **Fondateur** (`super_families.founder_id`) : crée jusqu'à **3 familles** (sans limite si super-admin), invite dans toutes ses familles, voit et gère leurs membres ; il n'est membre que de sa propre famille
- **Admin d'une famille** : invite dans SA famille (rôle membre ou admin), change les rôles (jamais le sien), renomme la famille
- **Super-admin** : crée les liens « fondateur » (page `#/admin`) ; voit tout
- **Lien d'invitation** : usage unique, 7 jours, annulable ; seul `sha256(jeton)` est stocké, le jeton n'est montré qu'à la création ; 20 liens en attente max par personne ; le jeton est dans le `#` de l'adresse (jamais envoyé au serveur web)
- **Création du compte** : fonction serveur `supabase/functions/accepter-invitation` (clé secrète côté Supabase seulement) → `auth.admin.createUser` puis `consume_invitation()` (atomique, réservé à `service_role`) ; si le rattachement échoue, le compte est supprimé. Lien fondateur : compte + super-famille + famille + profil admin en une fois (pas d'état « compte sans famille »)
- **Recettes** : `visibility` = `famille` (défaut) | `super_famille` | `catalogue` (les 50 recettes livrées, lecture seule sauf super-admin). Une recette partagée ne peut plus repasser en « famille » si une autre famille l'a au planning
- Fonctions : `create_invitation`, `revoke_invitation`, `invitation_info` (accessible sans compte), `consume_invitation` (service_role), `create_family` ; aides `can_read_recipe`, `can_edit_recipe`, `can_invite`, `is_founder…`
- Les recettes livrées par une future migration doivent être créées avec `visibility = 'catalogue'`

### Concept clé : "familles" = foyers

Tous les utilisateurs font partie d'une grande famille. Les "familles" dans l'app sont en réalité des **sous-familles (foyers)**. Les recettes sont **partagées entre tous les foyers** (RLS via `is_member()`), mais les meal plans et shopping lists sont **scopés par foyer** (RLS via `is_family(family_id)`).

### Migrations SQL

Dans `supabase/migrations/` — à exécuter dans l'ordre dans le SQL Editor de Supabase :
1. `schema.sql` — 12 tables
2. `rls_functions.sql` — fonctions helper RLS
3. `rls_policies.sql` — 48 policies RLS
4. `seed_categories.sql` — 4 catégories recettes + 10 rayons courses
5. `shopping_categories_icon.sql` — icônes emoji par rayon
6. `known_ingredients.sql` — 262 ingrédients pour autocomplétion
7. `seed_recipes.sql` — 20 recettes de démo (générées par l'IA, voir « Recettes de démo »). ⚠️ **Échoue sur une base vide** : créer d'abord au moins 1 compte (Auth) et 1 foyer (`families`)
8. `shared_recipes.sql` — partage entre foyers
9. `recipe_images.sql` — images Unsplash
10. `realtime_publication.sql` — temps réel sur `shopping_list_items` ET `meal_slots` (idempotent)
11. `recipe_photos_storage.sql` — bucket public `recipe-photos` + politiques RLS Storage (idempotent)
12. `security_fixes.sql` — audit du 13/11/2026 : rôle et foyer verrouillés dans `profiles` (trigger `guard_profile_update`), admin limité à son foyer, `recipe_exists` fermé aux anonymes, `image_url` limitée au stockage Supabase / Unsplash (idempotent)
13. `household.sql` — `meal_slots.cook_id` (cuisinier du foyer, trigger), tables `staples` (habituels) et `pantry_items` (placard), `shopping_list_items.needed` (« il en manque »). RLS `is_family`, longueurs bornées (idempotent)
14. `more_ingredients.sql` — 251 ingrédients de plus dans `known_ingredients` (rayon par nom de rayon, `ON CONFLICT DO NOTHING`, idempotent)
15. `photo_paths.sql` — **`recipes.image_url` = chemin `<id recette>/<uuid>.webp|jpg` de NOTRE bucket** (plus d'URL complète : l'appli reconstruit l'adresse avec `VITE_SUPABASE_URL`) ou photo Unsplash `https://images.unsplash.com/photo-…` ; trigger `trg_recipe_image_exists` : le fichier doit exister dans `recipe-photos`. Convertit les anciennes URL de nos photos, vide le reste (idempotent). ⚠️ **Ordre** : déployer d'abord le code ≥ v0.9.0, puis exécuter cette migration aussitôt (entre les deux, l'envoi de photo est refusé)
16. `recettes_v1.sql` — **GÉNÉRÉ** par `npm run recettes` depuis `supabase/recettes/*.json` (ne jamais l'éditer à la main) : corrige les 20 recettes de démo **seulement si elles sont encore dans leur état d'origine** (empreinte md5 ; une recette modifiée dans l'appli n'est pas touchée) et ajoute 30 recettes si le titre n'existe pas. Idempotente, indépendante du code
17. `familles_invitations.sql` — super-familles, invitations, visibilité des recettes, règles RLS réécrites (recettes, ingrédients, étapes, planning, listes, photos), gardes (auteur, « coché par », planning d'un autre foyer). Rattache les familles existantes à une super-famille (fondateur : premier super-admin). Idempotente
18. `recettes_photos.sql` — **GÉNÉRÉ** par `npm run recettes` depuis `supabase/recettes/photos.json` : une photo Unsplash vérifiée à l'œil par recette du **catalogue** (jamais les recettes des familles, jamais une photo envoyée dans l'appli). Nécessite la 17. Idempotente

**État des bases** (à tenir à jour) :
- `courses-test` : migrations 1 à 14 appliquées et vérifiées le 13/11/2026 (requête de contrôle ; `known_ingredients` = 513 lignes) ; **15 à exécuter juste après le déploiement de la v0.9.0**, puis 16 (n'importe quand)
- `courses-prod` : pas encore créée

**Règle** : une migration est exécutée dans la base **avant** de pousser le code qui en dépend, puis vérifiée par une requête de contrôle (tables, colonnes, triggers, RLS actif). Toute nouvelle table : RLS par foyer + attaques ajoutées dans `tests/rls` avant de pousser.

### Realtime

Liste de courses (Courses) et planning (Semaine) se synchronisent entre membres du foyer.
Prérequis : migration `20261113110000_realtime_publication.sql` (ajoute les deux tables à `supabase_realtime`).
Piège Svelte 5 : la variable qui garde le canal Realtime ne doit **pas** être en `$state` (l'effet qui s'abonne la lit puis l'écrit → boucle infinie).

### Photos de recettes (`src/lib/api/recipeImages.ts`)
- Choisies depuis la galerie dans le formulaire, **compressées dans le navigateur** (1600 px max, WebP ou JPEG si Safari, < 400 Ko). Le ré-encodage supprime les métadonnées EXIF (dont le GPS)
- Bucket **public** `recipe-photos` (URL stables, cache hors connexion) ; chemin `<recipeId>/<uuid>.webp` ; envoi réservé au foyer propriétaire ; pas d'écrasement ; dossier vidé à la suppression de la recette
- Le service worker met les photos en cache (cache séparé, 150 max, requêtes CORS pour éviter les réponses opaques)

### Recherche de recettes
- Index léger (`id, title, category_id`) de toutes les recettes chargé une fois, filtré côté client : insensible aux accents, à la casse et à l'ordre des mots (`normalizeText` dans `quantities.ts`). Recettes complètes chargées par pages de 30

### Hors connexion (`src/lib/offline.ts`)
- La dernière liste de courses et le profil sont gardés dans `localStorage` (clés `courses:*`)
- Les cochages faits sans réseau sont mis en file et renvoyés au retour du réseau (`flushPending`)
- Tout est effacé à la déconnexion (`clearProfile(true)`)

### Vie du foyer (`src/lib/api/household.ts`)
- **Qui cuisine ?** : pastille sur chaque repas de Semaine (`CookPicker`), filtre « Mes repas » ; `setSlot` garde le cuisinier quand on change la recette ; Accueil : « Ce soir : … · X cuisine »
- **Habituels** : bouton dans Courses (`StaplesDialog`) → articles `is_extra` (survivent à la mise à jour), sans doublon d'un article non coché
- **Placard** (`PantryDialog`) : les articles du planning qui y sont vont dans « Sûrement déjà à la maison » (non comptés) ; « Il en manque » → `needed = true` (gardé par `regenerateList`)
- **Qu'est-ce qu'on mange ?** (`Frigo.svelte`) : calcul dans le téléphone (`rankByFridge`) sur tous les ingrédients des recettes (lus par pages de 1000), placard compté comme disponible
- Correspondance des noms : `matchKey` / `sameProduct` (quantities.ts) — pluriel toléré, « sel » ≈ « sel fin », mais « pâtes » ≠ « pâte à crêpes »
- **Sans la migration 13**, l'appli fonctionne comme avant (colonnes nouvelles envoyées seulement si utiles, erreurs de chargement ignorées)

### Liste de courses
- `regenerateList` : recalcule depuis le planning en **gardant** les articles cochés et ceux ajoutés à la main (`is_extra`)
- « Juste les ingrédients » (recette non planifiée) → articles `is_extra = true` (survivent à la régénération)
- Quantités : `src/lib/quantities.ts` (regroupe g/kg, ml/cl/l, unités identiques ; « 1,5 kg », format français)

## Design System — « Mer »

L'appli entière est posée sur une **photo de mer floutée** (`AppBackdrop`, montée une fois dans `App.svelte`).
Elle est donc **toujours en tons bleu nuit, texte clair** : il n'y a plus de mode clair (le texte foncé serait illisible sur la photo).

### Couleurs (tokens dans `src/app.css`)

| Token | Valeur | Usage |
|-------|--------|-------|
| `--primary` | `#5CC8D8` (cyan) | liens, onglet actif, boutons secondaires |
| `--on-primary` | `#06223A` | texte posé SUR du cyan (le blanc y est illisible) |
| `--accent` | `#FF6B35` (corail) | boutons principaux, FAB |
| `--bg` | `#10264A` | opaque : fenêtres, champs de saisie |
| `--bg-raised` | navy 88 % | barre d'onglets, pastilles |
| `--surface` | blanc 14 % | cartes translucides posées sur la photo |
| `--text` / `--text-secondary` | `#EEF3FA` / `#B9C7DA` | |
| `--success` / `--error` | `#3DD97A` / `#E5484D` | |

### Fond
- `AppBackdrop` : `variant="home"` sur l'accueil (voile léger), `"page"` ailleurs (voile plus dense pour les listes)
- `html` a une couleur de fond, **`body` doit rester transparent** (sinon il masque la photo)
- Fenêtres modales (`.overlay`) : `z-index: 200` (au-dessus de la tab bar à 100)

### Icônes et émojis
- **Émojis uniquement pour les rayons** (icônes des `shopping_categories`) **et l'ingrédient** (🥕 du formulaire)
- Partout ailleurs : composant `Icon.svelte` (icônes au trait, `currentColor`)
- Recette sans photo : grande **initiale** du titre (pas d'émoji)

### Typographie

- **Display** : Outfit (titres, h1-h3)
- **Body** : DM Sans (texte, boutons, labels)
- **Hébergées avec le site** (`@fontsource-variable/outfit` et `dm-sans`, importées dans `main.ts`) : aucun appel à Google Fonts, marchent hors connexion. Noms CSS : `'Outfit Variable'`, `'DM Sans Variable'`

### Rayons (shopping_categories) avec icônes

🥬 Fruits & légumes · 🥩 Viandes & poissons · 🧀 Produits laitiers & œufs · 🍝 Épicerie salée · 🍪 Épicerie sucrée · 🌿 Condiments & épices · ❄️ Surgelés · 🥤 Boissons · 🧴 Hygiène & maison · 🛒 Autre

### Animations

- Changement de page : **View Transitions** (`router.svelte.ts`) — glisse vers la gauche quand on avance (onglet plus à droite, ouverture d'une fiche), vers la droite quand on recule. Seul `.app-shell` reçoit `view-transition-name: page`, et seulement pendant la navigation (`html[data-nav]`) : en permanence, il créerait un contexte d'empilement et la tab bar passerait au-dessus des fenêtres. Fond photo immobile (il ne doit PAS avoir de nom de transition, sinon il se dessine par-dessus la page). Repli : `page-in` (fondu + glissement) si l'API manque
- Tab bar : pastille qui glisse sous l'onglet actif + rebond de l'icône
- Courses : article coché qui sort en glissant (`fly` + `flip`) ; vibration courte via `src/lib/haptics.ts` (Android seulement, Safari iOS l'ignore)
- `check-pop` : animation checkbox
- `toast-in` : notifications glassmorphism
- `prefers-reduced-motion` respecté partout

## Structure des fichiers

```
src/
├── App.svelte                    # Shell : auth guard + routing
├── main.ts                       # Point d'entrée + SW registration
├── app.css                       # Design system complet (tokens « Mer », reset)
├── globals.d.ts                  # Constantes injectées au build (__APP_VERSION__, __APP_COMMIT__)
├── components/
│   ├── AppHeader.svelte          # Avatar → Mon compte (position absolute : part au défilement)
│   ├── AppBackdrop.svelte        # Fond de TOUTES les pages : photo de mer floutée (public/bg/, WebP 640/1280) + zoom lent + voile (variant home/page)
│   ├── Icon.svelte               # Icônes au trait (remplacent les émojis décoratifs)
│   ├── FloatingRecipeCard.svelte # Carte flottante de l'accueil (couches : position/parallaxe, drift x, drift y, rotation, carte)
│   ├── ConfirmDialog.svelte      # Fenêtre de confirmation centrée commune
│   ├── CookPicker.svelte         # « Qui cuisine ? » : membres du foyer + Personne
│   ├── StaplesDialog.svelte      # Achats habituels : ajouter à la liste / modifier
│   ├── PantryDialog.svelte       # Mon placard : ajout (autocomplétion), retrait, suggestions
│   ├── CookMode.svelte           # Mode « En cuisine » : une étape à la fois, balayage, écran maintenu allumé (Wake Lock)
│   ├── InviteDialog.svelte       # Créer un lien (rôle, « pour qui ») puis Copier / Partager ; jeton affiché une seule fois
│   ├── PlanRecipeDialog.svelte   # Fenêtre centrée 2 étapes : créneau (4 semaines, créneaux pris visibles) → ingrédients aux courses (mode 'plan' ou 'cart')
│   ├── TabBar.svelte             # Navigation bottom bar
│   └── ToastContainer.svelte     # Notifications toast
├── lib/
│   ├── supabase.ts               # Client Supabase (avec garde clé secrète)
│   ├── auth.svelte.ts            # Auth state + initAuth/signOut
│   ├── profile.svelte.ts         # Profile state + loadProfile
│   ├── router.svelte.ts          # Hash router
│   ├── toast.svelte.ts           # Store toast (success/error/info)
│   ├── types.ts                  # Interfaces TypeScript (miroir Supabase)
│   ├── random.ts                 # Hasard reproductible (graine = date) : pickSeeded
│   ├── floatLayout.ts            # Placement « en vrac » des cartes (fonction pure, tirage seedé, sans chevauchement)
│   ├── quantities.ts             # Quantités : addition, conversion g→kg / ml→cl→l, format français
│   ├── offline.ts                # Liste gardée sur le téléphone + cochages en attente
│   ├── haptics.ts                # tap() : vibration courte (Android)
│   ├── images.ts                 # sizedImage() : redimensionne les URL Unsplash pour le mobile
│   ├── version.ts                # APP_VERSION, APP_COMMIT, VERSION_LABEL (« v0.9.0 · a1b2c3d »)
│   └── api/
│       ├── recipes.ts            # CRUD recettes + recherche (index léger) + photos
│       ├── recipeImages.ts       # Photos : compression, envoi Storage, suppression
│       ├── meals.ts              # CRUD planning (plans + slots) + fetchSlotsForWeeks (lecture seule, sans créer de plan)
│       ├── household.ts          # Membres, cuisinier, habituels, placard, index des ingrédients, rankByFridge
│       ├── famille.ts            # Familles, invitations, admin, rejoindre, mot de passe oublié
│       └── shopping.ts           # Liste de courses (génération, toggle, panier)
├── pages/
│   ├── Login.svelte              # Connexion seule (pas d'inscription publique) + « Mot de passe oublié ? » + version
│   ├── Rejoindre.svelte          # Public : création de compte par lien (membre ; fondateur en 2 étapes : compte puis famille)
│   ├── MotDePasseOublie.svelte   # Public : e-mail de réinitialisation (même réponse que le compte existe ou non)
│   ├── NouveauMotDePasse.svelte  # Public : arrivée depuis l'e-mail (verifyOtp recovery) → nouveau mot de passe
│   ├── Famille.svelte            # Ma famille : membres, rôles, invitations ; fondateur : « Mes familles » (3 max)
│   ├── Admin.svelte              # Super-admin : liens fondateur, vue d'ensemble
│   ├── Accueil.svelte            # 5 recettes du jour qui flottent (tirage par date, change à minuit)
│   ├── Frigo.svelte              # « Qu'est-ce qu'on mange ? » : puces du frigo → recettes triées par ingrédients manquants
│   ├── Recettes.svelte           # Recherche (toute la base, sans accents) + puces catégories + grille
│   ├── RecetteDetail.svelte      # Fiche : grande photo, portions ajustables, ingrédients/étapes cochables, mode En cuisine, barre d'actions collée en bas
│   ├── RecetteForm.svelte        # Formulaire création/édition + photo ; Entrée = ingrédient suivant, monter/descendre, validation, confirmation avant de quitter (clics + popstate + beforeunload)
│   ├── Semaine.svelte            # Planning : cartes jour + tuiles Midi/Soir (téléphone), 2 col (tablette), 7 colonnes (≥ 1100 px)
│   ├── Courses.svelte            # Liste active : rayons, « Dans le chariot », temps réel, hors connexion, mise à jour sans perte
│   ├── Historique.svelte         # Listes terminées : cartes dépliables par rayon, suppression confirmée
│   └── MonCompte.svelte          # Profil + mot de passe + version de l'appli
public/
├── manifest.json                 # PWA manifest
├── bg/                           # Photos de mer (WebP 640/1280)
├── favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
pwa/
└── sw.js                         # Modèle du service worker (copié dans dist/ au build, marqueur de cache remplacé)
tests/
├── unit/                         # Calculs purs : quantités, liste recalculée, placard, frigo
└── rls/                          # Banc d'attaque RLS : migrations rejouées dans PGlite + attaques entre foyers
.github/
├── workflows/verifications.yml   # Secrets, audit npm, types, tests, build — sur chaque branche/PR et avant déploiement
├── workflows/deploy.yml          # main → vérifications → build → GitHub Pages
├── workflows/release.yml         # étiquette vX.Y.Z → vérifications → Release GitHub (notes du CHANGELOG)
├── workflows/security-check.yml  # vu de l'extérieur : un inconnu ne lit rien (après déploiement + lundi)
├── workflows/supabase-keepalive.yml
└── dependabot.yml                # mises à jour npm + actions chaque lundi
CHANGELOG.md                      # Journal des versions (règle SemVer)
```

## Contraintes de sécurité (OBLIGATOIRES)

- **Jamais de clé secrète** (`sb_secret_…` / service_role) ni de mot de passe base dans le dépôt, `.env.local` ou variables GitHub. Seule la clé **publishable** dans le frontend.
- **RLS activé** sur toutes les tables — ne jamais le désactiver
- **Ne pas lancer** `npm audit fix --force`
- **E-mail utilisateur** : donnée privée, ne pas partager en externe sans accord explicite
- Le fichier `src/lib/supabase.ts` contient un garde-fou qui refuse de démarrer si une clé secrète est détectée
- **CSP** (`index.html`) : scripts du site seulement ; connexions vers `*.supabase.co` et Unsplash seulement. **Toute nouvelle source externe** (API, images, fonction serveur sur un autre domaine, domaine personnalisé Supabase) **doit être ajoutée à la CSP**, sinon le navigateur la bloque
- Ne jamais réactiver de ressource tierce (Google Fonts, CDN…) sans raison : polices hébergées avec le site
- Actions GitHub **épinglées par SHA** (commentaire avec la version) ; permissions minimales par job

### Sécurité — ce qui est en place
- **Contrôle automatique** `.github/workflows/security-check.yml` : après chaque déploiement, chaque lundi et à la demande, vérifie avec la clé publique seule qu'un inconnu ne lit aucune table ni la liste des photos, et affiche les réglages Auth (inscriptions fermées, etc.). Lecture seule
- **Garde-fous clé secrète au build** (`vite.config.ts`) : refuse de construire si **n'importe quelle** variable `VITE_…` contient `sb_secret_…` ou un JWT `service_role`, puis scanne les fichiers produits dans `dist/` (celui de `supabase.ts` n'est qu'un filet : à l'exécution, la clé serait déjà publiée)
- **Vérifications CI** (`verifications.yml`) : aucun `.env` suivi, aucun secret dans le dépôt, `npm audit` (bloquant : moyenne+ en production, haute+ en outils), types, tests, build. Le déploiement en dépend
- **Droits côté appli = droits de la base** : Modifier = membre du foyer qui a créé la recette ; Supprimer recette / liste = admin de ce foyer. Une suppression filtrée par RLS (0 ligne, pas d'erreur) est signalée, jamais affichée comme réussie
- RLS : les règles portent sur des **lignes**, pas des colonnes → pour limiter des colonnes (ex. `role`, `family_id`), un trigger. Sur Supabase, `REVOKE … FROM PUBLIC` ne retire pas `anon` : viser `anon` explicitement
- **Banc d'attaque RLS dans le dépôt** (`tests/rls`, `npm run test:rls`) : stubs Supabase (rôles, `auth.uid()`, storage) + toutes les migrations rejouées dans PGlite + tentatives entre foyers et contrôles positifs. Lancé par la CI à chaque push. Au 14/11/2026 : **825 tentatives d'attaque (toutes bloquées), 182 contrôles positifs, 13 contrôles de structure** (foyers A, A2 dans la super-famille SA, B dans SB) ; un test de mutation (RLS retiré, règle ouverte) est bien détecté. Limites (SQL direct, pas PostgREST/Auth/Realtime) : voir `tests/rls/README.md`

## Variables d'environnement

Fichier `.env.local` (non commité) :
```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
```

## État d'avancement

### Terminé ✅
- Étape 0 : Scaffold (Svelte 5 + Vite + TS)
- Étape 1 : Schema Supabase (12 tables + RLS + seeds)
- Étape 2 : Auth (login/signup + profil)
- Étape 3 : Recettes (CRUD + catégories + images Unsplash)
- Étape 4 : Formulaire recette (ingrédients + étapes + autocomplétion 262 ingrédients)
- Étape 5 : Planning semaine (grille 7j × midi/soir + picker recettes)
- Étape 6 : Liste de courses (génération depuis planning + cochage + ajout manuel)
- Étape 7 : Historique des listes terminées
- Étape 8 : PWA + Realtime Supabase (sync cochage entre membres)
- Étape 9 : Polish (toasts, animations, micro-interactions)
- Bonus : « Ajouter à ma semaine » depuis une recette
- Bonus : « Ajouter au panier » avec sélection d'ingrédients et portions ajustables
- Refonte UI V1 ✅ : accueil flottant, fond « mer », icônes, Semaine, Courses, Recettes, Historique, fenêtre « semaine puis courses »
- V1 fiabilité ✅ : mise à jour de liste sans perte, hors connexion, planning en temps réel, recherche complète, quantités lisibles, photos
- Vie du foyer ✅ : qui cuisine, habituels, placard, « Qu'est-ce qu'on mange ? »
- Peaufinage ✅ : fiche recette + mode En cuisine, formulaire mobile, transitions de pages, Connexion et Mon compte (vider les données locales)

### Pièges connus
- `signIn()` ne doit PAS toucher `auth.loading` (réservé au chargement initial) : App.svelte remplacerait la page de connexion par le spinner et la saisie serait perdue
- Migration 7 (`seed_recipes`) : échoue sans au moins 1 compte et 1 foyer
- Service worker : chaque déploiement installe un nouveau SW qui recharge l'appli ouverte (pas pendant `nouvelle-recette` / `editer-recette` : rechargement différé à la sortie du formulaire). Enregistré seulement en build (`import.meta.env.PROD`)
- `regenerateList` supprime puis réinsère les articles du planning en deux requêtes : pas atomique (voir Risques)

### Risques connus (à traiter en 1.0.x)
- `regenerateList` non atomique : si l'insertion échoue après la suppression (réseau coupé), les articles du planning disparaissent jusqu'à la prochaine mise à jour (cochés perdus, ajouts à la main conservés). Deux membres qui mettent à jour en même temps peuvent créer des doublons. Piste : fonction Postgres (RPC) en une transaction
- Pas de limite de longueur sur les textes des recettes ; pas de sauvegarde automatique (offre gratuite) ; tâches planifiées GitHub désactivées après 60 jours sans commit sur un dépôt public

### Faiblesses connues relevées par le banc (13/11/2026)
- ✅ **`image_url`** (corrigé par la migration 15) : le motif acceptait le stockage de **n'importe quel** projet Supabase → pixel espion possible. Désormais : chemin dans notre bucket (fichier existant, dossier de la recette) ou Unsplash ; l'appli n'affiche jamais une autre origine (`recipeImageSrc`)
- `shopping_lists.meal_plan_id` : une liste peut être rattachée au planning d'un autre foyer (pas de lecture possible, mais incohérent)
- `created_by` / `checked_by` : un membre peut y mettre l'id de quelqu'un d'autre (usurpation de signature)
- Supprimer une recette efface les créneaux qui l'utilisent **dans tous les foyers** (`ON DELETE CASCADE`). Piste choisie par l'utilisateur : ne plus supprimer (modifier, archiver ou « demande de suppression ») — à décider
- Restent connues (banc du 14/11) : supprimer une recette **partagée** efface le créneau d'une autre famille (cascade, cf. archivage) ; `recipe_exists()` dit à un membre connecté si un id de recette existe (UUID impossible à deviner) ; photos orphelines listables/supprimables par tout membre ; ✅ corrigés dans la migration 17 : oracle anonyme `family_super_family`, `source_recipe_id` d'une recette illisible, limites (3 familles, 20 liens) protégées par verrou
- `sameProduct` : « Beurre de cacahuète » ≈ « Beurre », « Pain d'épices » ≈ « Pain » (placard / frigo)

### Recettes livrées avec l'appli
- Source : `supabase/recettes/*.json` (format et règles : `scripts/recettes/format.ts`) → `npm run recettes` génère la migration 16 ; `tests/unit/recettes.test.ts` refuse un JSON invalide ou une migration pas à jour
- 50 recettes au 13/11/2026 : 20 de démo corrigées + 30 nouvelles (18 plats, 4 entrées, 3 accompagnements, 5 desserts), rédigées pour l'appli (aucun texte copié), quantités vérifiées sur des références publiques (URL dans le champ `sources`, non enregistré en base)
- Unités au singulier comme `known_ingredients` (« pièce », « gousse »…), sel/poivre sans quantité, herbes fraîches en Fruits & légumes, bouillon en cubes
- ⚠️ Dépôt public : n'y mettre QUE des recettes sans droits (écrites pour l'appli, ou sous licence libre en citant la source). Les vraies recettes de la famille se saisissent dans l'appli, jamais dans le dépôt
- Les 30 nouvelles n'ont pas de photo (initiale affichée) ; les 20 de démo gardent leur photo Unsplash, à vérifier à l'œil

### Recettes de démo (historique)
- Les 20 recettes de la migration 7 ont été **générées par l'IA** (pas de source externe). Audit du 13/11/2026 : classiques globalement justes, mais temps sous-estimés (~12 recettes), corrections sur bourguignon, poulet rôti, crêpes, croque-monsieur, blanquette ; herbes fraîches à ranger en Fruits & légumes ; avertissement œufs crus (mousse) ; photos Unsplash à vérifier à l'œil

### Règles UI mobile-first (refonte)
- Animer uniquement `transform` / `opacity` (pas de `filter: blur` animé, trop coûteux sur téléphone)
- Effets `:hover` uniquement dans `@media (hover: hover) and (pointer: fine)`
- Parallaxe / effets au pointeur : souris uniquement (`pointerType === 'mouse'`)
- Hauteur d'écran en `svh` (stable quand la barre d'adresse se replie)
- Zones de tap ≥ 44 px, `touch-action: manipulation`
- `prefers-reduced-motion` respecté (règle globale dans `app.css`)
- Pas de `backdrop-filter` au-dessus de la photo animée (flou recalculé à chaque image) : fonds rgba suffisamment opaques

- Préparation V1 ✅ (v0.9.0) : version affichée, CHANGELOG, CI/CD (vérifications, release, Dependabot), tests unitaires + banc RLS dans le dépôt, CSP, polices hébergées, migration 14 (ingrédients)

### Restant ⬜
- Étape 10 : Déploiement prod → **v1.0.0**. **Guide à jour : `supabase/prod/README.md`** (SQL d'installation neuve en 3 fichiers : `npm run prod:sql`, testé par `tests/rls/installation.test.ts`). Résumé historique :
  1. Créer le projet Supabase `courses-prod` (même région que test)
  2. Auth : inscriptions fermées, confirmation e-mail, mot de passe ≥ 10 caractères (+ caractères variés), limites de tentatives, URL du site et redirections = adresse GitHub Pages
  3. Créer le compte super-admin et son foyer, puis exécuter toutes les migrations dans l'ordre (7 après le compte et le foyer)
  4. Requête de contrôle (tables, colonnes, triggers, RLS, publication Realtime, bucket photos)
  5. Variables GitHub `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` → valeurs de prod (clé publishable seulement)
  6. Passer la version à 1.0.0 + CHANGELOG, pousser sur main, vérifier le site, l'onglet Actions (déploiement + contrôle de sécurité), puis étiquette `v1.0.0`
  7. Garder `courses-test` pour développer (`.env.local`)

## Versionnement

- **SemVer** MAJEUR.MINEUR.CORRECTIF (règle détaillée en tête de `CHANGELOG.md`) : correctif = bug ; mineur = nouvelle fonction compatible ; majeur = casse l'existant (V2 familles multiples = 2.0.0)
- **Source unique** : `package.json` → injecté au build (`__APP_VERSION__` + commit court) → affiché dans Mon compte et sur la connexion (`src/lib/version.ts`)
- Chaque modification notable va dans `CHANGELOG.md`, section `[Non publié]`, avec les **migrations nécessaires**

### Sortir une version
1. Base(s) Supabase à jour et vérifiées pour les migrations listées
2. `npm version X.Y.Z --no-git-tag-version` (met à jour `package.json` et `package-lock.json`)
3. CHANGELOG : renommer `[Non publié]` en `[X.Y.Z] — AAAA-MM-JJ`, recréer un `[Non publié]` vide
4. `npm run check && npm test && npm run build` + captures mobiles (393×852)
5. Commit « Version X.Y.Z », push sur main (déploie), vérifier le site et l'onglet Actions
6. `git tag vX.Y.Z && git push origin vX.Y.Z` → `release.yml` crée la Release GitHub

## Intégration continue
- Branche de travail → pull request : `verifications.yml` tourne (secrets, audit, types, tests, build)
- Fusion sur `main` : vérifications puis déploiement ; rien n'est mis en ligne si une étape échoue
- Réglages GitHub recommandés : protection de `main` (vérifications obligatoires), secret scanning + push protection, e-mail privé (Settings → Emails)

### Supabase : réglages pour les invitations et le mot de passe oublié (par base)
1. Migration 17 exécutée
2. Fonction serveur `accepter-invitation` déployée, **Verify JWT désactivé** (voir `supabase/functions/README.md`)
3. Authentication → URL Configuration : **Site URL** = adresse de l'appli (`https://titouvgx.github.io/courses-famille/`), et la même dans les **Redirect URLs**
4. Authentication → Email Templates → **Reset Password** : lien `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery#/nouveau-mot-de-passe` (le routeur lit `type=recovery` avant le `#`)
5. E-mails intégrés de Supabase limités (≈ 2/heure pour tout le projet) : suffisant en famille, sinon SMTP (Resend…)

### V2 (décidé, PAS maintenant)
- ✅ **Fait le 14/11/2026 (migration 17)** — familles, super-familles, invitations, mot de passe oublié, visibilité des recettes (voir « Familles, super-familles, invitations »). Décision finale de l'utilisateur : une personne n'appartient qu'à UNE famille (pas de sélecteur) ; « partagée » = la super-famille ; seul l'admin d'une famille (ou le fondateur) invite
- ~~**Familles multiples + invitations en chaîne** (décisions du 13/11/2026)~~ (ancienne réflexion, gardée pour l'historique) :
  - Le super-admin envoie un lien → l'invité crée son compte puis est **obligé de créer au moins une famille (max 3, limite imposée par la base)** ; il en est admin
  - Cet admin invite des gens dans ses familles par lien (usage unique, expiration 7 j, jeton stocké chiffré, création de compte par fonction serveur Supabase — clé secrète côté Supabase uniquement)
  - **Ses invités ne peuvent PAS créer de famille** (pas de chaîne au-delà d'un niveau dans cette version)
  - Modèle : table d'adhésions (personne, famille, rôle par famille) à la place de `profiles.family_id` ; `is_family()` / `is_admin()` réécrites ; sélecteur de famille active dans l'en-tête ; tout le banc d'attaque à rejouer
  - **Recettes partagées seulement dans la famille et la « super-famille »** (à confirmer : l'ensemble des familles créées par un même admin) — plus de partage entre tous les utilisateurs
- **Mot de passe oublié** : `resetPasswordForEmail` de Supabase + page « nouveau mot de passe » (`updateUser`). Piège routeur `#` : faire pointer le lien de l'e-mail vers `?token_hash=…&type=recovery` (paramètre avant le `#`) traité par `verifyOtp`, ajouter l'URL aux redirections autorisées. E-mails intégrés limités (≈ 2/heure pour tout le projet) : suffisant en famille, Resend sinon
- Importer une recette depuis un lien (fonction serveur, sites autorisés seulement, sans la photo)

### Idées en attente (PAS sans feu vert explicite de l'utilisateur)
- **Booster des recettes du jour** (validé par l'utilisateur le 14/11, à faire après les invitations) : sur l'accueil, un booster à toucher qui se déchire, les 5 cartes en sortent une à une jusqu'à leur place actuelle (`floatLayout`) ; une seule ouverture par jour (localStorage), bouton « Passer », `prefers-reduced-motion` → cartes directement ; animer transform/opacity seulement
- Envoyer la liste de courses par message (WhatsApp, SMS) en un clic
- Recopier la semaine passée ou une semaine type dans le planning
- Favoris et notes par recette (étoiles + commentaire du foyer)
- Minuteurs dans le mode En cuisine (« 20 min » dans une étape = bouton minuteur)
- Notifications (« la liste a changé », « courses terminées »)
- Livre de recettes de famille exporté en PDF
- Figer la liste de la semaine (une recette modifiée ne change plus une liste en cours)
- Arrondir au supérieur ce qui se compte à la pièce (pas de « 1,5 œuf »)
- Nutri-Score (A à E) par recette et table nutritionnelle via Open Food Facts
- Parcours Playwright et sauvegardes automatiques de la base

### Décision produit
- L'appli **reste familiale** (pas de Play Store pour l'instant). Un plan de migration grand public existe dans les docs Claude de l'utilisateur : ne le ressortir que sur demande

## Commandes utiles

```bash
npm run dev      # Dev server (localhost:5173)
npm run build    # Build production → dist/
npm run preview  # Preview du build
npm run check    # Typecheck Svelte + TypeScript
npm test         # Tous les tests (unitaires + banc d'attaque RLS)
npm run test:unit
npm run test:rls
```
