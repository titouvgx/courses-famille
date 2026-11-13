# Courses en famille

Recettes partagées, planning des repas par foyer, liste de courses fusionnée et synchronisée en direct.

- Frontend : Svelte 5 + TypeScript + Vite, hébergé sur GitHub Pages
- Backend : Supabase (base PostgreSQL, authentification, temps réel)

## Démarrer en local

Prérequis : Node.js 22.12 ou plus récent (`node -v` pour vérifier).

```bash
npm install
cp .env.example .env.local   # puis remplis les 2 valeurs du projet Supabase « test »
npm run dev                  # ouvre l'adresse affichée (http://localhost:5173)
```

## Sécurité : règles à ne jamais enfreindre

- Seule la clé **publishable** (`sb_publishable_…`) va dans le frontend.
- La clé **secrète** (`sb_secret_…` / `service_role`) et le **mot de passe de la base** ne vont
  **jamais** dans ce dépôt, ni dans `.env.local`, ni dans les variables GitHub.
- Toute table a la RLS activée (étape 2).

## Vérifier avant de pousser

```bash
npm run check   # types
npm test        # calculs + banc d'attaque RLS (toutes les migrations rejouées en local)
npm run build   # refuse toute clé secrète
```

Les mêmes vérifications tournent automatiquement sur GitHub (`.github/workflows/verifications.yml`)
sur chaque branche et avant chaque déploiement.

## Versions

Numéro dans `package.json`, affiché dans l'appli (Mon compte, page de connexion).
Historique et règle de numérotation : [`CHANGELOG.md`](CHANGELOG.md).

## Déploiement

Automatique à chaque push sur `main`, après les vérifications (voir `.github/workflows/deploy.yml`).

Réglages GitHub à faire une fois :

1. Settings → Pages → Source : **GitHub Actions**.
2. Settings → Secrets and variables → Actions → onglet **Variables** :
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` (projet Supabase « prod »).

## Structure

```
src/
  App.svelte            coquille de l'appli + barre d'onglets
  app.css               jetons de design (couleurs, tailles)
  lib/router.svelte.ts  navigation par # (pas de 404 sur GitHub Pages)
  lib/supabase.ts       client Supabase (clé publique uniquement)
supabase/migrations/    structure de la base, versionnée (étape 2)
```
