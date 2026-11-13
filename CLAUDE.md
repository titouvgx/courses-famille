# Courses en famille — Contexte projet

## Présentation

PWA de gestion de courses en famille. Permet de créer des recettes, planifier les repas de la semaine, et générer automatiquement une liste de courses partagée en temps réel entre les membres d'un foyer.

**URL prod** : https://titouvgx.github.io/courses-famille/
**Repo** : https://github.com/titouvgx/courses-famille (public)

## Stack technique

- **Frontend** : Svelte 5 (runes) + TypeScript + Vite 8
- **Backend** : Supabase (PostgreSQL + Auth + Realtime)
- **Hébergement** : GitHub Pages (SPA avec hash router `#/route`)
- **PWA** : manifest.json + service worker (stale-while-revalidate)
- **Pas de SSR** — tout est client-side

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
- `semaine`, `courses`, `historique`, `compte`

Tab bar : Accueil | Recettes | Semaine | Courses | Historique

## Architecture Supabase

### Deux projets

- **courses-test** : développement actif
- **courses-prod** : production (pas encore branché, étape 10)

### Modèle de données (12 tables)

```
families, profiles, recipe_categories, shopping_categories,
recipes, recipe_ingredients, recipe_steps,
meal_plans, meal_slots,
shopping_lists, shopping_list_items,
known_ingredients (autocomplétion)
```

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
7. `seed_recipes.sql` — 20 recettes de démo
8. `shared_recipes.sql` — partage entre foyers
9. `recipe_images.sql` — images Unsplash
10. `realtime_publication.sql` — temps réel sur `shopping_list_items` ET `meal_slots` (idempotent)
11. `recipe_photos_storage.sql` — bucket public `recipe-photos` + politiques RLS Storage (idempotent)
12. `security_fixes.sql` — audit du 13/11/2026 : rôle et foyer verrouillés dans `profiles` (trigger `guard_profile_update`), admin limité à son foyer, `recipe_exists` fermé aux anonymes, `image_url` limitée au stockage Supabase / Unsplash (idempotent)

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
- Chargées via Google Fonts dans `index.html`

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
├── app.css                       # Design system complet (tokens, dark mode, reset)
├── components/
│   ├── AppHeader.svelte          # Avatar → Mon compte (position absolute : part au défilement)
│   ├── AppBackdrop.svelte        # Fond de TOUTES les pages : photo de mer floutée (public/bg/, WebP 640/1280) + zoom lent + voile (variant home/page)
│   ├── Icon.svelte               # Icônes au trait (remplacent les émojis décoratifs)
│   ├── FloatingRecipeCard.svelte # Carte flottante de l'accueil (couches : position/parallaxe, drift x, drift y, rotation, carte)
│   ├── ConfirmDialog.svelte      # Fenêtre de confirmation centrée commune
│   ├── CookMode.svelte           # Mode « En cuisine » : une étape à la fois, balayage, écran maintenu allumé (Wake Lock)
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
│   └── api/
│       ├── recipes.ts            # CRUD recettes + recherche (index léger) + photos
│       ├── recipeImages.ts       # Photos : compression, envoi Storage, suppression
│       ├── meals.ts              # CRUD planning (plans + slots) + fetchSlotsForWeeks (lecture seule, sans créer de plan)
│       └── shopping.ts           # Liste de courses (génération, toggle, panier)
├── pages/
│   ├── Login.svelte              # Connexion / inscription
│   ├── Accueil.svelte            # 5 recettes du jour qui flottent (tirage par date, change à minuit)
│   ├── Recettes.svelte           # Recherche (toute la base, sans accents) + puces catégories + grille
│   ├── RecetteDetail.svelte      # Fiche : grande photo, portions ajustables, ingrédients/étapes cochables, mode En cuisine, barre d'actions collée en bas
│   ├── RecetteForm.svelte        # Formulaire création/édition + photo ; Entrée = ingrédient suivant, monter/descendre, validation, confirmation avant de quitter (clics + popstate + beforeunload)
│   ├── Semaine.svelte            # Planning : cartes jour + tuiles Midi/Soir (téléphone), 2 col (tablette), 7 colonnes (≥ 1100 px)
│   ├── Courses.svelte            # Liste active : rayons, « Dans le chariot », temps réel, hors connexion, mise à jour sans perte
│   ├── Historique.svelte         # Listes terminées : cartes dépliables par rayon, suppression confirmée
│   └── MonCompte.svelte          # Profil + mot de passe
public/
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker
├── favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png
```

## Contraintes de sécurité (OBLIGATOIRES)

- **Jamais de clé secrète** (`sb_secret_…` / service_role) ni de mot de passe base dans le dépôt, `.env.local` ou variables GitHub. Seule la clé **publishable** dans le frontend.
- **RLS activé** sur toutes les tables — ne jamais le désactiver
- **Ne pas lancer** `npm audit fix --force`
- **E-mail utilisateur** : donnée privée, ne pas partager en externe sans accord explicite
- Le fichier `src/lib/supabase.ts` contient un garde-fou qui refuse de démarrer si une clé secrète est détectée

### Sécurité — ce qui est en place
- **Contrôle automatique** `.github/workflows/security-check.yml` : après chaque déploiement, chaque lundi et à la demande, vérifie avec la clé publique seule qu'un inconnu ne lit aucune table ni la liste des photos, et affiche les réglages Auth (inscriptions fermées, etc.). Lecture seule
- **Garde-fou clé secrète au build** (`vite.config.ts`) : refuse de construire si la clé est `sb_secret_…` ou un JWT `service_role` (celui de `supabase.ts` n'est qu'un filet : à l'exécution, la clé serait déjà publiée)
- **Droits côté appli = droits de la base** : Modifier = membre du foyer qui a créé la recette ; Supprimer recette / liste = admin de ce foyer. Une suppression filtrée par RLS (0 ligne, pas d'erreur) est signalée, jamais affichée comme réussie
- RLS : les règles portent sur des **lignes**, pas des colonnes → pour limiter des colonnes (ex. `role`, `family_id`), un trigger. Sur Supabase, `REVOKE … FROM PUBLIC` ne retire pas `anon` : viser `anon` explicitement
- Banc d'attaque local (hors dépôt pour l'instant) : migrations rejouées dans PGlite + 35 tentatives d'accès entre foyers

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
- Peaufinage ✅ : fiche recette + mode En cuisine, formulaire mobile, transitions de pages, Connexion et Mon compte (vider les données locales)

### Pièges connus
- `signIn()` ne doit PAS toucher `auth.loading` (réservé au chargement initial) : App.svelte remplacerait la page de connexion par le spinner et la saisie serait perdue

### Règles UI mobile-first (refonte)
- Animer uniquement `transform` / `opacity` (pas de `filter: blur` animé, trop coûteux sur téléphone)
- Effets `:hover` uniquement dans `@media (hover: hover) and (pointer: fine)`
- Parallaxe / effets au pointeur : souris uniquement (`pointerType === 'mouse'`)
- Hauteur d'écran en `svh` (stable quand la barre d'adresse se replie)
- Zones de tap ≥ 44 px, `touch-action: manipulation`
- `prefers-reduced-motion` respecté (règle globale dans `app.css`)
- Pas de `backdrop-filter` au-dessus de la photo animée (flou recalculé à chaque image) : fonds rgba suffisamment opaques

### Restant ⬜
- Étape 10 : Déploiement prod (brancher `courses-prod`, variables d'env, Realtime)

### Idées futures (PAS à implémenter maintenant)
- Nutri-Score (A à E) par recette
- Table nutritionnelle (calories, protéines, glucides, lipides) via Open Food Facts API

## Commandes utiles

```bash
npm run dev      # Dev server (localhost:5173)
npm run build    # Build production → dist/
npm run preview  # Preview du build
npm run check    # Typecheck Svelte + TypeScript
```
