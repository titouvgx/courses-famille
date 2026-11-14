# Historique du projet

> Détails sortis de CLAUDE.md le 14/11/2026 pour l'alléger. À lire seulement quand on touche à ce sujet.

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

### Faiblesses connues relevées par le banc (13/11/2026)
- ✅ **`image_url`** (corrigé par la migration 15) : le motif acceptait le stockage de **n'importe quel** projet Supabase → pixel espion possible. Désormais : chemin dans notre bucket (fichier existant, dossier de la recette) ou Unsplash ; l'appli n'affiche jamais une autre origine (`recipeImageSrc`)
- `shopping_lists.meal_plan_id` : une liste peut être rattachée au planning d'un autre foyer (pas de lecture possible, mais incohérent)
- `created_by` / `checked_by` : un membre peut y mettre l'id de quelqu'un d'autre (usurpation de signature)
- Supprimer une recette efface les créneaux qui l'utilisent **dans tous les foyers** (`ON DELETE CASCADE`). Piste choisie par l'utilisateur : ne plus supprimer (modifier, archiver ou « demande de suppression ») — à décider
- Restent connues (banc du 14/11) : supprimer une recette **partagée** efface le créneau d'une autre famille (cascade, cf. archivage) ; `recipe_exists()` dit à un membre connecté si un id de recette existe (UUID impossible à deviner) ; photos orphelines listables/supprimables par tout membre ; ✅ corrigés dans la migration 17 : oracle anonyme `family_super_family`, `source_recipe_id` d'une recette illisible, limites (3 familles, 20 liens) protégées par verrou
- `sameProduct` : « Beurre de cacahuète » ≈ « Beurre », « Pain d'épices » ≈ « Pain » (placard / frigo)

### Recettes de démo (historique)
- Les 20 recettes de la migration 7 ont été **générées par l'IA** (pas de source externe). Audit du 13/11/2026 : classiques globalement justes, mais temps sous-estimés (~12 recettes), corrections sur bourguignon, poulet rôti, crêpes, croque-monsieur, blanquette ; herbes fraîches à ranger en Fruits & légumes ; avertissement œufs crus (mousse) ; photos Unsplash à vérifier à l'œil

### Restant ⬜
- Étape 10 : Déploiement prod → **v1.0.0**. **Guide à jour : `supabase/prod/README.md`** (SQL d'installation neuve en 3 fichiers : `npm run prod:sql`, testé par `tests/rls/installation.test.ts`). Résumé historique :
  1. Créer le projet Supabase `courses-prod` (même région que test)
  2. Auth : inscriptions fermées, confirmation e-mail, mot de passe ≥ 10 caractères (+ caractères variés), limites de tentatives, URL du site et redirections = adresse GitHub Pages
  3. Créer le compte super-admin et son foyer, puis exécuter toutes les migrations dans l'ordre (7 après le compte et le foyer)
  4. Requête de contrôle (tables, colonnes, triggers, RLS, publication Realtime, bucket photos)
  5. Variables GitHub `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` → valeurs de prod (clé publishable seulement)
  6. Passer la version à 1.0.0 + CHANGELOG, pousser sur main, vérifier le site, l'onglet Actions (déploiement + contrôle de sécurité), puis étiquette `v1.0.0`
  7. Garder `courses-test` pour développer (`.env.local`)

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
