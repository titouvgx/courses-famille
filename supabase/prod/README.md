# Mise en production — `courses-prod` (v1.0.0)

Procédure pas à pas. Compter environ 45 minutes. Chaque étape se vérifie avant de passer à la suivante.
**Prérequis** : la version a été testée sur le site de test (invitation, création de compte, recette
privée / partagée, photo, mot de passe oublié) et toutes les vérifications GitHub sont vertes.

## 1. Créer le projet Supabase
1. supabase.com → **New project** → nom `courses-prod`, même région que `courses-test`, mot de passe
   de base généré et rangé dans ton gestionnaire de mots de passe (il ne sert jamais dans l'appli).
2. **Settings → API Keys** : note l'adresse du projet (`https://xxxx.supabase.co`) et la **clé
   publishable** (`sb_publishable_…`). La clé secrète ne sort jamais de Supabase.

## 2. Réglages d'authentification (Authentication)
- **Sign In / Providers → Email** : « Allow new users to sign up » **désactivé** ; « Confirm email » activé.
- **Mot de passe** : longueur minimale **10** ; exiger lettres et chiffres si l'option est proposée.
- **Rate limits** : laisser les valeurs par défaut (ou plus strictes).
- **URL Configuration** : **Site URL** = `https://titouvgx.github.io/courses-famille/` ; ajouter la même adresse dans **Redirect URLs**.
- **Email Templates → Reset Password** : remplacer le lien par
  `{{ .SiteURL }}?token_hash={{ .TokenHash }}&type=recovery#/nouveau-mot-de-passe`

## 3. Ton compte
**Authentication → Users → Add user** : ton e-mail + un mot de passe (10 caractères minimum),
« Auto Confirm User » coché.

## 4. La base (SQL Editor)
Dans le dépôt : `npm run prod:sql` (ou demande à Claude les 3 fichiers). Puis, dans l'ordre, une
requête par fichier, **Run** :
1. `1-structure.sql`
2. `2-ton-compte.sql` — remplace d'abord ton e-mail, ton prénom et le nom de ta famille en haut
3. `3-suite.sql`

Contrôle (doit afficher 1, 1, 50, 0) :
```sql
select
  (select count(*) from public.super_families)                              as super_familles,
  (select count(*) from public.super_admins)                                as super_admins,
  (select count(*) from public.recipes where visibility = 'catalogue')      as catalogue,
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) as tables_sans_rls;
```

## 5. La fonction serveur
**Edge Functions → Deploy a new function → Via Editor**, nom `accepter-invitation`, coller
`supabase/functions/accepter-invitation/index.ts`, **Deploy**, puis désactiver **Verify JWT**
(voir `supabase/functions/README.md`).

## 6. Brancher le site sur la prod
GitHub → dépôt → **Settings → Secrets and variables → Actions → Variables** :
`VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` = valeurs de `courses-prod` (étape 1).
⚠️ Variables, pas secrets ; jamais la clé secrète.

## 7. Version 1.0.0 (Claude s'en charge)
`package.json` → 1.0.0, CHANGELOG, fusion sur main (déploiement), vérification du site et de
l'onglet Actions (déploiement + contrôle de sécurité), étiquette `v1.0.0` → Release GitHub.

## 8. Premier essai en prod
Connexion avec ton compte → Mon compte → Ma famille → inviter un membre de test (fenêtre privée) →
création du compte → le membre apparaît. Supprimer ensuite ce compte de test
(Authentication → Users).

## À savoir
- **Plus de site de test hébergé** : GitHub Pages ne sert qu'un site par dépôt. Après l'étape 6,
  l'adresse publique utilise la prod ; `courses-test` reste disponible pour développer et pour le
  banc d'attaque, mais il se mettra en pause après 7 jours sans activité (le réveil automatique vise
  désormais la prod). On peut le réactiver d'un clic dans Supabase, ou plus tard ouvrir un site de
  test séparé (Cloudflare Pages par exemple).
- **Sauvegardes** : l'offre gratuite n'en fait pas. Prévoir un export régulier (Database → Backups
  n'est disponible qu'en payant ; à défaut, export SQL manuel).
- **E-mails** : environ 2 e-mails d'authentification par heure pour tout le projet (mot de passe
  oublié). Suffisant en famille ; sinon brancher un SMTP (Resend…).
