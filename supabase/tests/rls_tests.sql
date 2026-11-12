-- ============================================================
-- Tests RLS — à exécuter sur le projet Supabase TEST
-- ============================================================
-- Prérequis : avoir exécuté les 4 migrations avant.
--
-- Ce script crée des données de test, puis vérifie les 6 règles
-- fondamentales de sécurité en simulant différents rôles.
--
-- ⚠️  Exécuter ce script avec le rôle service_role (SQL Editor
--     de Supabase) pour pouvoir créer les données initiales,
--     puis les requêtes de test simulent des utilisateurs.
-- ============================================================

-- ┌──────────────────────────────────────────────────────┐
-- │  SETUP : Création des données de test                │
-- └──────────────────────────────────────────────────────┘

-- On travaille dans une transaction pour pouvoir tout nettoyer
BEGIN;

-- Créer 2 familles de test
INSERT INTO families (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Famille Dupont'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Famille Martin');

-- Créer 3 users de test dans auth.users
-- (En prod, Supabase Auth gère ça. Ici on simule.)
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, role, aud, created_at, updated_at)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'alice@test.local', crypt('test1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@test.local',   crypt('test1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'carol@test.local', crypt('test1234', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', 'authenticated', 'authenticated', now(), now());

-- Alice = admin Famille Dupont
INSERT INTO profiles (id, family_id, display_name, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 'admin');

-- Bob = member Famille Dupont
INSERT INTO profiles (id, family_id, display_name, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Bob', 'member');

-- Carol = admin Famille Martin (autre famille)
INSERT INTO profiles (id, family_id, display_name, role) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'Carol', 'admin');

-- Alice est super_admin
INSERT INTO super_admins (user_id) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001');

-- Recette dans Famille Dupont
INSERT INTO recipes (id, family_id, title, default_portions, created_by) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Poulet rôti test', 4, 'bbbbbbbb-0000-0000-0000-000000000001');

-- Recette dans Famille Martin
INSERT INTO recipes (id, family_id, title, default_portions, created_by) VALUES
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'Tarte Martin test', 6, 'bbbbbbbb-0000-0000-0000-000000000003');

-- Ingrédients pour la recette Dupont
INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, position) VALUES
  ('cccccccc-0000-0000-0000-000000000001', 'Poulet', 1, 'pièce', 0),
  ('cccccccc-0000-0000-0000-000000000001', 'Herbes', 2, 'c.à.c.', 1);

-- Plan de repas Famille Dupont
INSERT INTO meal_plans (id, family_id, week_start) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-09');

-- Slot
INSERT INTO meal_slots (meal_plan_id, day_of_week, meal_type, recipe_id, portions) VALUES
  ('dddddddd-0000-0000-0000-000000000001', 0, 'midi', 'cccccccc-0000-0000-0000-000000000001', 4);

-- Shopping list Famille Dupont
INSERT INTO shopping_lists (id, family_id, meal_plan_id, status) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 'active');

INSERT INTO shopping_list_items (shopping_list_id, name, quantity, checked, position) VALUES
  ('eeeeeeee-0000-0000-0000-000000000001', 'Poulet entier', '1.5 kg', false, 0);

COMMIT;

-- ┌──────────────────────────────────────────────────────┐
-- │  TEST 1 : Un membre voit les recettes de sa famille  │
-- └──────────────────────────────────────────────────────┘
-- Exécuter en tant que Bob (member Dupont)
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}';

-- Attendu : 1 recette (Poulet rôti test)
SELECT 'TEST 1 — Bob voit recettes Dupont' AS test,
  (SELECT count(*) FROM recipes) AS attendu_1,
  CASE WHEN (SELECT count(*) FROM recipes) = 1 THEN '✅ PASS' ELSE '❌ FAIL' END AS resultat;

-- ┌──────────────────────────────────────────────────────┐
-- │  TEST 2 : Isolation inter-familles                   │
-- └──────────────────────────────────────────────────────┘
-- En tant que Carol (Famille Martin)
-- Attendu : Carol ne voit PAS la recette de Dupont

-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000003"}';

