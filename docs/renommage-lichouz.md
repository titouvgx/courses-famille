# Renommage « Courses en famille » → « Lichouz »

(Nom choisi le 14/11/2026 ; « Madéo » envisagé d'abord, jamais mis en ligne.)

Décidé le 14/11/2026, **avant** la mise en prod (après, toute la famille aurait dû réinstaller).

## Ce qui change
- Nom affiché partout (onglet, écran d'accueil du téléphone, écrans de connexion, invitation,
  « Mon compte », partage d'un lien) : **Lichouz**. Nom technique (dépôt, paquet) : **lichouz**.
- Adresse du site : `https://titouvgx.github.io/courses-famille/` → **`https://titouvgx.github.io/lichouz/`**
  (GitHub Pages ne redirige PAS l'ancienne adresse).

## Ce qui ne change pas (exprès)
- L'origine `https://titouvgx.github.io` : la fonction `accepter-invitation` et la CSP restent bonnes.
- Le cache des photos (`courses-images-v1`) et la graine des « recettes du jour » : les changer
  ferait seulement retélécharger les photos / changer les suggestions.
- Les anciennes migrations (jamais modifiées après coup).
- L'onglet « Courses » (c'est la fonction, pas le nom de l'appli).

## Étapes (dans l'ordre)
1. Pousser le code renommé sur `main`.
2. GitHub → dépôt → **Settings → General → Repository name** : `lichouz` → **Rename**.
   Les anciens liens du dépôt et `git push` sont redirigés par GitHub ; le site, lui, change d'adresse.
3. Vérifier le site sur `https://titouvgx.github.io/lichouz/` (Actions vertes, page qui s'ouvre).
4. Supabase (`courses-test`, puis `courses-prod` dès sa création) → **Authentication → URL
   Configuration** : **Site URL** = `https://titouvgx.github.io/lichouz/` ; **Redirect URLs** :
   remplacer l'ancienne adresse par la nouvelle.
5. Sur chaque téléphone : supprimer l'ancienne appli de l'écran d'accueil, ouvrir la nouvelle
   adresse, se reconnecter, « Ajouter à l'écran d'accueil ».
6. Les liens d'invitation créés avant le renommage pointent vers l'ancienne adresse : les annuler
   et en recréer.
7. Facultatif : renommer les projets Supabase (`lichouz-test`, `lichouz-prod`) — affichage seulement,
   l'adresse technique de la base ne change pas.
