# Design System « Mer » et règles UI mobile

> Détails sortis de CLAUDE.md le 14/11/2026 pour l'alléger. À lire seulement quand on touche à ce sujet.

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

### Règles UI mobile-first (refonte)
- Animer uniquement `transform` / `opacity` (pas de `filter: blur` animé, trop coûteux sur téléphone)
- Effets `:hover` uniquement dans `@media (hover: hover) and (pointer: fine)`
- Parallaxe / effets au pointeur : souris uniquement (`pointerType === 'mouse'`)
- Hauteur d'écran en `svh` (stable quand la barre d'adresse se replie)
- Zones de tap ≥ 44 px, `touch-action: manipulation`
- `prefers-reduced-motion` respecté (règle globale dans `app.css`)
- Pas de `backdrop-filter` au-dessus de la photo animée (flou recalculé à chaque image) : fonds rgba suffisamment opaques

- Préparation V1 ✅ (v0.9.0) : version affichée, CHANGELOG, CI/CD (vérifications, release, Dependabot), tests unitaires + banc RLS dans le dépôt, CSP, polices hébergées, migration 14 (ingrédients)
