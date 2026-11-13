# Journal des versions

Toutes les évolutions notables de « Courses en famille ».
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
numérotation [SemVer](https://semver.org/lang/fr/) : **MAJEUR.MINEUR.CORRECTIF**.

## Règle de numérotation

| Changement | Exemple | Numéro |
|---|---|---|
| Correction de bug, texte, réglage visuel | une quantité mal arrondie | `1.0.0` → `1.0.1` |
| Nouvelle fonction qui ne casse rien | minuteurs en cuisine | `1.0.1` → `1.1.0` |
| Changement qui casse l'existant (modèle de données, droits) | familles multiples (V2) | `1.4.2` → `2.0.0` |

- **Source unique** : le champ `version` de `package.json`. Elle s'affiche dans l'appli
  (Mon compte et page de connexion) avec le commit court : `v1.0.0 · a1b2c3d`.
- Entre deux versions, chaque déploiement garde le même numéro ; le commit court les distingue.
- Chaque version indique les **migrations Supabase nécessaires**. À exécuter dans la base
  **avant** de pousser le code qui en dépend.
- Procédure de sortie : voir « Sortir une version » dans `CLAUDE.md`.

## [Non publié]

## [0.9.0] — 2026-11-13 — Candidate V1 (base `courses-test`)

Migrations nécessaires : **1 à 16** (`supabase/migrations/`, dans l'ordre).
⚠️ La migration 15 (`photo_paths`) s'exécute **juste après** le déploiement de cette version.

### Fonctions (V1)
- Connexion par e-mail et mot de passe (inscriptions fermées, comptes créés par le super-admin).
- Accueil : 5 recettes du jour qui flottent, tirage identique pour tous, renouvelé à minuit.
- Recettes partagées entre les foyers : recherche sans accents ni ordre des mots, filtres,
  photos (compressées, sans GPS), portions ajustables, mode « En cuisine ».
- Semaine : planning midi et soir, temps réel entre les membres du foyer, « Qui cuisine ? ».
- Courses : liste générée par rayon, temps réel, hors connexion, mise à jour sans perte,
  achats habituels, placard (« Sûrement déjà à la maison », « Il en manque »).
- « Qu'est-ce qu'on mange ? » : recettes classées selon ce qu'il y a dans le frigo.
- Historique des listes terminées. Mon compte. Appli installable (PWA).

### Ajouté (préparation de la V1)
- Numéro de version affiché dans l'appli, journal des versions (ce fichier).
- Migration 14 : environ 200 ingrédients de plus pour l'autocomplétion (rayon rempli automatiquement).
- Tests automatiques dans le dépôt : calculs de quantités et banc d'attaque RLS entre foyers
  (rejoue toutes les migrations dans une base PostgreSQL locale).
- Vérification automatique de chaque proposition de modification (types, tests, build, secrets).

### Recettes
- Les 20 recettes de démo corrigées : temps réalistes (repos et marinade indiqués à part),
  quantités (bourguignon, blanquette, gratin, hachis, lasagnes…), repère de cuisson du poulet
  (75 °C à cœur), avertissement œufs crus (mousse, carbonara), ingrédients manquants ajoutés,
  rayons et unités harmonisés. Une recette déjà modifiée dans l'appli n'est pas touchée.
- 30 nouvelles recettes familiales : pot-au-feu, chili, curry, couscous, risotto, pizza,
  moules, dahl, tomates farcies, taboulé, œufs mimosa, purée, riz pilaf, gâteau au yaourt,
  clafoutis, crumble, cookies…
- Recettes tenues dans `supabase/recettes/*.json`, migration générée et vérifiée par les tests.

### Sécurité
- **Faille corrigée (migration 15)** : une recette pouvait afficher une image hébergée sur le stockage
  de n'importe quel projet Supabase (« pixel espion »). Les photos sont désormais enregistrées par
  chemin dans notre stockage (le fichier doit exister) ; seule autre origine : Unsplash. L'appli
  n'affiche jamais une image d'une autre origine.
- Politique de sécurité du contenu (CSP) : seuls les scripts du site s'exécutent ; seuls
  Supabase et Unsplash peuvent être contactés.
- Polices hébergées avec le site : plus aucun appel à Google Fonts.
- Le build refuse toute clé secrète Supabase, dans n'importe quelle variable `VITE_…`
  et dans les fichiers produits.
- Actions GitHub épinglées par empreinte, permissions minimales, mises à jour surveillées (Dependabot).

### Modifié
- Service worker : nom de cache propre à chaque déploiement (l'ancien cache est effacé),
  pas de rechargement automatique pendant la saisie d'une recette, cache limité au site,
  à Supabase (`*.supabase.co`) et à Unsplash.
