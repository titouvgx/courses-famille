# Architecture détaillée

> Détails sortis de CLAUDE.md le 14/11/2026 pour l'alléger. À lire seulement quand on touche à ce sujet.

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

### Concept clé : "familles" = foyers (⚠️ dépassé depuis la migration 17 : les recettes ne sont plus partagées entre tous, voir CLAUDE.md)

Tous les utilisateurs font partie d'une grande famille. Les "familles" dans l'app sont en réalité des **sous-familles (foyers)**. Les recettes sont **partagées entre tous les foyers** (RLS via `is_member()`), mais les meal plans et shopping lists sont **scopés par foyer** (RLS via `is_family(family_id)`).

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

### Sécurité — ce qui est en place
- **Contrôle automatique** `.github/workflows/security-check.yml` : après chaque déploiement, chaque lundi et à la demande, vérifie avec la clé publique seule qu'un inconnu ne lit aucune table ni la liste des photos, et affiche les réglages Auth (inscriptions fermées, etc.). Lecture seule
- **Garde-fous clé secrète au build** (`vite.config.ts`) : refuse de construire si **n'importe quelle** variable `VITE_…` contient `sb_secret_…` ou un JWT `service_role`, puis scanne les fichiers produits dans `dist/` (celui de `supabase.ts` n'est qu'un filet : à l'exécution, la clé serait déjà publiée)
- **Vérifications CI** (`verifications.yml`) : aucun `.env` suivi, aucun secret dans le dépôt, `npm audit` (bloquant : moyenne+ en production, haute+ en outils), types, tests, build. Le déploiement en dépend
- **Droits côté appli = droits de la base** : Modifier = membre du foyer qui a créé la recette ; Supprimer recette / liste = admin de ce foyer. Une suppression filtrée par RLS (0 ligne, pas d'erreur) est signalée, jamais affichée comme réussie
- RLS : les règles portent sur des **lignes**, pas des colonnes → pour limiter des colonnes (ex. `role`, `family_id`), un trigger. Sur Supabase, `REVOKE … FROM PUBLIC` ne retire pas `anon` : viser `anon` explicitement
- **Banc d'attaque RLS dans le dépôt** (`tests/rls`, `npm run test:rls`) : stubs Supabase (rôles, `auth.uid()`, storage) + toutes les migrations rejouées dans PGlite + tentatives entre foyers et contrôles positifs. Lancé par la CI à chaque push. Au 14/11/2026 : **825 tentatives d'attaque (toutes bloquées), 182 contrôles positifs, 13 contrôles de structure** (foyers A, A2 dans la super-famille SA, B dans SB) ; un test de mutation (RLS retiré, règle ouverte) est bien détecté. Limites (SQL direct, pas PostgREST/Auth/Realtime) : voir `tests/rls/README.md`

### Recettes livrées avec l'appli
- Source : `supabase/recettes/*.json` (format et règles : `scripts/recettes/format.ts`) → `npm run recettes` génère la migration 16 ; `tests/unit/recettes.test.ts` refuse un JSON invalide ou une migration pas à jour
- 50 recettes au 13/11/2026 : 20 de démo corrigées + 30 nouvelles (18 plats, 4 entrées, 3 accompagnements, 5 desserts), rédigées pour l'appli (aucun texte copié), quantités vérifiées sur des références publiques (URL dans le champ `sources`, non enregistré en base)
- Unités au singulier comme `known_ingredients` (« pièce », « gousse »…), sel/poivre sans quantité, herbes fraîches en Fruits & légumes, bouillon en cubes
- ⚠️ Dépôt public : n'y mettre QUE des recettes sans droits (écrites pour l'appli, ou sous licence libre en citant la source). Les vraies recettes de la famille se saisissent dans l'appli, jamais dans le dépôt
- Photos : `supabase/recettes/photos.json` → migration 18. 49 photos Unsplash gratuites vérifiées à l'œil le 14/11/2026 (9 photos de démo fausses remplacées) ; Endives au jambon sans photo (initiale). 15 photos « approchantes » listées dans les notes du JSON
