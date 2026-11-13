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

### Realtime

Pour que le temps réel fonctionne sur la liste de courses :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE shopping_list_items;
```

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

- `page-in` : fondu + glissement sur toutes les pages
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
│   ├── AppHeader.svelte          # Header avec titre
│   ├── AppBackdrop.svelte        # Fond de TOUTES les pages : photo de mer floutée (public/bg/, WebP 640/1280) + zoom lent + voile (variant home/page)
│   ├── Icon.svelte               # Icônes au trait (remplacent les émojis décoratifs)
│   ├── FloatingRecipeCard.svelte # Carte flottante de l'accueil (couches : position/parallaxe, drift x, drift y, rotation, carte)
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
│   ├── images.ts                 # sizedImage() : redimensionne les URL Unsplash pour le mobile
│   └── api/
│       ├── recipes.ts            # CRUD recettes
│       ├── meals.ts              # CRUD planning (plans + slots)
│       └── shopping.ts           # Liste de courses (génération, toggle, panier)
├── pages/
│   ├── Login.svelte              # Connexion / inscription
│   ├── Accueil.svelte            # 5 recettes du jour qui flottent (tirage par date, change à minuit)
│   ├── Recettes.svelte           # Liste des recettes (paginée)
│   ├── RecetteDetail.svelte      # Détail recette + ajout semaine/panier
│   ├── RecetteForm.svelte        # Formulaire création/édition
│   ├── Semaine.svelte            # Planning : cartes jour + tuiles Midi/Soir (téléphone), 2 col (tablette), 7 colonnes (≥ 1100 px)
│   ├── Courses.svelte            # Liste de courses active (realtime)
│   ├── Historique.svelte         # Listes terminées
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
- Refonte UI (en cours) : accueil flottant ✅, fond « mer » sur toutes les pages ✅, émojis décoratifs → icônes ✅, page Semaine ✅ — autres pages à affiner

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