SELECT 'TEST 2 — Carol ne voit PAS recettes Dupont' AS test,
  (SELECT count(*) FROM recipes WHERE family_id = 'aaaaaaaa-0000-0000-0000-000000000001') AS attendu_0,
  CASE WHEN (SELECT count(*) FROM recipes WHERE family_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS resultat;

-- ┌──────────────────────────────────────────────────────┐
-- │  TEST 3 : Un member peut créer une recette           │
-- └──────────────────────────────────────────────────────┘
-- En tant que Bob (member Dupont)
-- Attendu : INSERT réussit

SELECT 'TEST 3 — Bob peut INSERT recette dans sa famille' AS test,
  '(à tester manuellement via SET ROLE + INSERT)' AS note,
  'voir instructions ci-dessous' AS resultat;

-- ┌──────────────────────────────────────────────────────┐
-- │  TEST 4 : Un member ne peut PAS supprimer            │
-- └──────────────────────────────────────────────────────┘
-- En tant que Bob (member, pas admin)
-- Attendu : DELETE échoue (0 rows affected)

SELECT 'TEST 4 — Bob ne peut PAS DELETE recette (member only)' AS test,
  '(à tester manuellement via SET ROLE + DELETE)' AS note,
  'voir instructions ci-dessous' AS resultat;

-- ┌──────────────────────────────────────────────────────┐
-- │  TEST 5 : L admin peut supprimer                     │
-- └──────────────────────────────────────────────────────┘
-- En tant que Alice (admin Dupont)
-- Attendu : DELETE réussit

SELECT 'TEST 5 — Alice (admin) peut DELETE recette' AS test,
  '(à tester manuellement via SET ROLE + DELETE)' AS note,
  'voir instructions ci-dessous' AS resultat;

-- ┌──────────────────────────────────────────────────────┐
-- │  TEST 6 : Le super_admin voit toutes les familles    │
-- └──────────────────────────────────────────────────────┘
-- En tant que Alice (super_admin)
-- Attendu : 2 familles visibles

SELECT 'TEST 6 — Alice (super_admin) voit les 2 familles' AS test,
  (SELECT count(*) FROM families) AS attendu_2,
  CASE WHEN (SELECT count(*) FROM families) = 2 THEN '✅ PASS' ELSE '❌ FAIL' END AS resultat;


-- ┌──────────────────────────────────────────────────────┐
-- │  INSTRUCTIONS pour tests manuels (3, 4, 5)          │
-- └──────────────────────────────────────────────────────┘
--
-- Dans le SQL Editor de Supabase, pour simuler un utilisateur :
--
-- 1. Copier/coller ce bloc AVANT chaque requête de test :
--
--    SET LOCAL ROLE authenticated;
--    SET request.jwt.claims = '{"sub":"<user_id>"}';
--
--    Exemples :
--    - Bob :   SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002"}';
--    - Alice : SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000001"}';
--    - Carol : SET request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000003"}';
--
-- 2. Puis la requête :
--
--    TEST 3 (Bob INSERT) :
--      INSERT INTO recipes (family_id, title, default_portions, created_by)
--      VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'Recette de Bob', 2, 'bbbbbbbb-0000-0000-0000-000000000002');
--      -- Attendu : succès
--
--    TEST 4 (Bob DELETE) :
--      DELETE FROM recipes WHERE id = 'cccccccc-0000-0000-0000-000000000001';
--      -- Attendu : 0 rows (pas le droit, member only)
--
--    TEST 5 (Alice DELETE) :
--      DELETE FROM recipes WHERE title = 'Recette de Bob';
--      -- Attendu : 1 row supprimée (admin)
--
-- 3. Pour revenir au rôle service_role après les tests :
--    RESET ROLE;


-- ┌──────────────────────────────────────────────────────┐
-- │  CLEANUP (optionnel, à exécuter après les tests)     │
-- └──────────────────────────────────────────────────────┘
-- DELETE FROM shopping_list_items WHERE shopping_list_id = 'eeeeeeee-0000-0000-0000-000000000001';
-- DELETE FROM shopping_lists WHERE id = 'eeeeeeee-0000-0000-0000-000000000001';
-- DELETE FROM meal_slots WHERE meal_plan_id = 'dddddddd-0000-0000-0000-000000000001';
-- DELETE FROM meal_plans WHERE id = 'dddddddd-0000-0000-0000-000000000001';
-- DELETE FROM recipe_ingredients WHERE recipe_id = 'cccccccc-0000-0000-0000-000000000001';
-- DELETE FROM recipes WHERE id IN ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002');
-- DELETE FROM super_admins WHERE user_id = 'bbbbbbbb-0000-0000-0000-000000000001';
-- DELETE FROM profiles WHERE id IN ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003');
-- DELETE FROM auth.users WHERE id IN ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000003');
-- DELETE FROM families WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002');
