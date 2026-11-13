-- ============================================================
-- Migration : recettes livrées avec l'appli — v1
-- ============================================================
-- FICHIER GÉNÉRÉ par scripts/recettes/generer.ts à partir de
-- supabase/recettes/*.json — NE PAS MODIFIER À LA MAIN (npm run recettes).
--
-- • 20 recettes de démo corrigées (temps réalistes, quantités, rayons,
--   précautions sanitaires). Une recette n'est corrigée que si elle est encore
--   EXACTEMENT dans son état d'origine (empreinte) : si la famille l'a modifiée
--   dans l'appli, elle n'est pas touchée (message NOTICE).
-- • 30 nouvelles recettes, ajoutées seulement si aucune recette ne porte
--   déjà le même titre. Rattachées au foyer et au compte des recettes de démo
--   (sinon : premier foyer, premier compte).
-- Recettes rédigées pour l'appli (pas de texte copié) ; quantités vérifiées
-- sur des références publiques (liste dans supabase/recettes/*.json).
--
-- Idempotente : relancée, elle ne change plus rien.
-- ============================================================

DO $$
DECLARE
  v_family  uuid;
  v_user    uuid;
  v_rid     uuid;
  v_fixed   integer := 0;
  v_skipped integer := 0;
  v_added   integer := 0;
BEGIN
  SELECT family_id, created_by INTO v_family, v_user
    FROM public.recipes WHERE title = 'Bœuf bourguignon' ORDER BY created_at LIMIT 1;
  IF v_family IS NULL THEN
    SELECT id INTO v_family FROM public.families ORDER BY created_at LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;
  IF v_family IS NULL THEN
    RAISE EXCEPTION 'recettes : il faut au moins 1 foyer avant cette migration';
  END IF;

  -- ── Correction : Bœuf bourguignon ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Bœuf bourguignon' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '1a954d790aee87827045c2f057b32473'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Bœuf bourguignon';
  ELSE
    UPDATE public.recipes
       SET title = 'Bœuf bourguignon', prep_time_min = 240, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Bœuf à braiser', 1.5, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Vin rouge', 75, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Boissons'), 1),
    (v_rid, 'Carotte', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Oignon', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Lardons fumés', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 4),
    (v_rid, 'Champignon de Paris', 300, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Concentré de tomate', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 6),
    (v_rid, 'Bouquet garni', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Farine', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 8),
    (v_rid, 'Beurre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 9),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 11),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 13);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper la viande en cubes de 5 cm environ. Éplucher les carottes et les couper en rondelles épaisses ; éplucher et émincer les oignons.'),
    (v_rid, 1, 'Réunir la viande, les carottes, les oignons et le bouquet garni dans un grand saladier, puis couvrir avec le vin rouge. Filmer et laisser mariner au réfrigérateur au moins 2 h, idéalement une nuit.'),
    (v_rid, 2, 'Égoutter le tout dans une passoire posée sur un saladier pour garder la marinade. Mettre de côté le bouquet garni et les légumes, puis sécher soigneusement la viande avec du papier absorbant.'),
    (v_rid, 3, 'Faire dorer les lardons à sec 5 min dans une cocotte à feu moyen, puis les retirer avec une écumoire et les réserver.'),
    (v_rid, 4, 'Ajouter l''huile d''olive dans la cocotte et faire colorer la viande sur toutes ses faces à feu vif, en trois fois pour ne pas la serrer (environ 5 min par fournée).'),
    (v_rid, 5, 'Remettre toute la viande dans la cocotte, la saupoudrer de farine et remuer 2 min pour que la farine colore légèrement.'),
    (v_rid, 6, 'Ajouter le concentré de tomate, l''ail pelé et écrasé, les carottes et les oignons égouttés ainsi que les lardons, puis mélanger 1 min.'),
    (v_rid, 7, 'Verser la marinade en grattant le fond de la cocotte, porter à ébullition, puis remettre le bouquet garni égoutté. Saler légèrement (les lardons sont salés) et poivrer.'),
    (v_rid, 8, 'Couvrir et laisser mijoter à feu très doux 2 h 30 à 3 h, en remuant de temps en temps, jusqu''à ce que la viande se défasse à la fourchette. Ajouter un peu d''eau si la sauce réduit trop.'),
    (v_rid, 9, 'Environ 45 min avant la fin, nettoyer les champignons, les couper en quartiers et les faire sauter 8 min dans le beurre à feu vif.'),
    (v_rid, 10, 'Ajouter les champignons dans la cocotte 30 min avant la fin de la cuisson.'),
    (v_rid, 11, 'Retirer le bouquet garni, rectifier l''assaisonnement et servir bien chaud.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Poulet rôti ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Poulet rôti' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'ec3694bca8448418f8da9be5abe03c2a'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Poulet rôti';
  ELSE
    UPDATE public.recipes
       SET title = 'Poulet rôti', prep_time_min = 105, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Poulet entier', 1.5, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Beurre', 50, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Citron', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Ail', 4, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Thym frais', 4, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Romarin frais', 2, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Pomme de terre', 800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Huile d''olive', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Sortir le poulet et le beurre du réfrigérateur 30 min avant la cuisson. Préchauffer le four à 200 °C.'),
    (v_rid, 1, 'Écraser le beurre ramolli à la fourchette avec du sel, du poivre et les feuilles de 2 branches de thym.'),
    (v_rid, 2, 'Couper le citron en deux et peler 2 gousses d''ail. Glisser à l''intérieur du poulet un demi-citron, ces 2 gousses et les 2 autres branches de thym.'),
    (v_rid, 3, 'Enduire toute la peau du poulet de beurre aromatisé et le poser au centre d''un grand plat allant au four.'),
    (v_rid, 4, 'Éplucher les pommes de terre, les couper en quartiers et les disposer autour du poulet avec les 2 gousses d''ail restantes non pelées et le romarin. Arroser d''huile d''olive et du jus du demi-citron restant, saler et poivrer.'),
    (v_rid, 5, 'Enfourner pour 1 h à 1 h 15 en arrosant le poulet de son jus toutes les 20 min et en retournant les pommes de terre à mi-cuisson.'),
    (v_rid, 6, 'Vérifier la cuisson : le thermomètre planté dans la partie la plus épaisse de la cuisse, sans toucher l''os, doit indiquer 75 °C à cœur ; à défaut, le jus qui s''écoule de la cuisse piquée doit être clair, sans trace rosée. Sinon, prolonger la cuisson par tranches de 10 min.'),
    (v_rid, 7, 'Laisser reposer le poulet 10 min hors du four, couvert, avant de le découper. Servir avec les pommes de terre et le jus du plat.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Quiche lorraine ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Quiche lorraine' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '854d3f0cf2a75a408b8c27f8263846ef'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Quiche lorraine';
  ELSE
    UPDATE public.recipes
       SET title = 'Quiche lorraine', prep_time_min = 50, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pâte brisée', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Lardons fumés', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Œuf', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Crème fraîche épaisse', 20, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Lait', 10, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Gruyère râpé', 80, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180 °C.'),
    (v_rid, 1, 'Dérouler la pâte brisée dans un moule à tarte de 26 à 28 cm et en piquer le fond à la fourchette.'),
    (v_rid, 2, 'Faire dorer les lardons à sec 5 min dans une poêle à feu moyen, puis les répartir sur le fond de tarte.'),
    (v_rid, 3, 'Battre au fouet les œufs avec la crème, le lait, la muscade et le poivre. Saler très peu, les lardons étant déjà salés.'),
    (v_rid, 4, 'Verser cette préparation sur les lardons, puis parsemer de gruyère râpé.'),
    (v_rid, 5, 'Enfourner 30 à 35 min, jusqu''à ce que la quiche soit gonflée et bien dorée et que la lame d''un couteau plantée au centre ressorte propre.'),
    (v_rid, 6, 'Laisser tiédir 5 min avant de démouler et de servir.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Pâte à crêpes ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Pâte à crêpes' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'bc71b403d0a564859bac396473df798a'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Pâte à crêpes';
  ELSE
    UPDATE public.recipes
       SET title = 'Pâte à crêpes', prep_time_min = 60, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Dessert')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Farine', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Œuf', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Lait', 50, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Beurre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Sucre vanillé', 1, 'sachet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 4),
    (v_rid, 'Sel', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Faire fondre 30 g de beurre et le laisser tiédir ; garder le reste du beurre pour graisser la poêle.'),
    (v_rid, 1, 'Verser la farine et le sel dans un grand saladier, puis creuser un puits au centre.'),
    (v_rid, 2, 'Casser les œufs dans le puits et ajouter le sucre vanillé (l''omettre pour des crêpes salées). Fouetter en ramenant peu à peu la farine vers le centre.'),
    (v_rid, 3, 'Verser le lait petit à petit sans cesser de fouetter, pour obtenir une pâte lisse et sans grumeaux.'),
    (v_rid, 4, 'Incorporer le beurre fondu tiède.'),
    (v_rid, 5, 'Couvrir et laisser reposer la pâte 30 min à 1 h au réfrigérateur, puis la remuer avant de commencer la cuisson.'),
    (v_rid, 6, 'Chauffer une poêle à crêpes à feu moyen-vif et la graisser légèrement avec un peu du beurre réservé, étalé au papier absorbant.'),
    (v_rid, 7, 'Verser une petite louche de pâte et incliner aussitôt la poêle pour la répartir en couche fine.'),
    (v_rid, 8, 'Cuire 1 à 2 min, jusqu''à ce que les bords se décollent et que le dessous soit doré, puis retourner la crêpe et la cuire encore 1 min. Regraisser la poêle toutes les 2 ou 3 crêpes.'),
    (v_rid, 9, 'Empiler les crêpes sur une assiette au fur et à mesure et les garnir au choix, en version sucrée ou salée.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Gratin dauphinois ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Gratin dauphinois' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '04045aa1cfb2880f0f6470feb6fe80c4'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Gratin dauphinois';
  ELSE
    UPDATE public.recipes
       SET title = 'Gratin dauphinois', prep_time_min = 85, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Accompagnement')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pomme de terre', 1.2, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Crème liquide', 40, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Lait', 40, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Beurre', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 160 °C.'),
    (v_rid, 1, 'Éplucher les pommes de terre (de préférence une variété farineuse, type Bintje) et les couper en rondelles fines de 2 à 3 mm. Ne pas les rincer : leur amidon épaissit la sauce.'),
    (v_rid, 2, 'Peler les gousses d''ail. Frotter un plat à gratin avec une gousse coupée en deux, puis le beurrer généreusement. Hacher finement l''autre gousse.'),
    (v_rid, 3, 'Porter à frémissement le lait et la crème avec l''ail haché, la muscade, du sel et du poivre, puis retirer du feu.'),
    (v_rid, 4, 'Disposer les rondelles de pommes de terre en couches régulières dans le plat.'),
    (v_rid, 5, 'Verser le mélange lait-crème chaud : il doit arriver juste sous la dernière couche de pommes de terre.'),
    (v_rid, 6, 'Enfourner 1 h 10 à 1 h 15, jusqu''à ce que le dessus soit doré et que la pointe d''un couteau s''enfonce sans résistance. Prolonger de 10 min si besoin.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Hachis parmentier ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Hachis parmentier' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'a1a6ad155aedae02016f1d0eb81ec430'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Hachis parmentier';
  ELSE
    UPDATE public.recipes
       SET title = 'Hachis parmentier', prep_time_min = 70, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Viande hachée de bœuf', 600, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Pomme de terre', 1.3, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Concentré de tomate', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 4),
    (v_rid, 'Beurre', 50, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Lait', 25, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 6),
    (v_rid, 'Gruyère râpé', 100, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 7),
    (v_rid, 'Persil', 4, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 8),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher les pommes de terre et les couper en gros morceaux. Les mettre dans une casserole d''eau froide salée, porter à ébullition et cuire 20 à 25 min, jusqu''à ce qu''elles soient tendres.'),
    (v_rid, 1, 'Pendant ce temps, éplucher et hacher les oignons et l''ail, et ciseler le persil.'),
    (v_rid, 2, 'Chauffer l''huile d''olive dans une sauteuse et y faire revenir les oignons 5 min à feu moyen, jusqu''à ce qu''ils soient translucides, puis ajouter l''ail 1 min.'),
    (v_rid, 3, 'Ajouter la viande hachée et la cuire 8 à 10 min en l''émiettant, jusqu''à ce qu''elle ne soit plus du tout rosée.'),
    (v_rid, 4, 'Incorporer le concentré de tomate et le persil, saler, poivrer et cuire encore 2 min.'),
    (v_rid, 5, 'Préchauffer le four à 200 °C et faire chauffer le lait.'),
    (v_rid, 6, 'Égoutter les pommes de terre et les écraser au presse-purée avec le beurre et le lait chaud. Saler et poivrer.'),
    (v_rid, 7, 'Étaler la viande dans un plat à gratin, la recouvrir de purée et lisser, puis tracer des stries à la fourchette.'),
    (v_rid, 8, 'Parsemer de gruyère râpé et enfourner 20 à 25 min, jusqu''à ce que le dessus soit bien doré.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Tartiflette ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Tartiflette' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'ea9a4fb1a555d07e2adbb6079593fad2'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Tartiflette';
  ELSE
    UPDATE public.recipes
       SET title = 'Tartiflette', prep_time_min = 60, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pomme de terre à chair ferme', 1, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Reblochon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Lardons fumés', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 2),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Crème fraîche', 10, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Vin blanc', 10, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Boissons'), 5),
    (v_rid, 'Beurre', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Laver les pommes de terre et les cuire entières, avec leur peau, 20 à 25 min dans une grande casserole d''eau bouillante salée, jusqu''à ce que la pointe d''un couteau s''y enfonce facilement.'),
    (v_rid, 1, 'Les égoutter, les laisser tiédir, puis les éplucher et les couper en rondelles d''environ 1 cm.'),
    (v_rid, 2, 'Pendant la cuisson des pommes de terre, éplucher et émincer les oignons.'),
    (v_rid, 3, 'Faire revenir les lardons à sec 5 min dans une poêle, ajouter les oignons et cuire 8 à 10 min à feu moyen, jusqu''à ce qu''ils soient fondants.'),
    (v_rid, 4, 'Verser le vin blanc sec, laisser réduire 2 min et poivrer. Ne pas saler : lardons et reblochon le sont déjà.'),
    (v_rid, 5, 'Préchauffer le four à 200 °C et beurrer un plat à gratin.'),
    (v_rid, 6, 'Alterner dans le plat des couches de pommes de terre et de mélange lardons-oignons, puis verser la crème fraîche par-dessus.'),
    (v_rid, 7, 'Couper le reblochon en deux dans l''épaisseur et poser les deux moitiés sur le gratin, croûte vers le haut.'),
    (v_rid, 8, 'Enfourner 20 à 25 min, jusqu''à ce que le reblochon soit fondu et bien doré.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Mousse au chocolat ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Mousse au chocolat' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '9248e813a53dc21230f6ef6e71783ac3'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Mousse au chocolat';
  ELSE
    UPDATE public.recipes
       SET title = 'Mousse au chocolat', prep_time_min = 30, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Dessert')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Chocolat noir', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 0),
    (v_rid, 'Œuf', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Beurre', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Sucre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 3),
    (v_rid, 'Sel', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Attention, œufs crus : mousse déconseillée aux femmes enceintes, aux jeunes enfants, aux personnes âgées ou fragiles. Utiliser des œufs très frais et consommer la mousse sous 24 h.'),
    (v_rid, 1, 'Casser le chocolat noir (pâtissier, au moins 70 % de cacao) en morceaux et le faire fondre avec le beurre au bain-marie, ou au micro-ondes par séquences de 30 s en remuant entre chaque. Lisser et laisser tiédir.'),
    (v_rid, 2, 'Séparer les blancs des jaunes d''œufs.'),
    (v_rid, 3, 'Incorporer les jaunes un par un au chocolat tiédi, en mélangeant bien après chaque ajout.'),
    (v_rid, 4, 'Monter les blancs en neige ferme avec la pincée de sel, puis ajouter le sucre et fouetter encore 30 s pour les serrer.'),
    (v_rid, 5, 'Mélanger vivement un tiers des blancs au chocolat pour l''assouplir, puis incorporer le reste délicatement à la spatule, en soulevant la masse, jusqu''à ce qu''il ne reste plus de traces blanches.'),
    (v_rid, 6, 'Répartir dans des ramequins ou des verrines, filmer et réfrigérer au moins 4 h avant de servir.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Pâtes à la carbonara ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Pâtes à la carbonara' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '364e571fa6877d32cc2325d2d8879fe8'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Pâtes à la carbonara';
  ELSE
    UPDATE public.recipes
       SET title = 'Pâtes à la carbonara', prep_time_min = 25, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Spaghetti', 400, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Guanciale', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Jaune d''œuf', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Pecorino', 80, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Parmesan râpé', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Attention, jaunes d''œufs à peine cuits : plat déconseillé aux femmes enceintes, aux jeunes enfants, aux personnes âgées ou fragiles ; utiliser des œufs très frais.'),
    (v_rid, 1, 'Porter à ébullition un grand volume d''eau et la saler.'),
    (v_rid, 2, 'Couper le guanciale en lardons d''environ 5 mm.'),
    (v_rid, 3, 'Faire rissoler le guanciale à sec 6 à 8 min dans une grande poêle à feu moyen, jusqu''à ce qu''il soit croustillant, puis éteindre le feu.'),
    (v_rid, 4, 'Râper finement le pecorino. Dans un bol, mélanger les jaunes avec le pecorino, le parmesan et une généreuse dose de poivre fraîchement moulu, jusqu''à obtenir une crème épaisse.'),
    (v_rid, 5, 'Cuire les spaghetti 1 min de moins que le temps indiqué sur le paquet.'),
    (v_rid, 6, 'Prélever une tasse d''eau de cuisson (environ 15 cl), puis égoutter les pâtes.'),
    (v_rid, 7, 'Verser les pâtes dans la poêle du guanciale, hors du feu, et les enrober de sa graisse pendant 30 s.'),
    (v_rid, 8, 'Toujours hors du feu, ajouter le mélange jaunes-fromage et 3 à 4 c. à soupe d''eau de cuisson, puis remuer vivement jusqu''à obtenir une sauce crémeuse qui nappe les pâtes. Servir aussitôt.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Soupe à l'oignon gratinée ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Soupe à l''oignon gratinée' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '45ffafd168f007951a63133de80381f6'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Soupe à l''oignon gratinée';
  ELSE
    UPDATE public.recipes
       SET title = 'Soupe à l''oignon gratinée', prep_time_min = 60, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Entrée')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Oignon', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Beurre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Farine', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Bouillon de bœuf', 2, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Vin blanc', 15, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Boissons'), 4),
    (v_rid, 'Pain de campagne', 4, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 5),
    (v_rid, 'Gruyère râpé', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 6),
    (v_rid, 'Thym frais', 2, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher les oignons (de préférence jaunes) et les émincer finement.'),
    (v_rid, 1, 'Faire fondre le beurre dans une grande casserole et y cuire les oignons à feu doux 25 à 30 min en remuant souvent, jusqu''à ce qu''ils soient fondants et bien dorés.'),
    (v_rid, 2, 'Pendant ce temps, délayer les 2 cubes de bouillon dans 1 l d''eau bouillante.'),
    (v_rid, 3, 'Saupoudrer les oignons de farine et remuer 1 min.'),
    (v_rid, 4, 'Verser le vin blanc sec et laisser réduire 2 min en grattant le fond.'),
    (v_rid, 5, 'Ajouter le bouillon et le thym, porter à ébullition, puis laisser mijoter 15 min à feu doux. Retirer le thym, poivrer et saler seulement si nécessaire (le bouillon en cube est déjà salé).'),
    (v_rid, 6, 'Faire griller les tranches de pain au grille-pain ou 2 à 3 min sous le gril du four, puis allumer le gril du four.'),
    (v_rid, 7, 'Répartir la soupe dans des bols allant au four, poser une tranche de pain grillé sur chacun et la couvrir généreusement de gruyère râpé.'),
    (v_rid, 8, 'Passer les bols 3 à 5 min sous le gril, jusqu''à ce que le fromage soit fondu et doré. Servir brûlant, en prévenant que les bols sont très chauds.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Ratatouille ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Ratatouille' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'f29518b4aa2e1bc7df6158cd190b5633'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Ratatouille';
  ELSE
    UPDATE public.recipes
       SET title = 'Ratatouille', prep_time_min = 85, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Accompagnement')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Courgette', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Aubergine', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Poivron rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Poivron jaune', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Tomate', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Ail', 3, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Huile d''olive', 6, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Herbes de Provence', 2, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Basilic frais', 8, 'feuille', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 9),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Laver les légumes. Couper les aubergines et les courgettes en cubes de 2 cm environ.'),
    (v_rid, 1, 'Épépiner les poivrons et les couper en morceaux de 2 cm.'),
    (v_rid, 2, 'Couper les tomates (bien mûres) en dés, émincer les oignons en demi-lunes et hacher l''ail.'),
    (v_rid, 3, 'Chauffer 2 c. à soupe d''huile d''olive dans une cocotte et y faire dorer les aubergines 8 min à feu moyen-vif, puis les réserver.'),
    (v_rid, 4, 'Ajouter 1 c. à soupe d''huile et faire revenir les courgettes 5 min, puis les réserver.'),
    (v_rid, 5, 'Ajouter 1 c. à soupe d''huile et faire revenir les poivrons 5 min, puis les réserver.'),
    (v_rid, 6, 'Verser le reste de l''huile, faire fondre les oignons 5 min, ajouter l''ail 1 min, puis les tomates, et cuire 5 min.'),
    (v_rid, 7, 'Remettre tous les légumes dans la cocotte, ajouter les herbes de Provence, saler et poivrer.'),
    (v_rid, 8, 'Couvrir et laisser mijoter 40 min à feu doux en remuant délicatement de temps en temps, jusqu''à ce que les légumes soient fondants. Découvrir les 10 dernières minutes s''il reste trop de jus.'),
    (v_rid, 9, 'Ciseler le basilic et le parsemer au moment de servir. Servir chaud, tiède ou froid.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Tarte aux pommes ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Tarte aux pommes' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'ab2a08b9916b352090adc4c4b7aeee80'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Tarte aux pommes';
  ELSE
    UPDATE public.recipes
       SET title = 'Tarte aux pommes', prep_time_min = 50, default_portions = 8,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Dessert')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pâte feuilletée', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Pomme', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Compote de pomme', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 2),
    (v_rid, 'Sucre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 3),
    (v_rid, 'Beurre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Cannelle', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Confiture d''abricot', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 6);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200 °C.'),
    (v_rid, 1, 'Dérouler la pâte feuilletée dans un moule à tarte de 28 cm et en piquer le fond à la fourchette.'),
    (v_rid, 2, 'Étaler la compote de pomme en couche régulière sur le fond de pâte.'),
    (v_rid, 3, 'Éplucher les pommes (Golden ou Reinette), retirer le cœur et les couper en lamelles fines d''environ 3 mm.'),
    (v_rid, 4, 'Disposer les lamelles en rosace sur la compote, en les faisant se chevaucher.'),
    (v_rid, 5, 'Mélanger le sucre et la cannelle, en saupoudrer les pommes, puis parsemer de petits morceaux de beurre.'),
    (v_rid, 6, 'Enfourner 30 à 35 min, jusqu''à ce que les pommes soient dorées et le dessous de la pâte croustillant.'),
    (v_rid, 7, 'À la sortie du four, faire tiédir la confiture d''abricot avec 1 c. à soupe d''eau et en badigeonner les pommes au pinceau pour les faire briller.'),
    (v_rid, 8, 'Servir la tarte tiède ou froide.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Fondant au chocolat ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Fondant au chocolat' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'bf6ff36efd2b679c48d1541e00827da8'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Fondant au chocolat';
  ELSE
    UPDATE public.recipes
       SET title = 'Fondant au chocolat', prep_time_min = 45, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Dessert')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Chocolat noir', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 0),
    (v_rid, 'Beurre', 160, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Sucre', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 2),
    (v_rid, 'Œuf', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Farine', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 4);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180 °C. Beurrer un moule à manqué de 22 à 24 cm avec 10 g de beurre, puis le fariner avec 10 g de farine.'),
    (v_rid, 1, 'Faire fondre le chocolat avec les 150 g de beurre restants au bain-marie, lisser et laisser tiédir.'),
    (v_rid, 2, 'Fouetter les œufs avec le sucre 3 à 4 min, jusqu''à ce que le mélange blanchisse et double de volume.'),
    (v_rid, 3, 'Incorporer le chocolat fondu au mélange œufs-sucre.'),
    (v_rid, 4, 'Tamiser les 50 g de farine restants au-dessus de la préparation et les incorporer délicatement à la spatule.'),
    (v_rid, 5, 'Verser dans le moule et enfourner 20 à 25 min : le centre doit rester légèrement tremblotant.'),
    (v_rid, 6, 'Laisser tiédir 10 min avant de démouler.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Saumon en papillote ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Saumon en papillote' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '925af4d320e98dd5893c8bef39d62290'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Saumon en papillote';
  ELSE
    UPDATE public.recipes
       SET title = 'Saumon en papillote', prep_time_min = 35, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pavé de saumon', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Courgette', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Tomate cerise', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Citron', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Aneth frais', 4, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Riz', 240, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200 °C et préparer 4 grandes feuilles de papier cuisson.'),
    (v_rid, 1, 'Cuire le riz dans une grande casserole d''eau bouillante salée selon le temps indiqué sur le paquet, puis l''égoutter et le garder au chaud.'),
    (v_rid, 2, 'Pendant ce temps, couper la courgette en fines rondelles, les tomates cerises en deux et le citron en rondelles fines.'),
    (v_rid, 3, 'Sur chaque feuille, étaler un lit de rondelles de courgette, poser un pavé de saumon, puis ajouter les tomates cerises, une rondelle de citron et une branche d''aneth.'),
    (v_rid, 4, 'Arroser chaque papillote d''un filet d''huile d''olive, saler et poivrer.'),
    (v_rid, 5, 'Fermer les papillotes hermétiquement en repliant plusieurs fois les bords du papier.'),
    (v_rid, 6, 'Enfourner 15 à 18 min : la chair du saumon doit se détacher en lamelles tout en restant légèrement nacrée au centre (prolonger de 3 à 5 min pour une cuisson complète).'),
    (v_rid, 7, 'Servir dans les papillotes ouvertes, accompagnées du riz.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Velouté de potiron ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Velouté de potiron' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '4f671df0fc66b672521b14644cd757e6'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Velouté de potiron';
  ELSE
    UPDATE public.recipes
       SET title = 'Velouté de potiron', prep_time_min = 45, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Entrée')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Potiron', 800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Pomme de terre', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Crème fraîche', 15, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Bouillon de volaille', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 4),
    (v_rid, 'Beurre', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Croûtons', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 6),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher le potiron, retirer les graines et le couper en cubes de 3 cm. Éplucher la pomme de terre et la couper en morceaux, puis émincer l''oignon.'),
    (v_rid, 1, 'Délayer le cube de bouillon dans 60 cl d''eau bouillante.'),
    (v_rid, 2, 'Faire fondre le beurre dans une cocotte et y faire suer l''oignon 3 à 4 min à feu doux, sans coloration.'),
    (v_rid, 3, 'Ajouter le potiron et la pomme de terre, verser le bouillon et porter à ébullition.'),
    (v_rid, 4, 'Couvrir et cuire 20 à 25 min à feu moyen, jusqu''à ce que les légumes soient très tendres.'),
    (v_rid, 5, 'Mixer au mixeur plongeant jusqu''à obtenir un velouté bien lisse.'),
    (v_rid, 6, 'Incorporer 10 cl de crème fraîche et la muscade, puis saler, poivrer et réchauffer 2 min sans faire bouillir.'),
    (v_rid, 7, 'Servir bien chaud, avec un trait du reste de crème et les croûtons parsemés au dernier moment.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Lasagnes bolognaise ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Lasagnes bolognaise' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'cdaaa77ff7354dc6a383972f243b03c9'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Lasagnes bolognaise';
  ELSE
    UPDATE public.recipes
       SET title = 'Lasagnes bolognaise', prep_time_min = 105, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Feuilles de lasagne', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Viande hachée de bœuf', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Coulis de tomate', 750, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Carotte', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Beurre', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 6),
    (v_rid, 'Farine', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 7),
    (v_rid, 'Lait', 75, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 8),
    (v_rid, 'Gruyère râpé', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 9),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Herbes de Provence', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 13),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 14);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher et hacher l''oignon et l''ail ; éplucher les carottes et les couper en petits dés.'),
    (v_rid, 1, 'Chauffer l''huile d''olive dans une sauteuse et y faire revenir l''oignon et les carottes 5 min, puis l''ail 1 min.'),
    (v_rid, 2, 'Ajouter la viande hachée et la cuire 5 à 7 min en l''émiettant, jusqu''à ce qu''elle ne soit plus du tout rosée.'),
    (v_rid, 3, 'Verser le coulis de tomate, ajouter les herbes de Provence, saler, poivrer et laisser mijoter 30 min à feu doux, à demi couvert. La sauce doit rester assez liquide car les feuilles crues l''absorbent : ajouter un peu d''eau si elle épaissit trop.'),
    (v_rid, 4, 'Pour la béchamel, faire fondre le beurre dans une casserole, ajouter la farine d''un coup et remuer 2 min sans laisser colorer.'),
    (v_rid, 5, 'Verser le lait froid petit à petit en fouettant, puis cuire 8 à 10 min à feu doux sans cesser de remuer, jusqu''à ce que la sauce nappe la cuillère. Ajouter la muscade, saler et poivrer.'),
    (v_rid, 6, 'Préchauffer le four à 180 °C.'),
    (v_rid, 7, 'Dans un plat à gratin d''environ 30 × 20 cm, étaler une fine couche de béchamel, puis alterner feuilles de lasagne sans précuisson (environ 12 au total), bolognaise et béchamel, sur 3 ou 4 étages.'),
    (v_rid, 8, 'Terminer par une couche de béchamel qui recouvre bien les feuilles, puis parsemer de gruyère râpé.'),
    (v_rid, 9, 'Enfourner 35 à 40 min, jusqu''à ce que le dessus soit gratiné et que la pointe d''un couteau traverse les pâtes sans résistance.'),
    (v_rid, 10, 'Laisser reposer 10 min avant de découper et de servir.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Salade niçoise ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Salade niçoise' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '42d026a87f1dadf80c9d3be24c50aefb'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Salade niçoise';
  ELSE
    UPDATE public.recipes
       SET title = 'Salade niçoise', prep_time_min = 30, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Entrée')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Thon en conserve', 2, 'boîte', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Œuf', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Tomate', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Haricot vert', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Olives noires', 80, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 4),
    (v_rid, 'Anchois', 8, 'filet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 5),
    (v_rid, 'Poivron vert', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Oignon rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 7),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Vinaigre de vin', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Basilic frais', 6, 'feuille', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 10),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Plonger les œufs 10 min dans l''eau bouillante, puis les refroidir dans de l''eau froide et les écaler.'),
    (v_rid, 1, 'Équeuter les haricots verts, les cuire 7 à 8 min dans de l''eau bouillante salée pour qu''ils restent croquants, puis les rafraîchir dans de l''eau glacée et les égoutter.'),
    (v_rid, 2, 'Couper les tomates en quartiers, épépiner le poivron et le tailler en lamelles, puis émincer l''oignon rouge en fines rondelles.'),
    (v_rid, 3, 'Égoutter le thon et l''émietter grossièrement.'),
    (v_rid, 4, 'Préparer la vinaigrette en fouettant l''huile d''olive avec le vinaigre, du sel et du poivre.'),
    (v_rid, 5, 'Disposer dans un grand plat les haricots verts, les tomates, le poivron et l''oignon, puis répartir le thon, les olives, les filets d''anchois et les œufs coupés en quartiers.'),
    (v_rid, 6, 'Arroser de vinaigrette, parsemer de basilic ciselé et servir aussitôt.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Croque-monsieur ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Croque-monsieur' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '353e21afb50c36e19d5d95e9f96bf435'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Croque-monsieur';
  ELSE
    UPDATE public.recipes
       SET title = 'Croque-monsieur', prep_time_min = 25, default_portions = 4,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pain de mie', 8, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Jambon blanc', 4, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Gruyère râpé', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Beurre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Farine', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 4),
    (v_rid, 'Lait', 25, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200 °C et sortir 20 g de beurre pour qu''il ramollisse.'),
    (v_rid, 1, 'Pour la béchamel, faire fondre les 20 g de beurre restants dans une casserole, ajouter la farine et remuer 1 min sans colorer.'),
    (v_rid, 2, 'Verser le lait froid petit à petit en fouettant et cuire 3 à 5 min à feu doux jusqu''à épaississement. Assaisonner de muscade, sel et poivre, puis retirer du feu.'),
    (v_rid, 3, 'Beurrer une face de chaque tranche de pain de mie avec le beurre ramolli.'),
    (v_rid, 4, 'Poser 4 tranches sur une plaque recouverte de papier cuisson, face beurrée dessous, et les tartiner d''une fine couche de béchamel.'),
    (v_rid, 5, 'Ajouter sur chacune une tranche de jambon pliée à la taille du pain et environ la moitié du gruyère râpé.'),
    (v_rid, 6, 'Refermer avec les 4 autres tranches, face beurrée vers l''extérieur.'),
    (v_rid, 7, 'Napper le dessus avec le reste de béchamel et parsemer du reste de gruyère.'),
    (v_rid, 8, 'Enfourner 10 à 12 min, puis passer 2 min sous le gril si nécessaire, jusqu''à ce que le fromage soit fondu et doré.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Blanquette de veau ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Blanquette de veau' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = 'db4f52d9c045f1f4ba817671a3a22044'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Blanquette de veau';
  ELSE
    UPDATE public.recipes
       SET title = 'Blanquette de veau', prep_time_min = 135, default_portions = 6,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Veau (blanquette)', 1.5, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Carotte', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Poireau', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Clou de girofle', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Bouquet garni', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Champignon de Paris', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Citron', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 7),
    (v_rid, 'Beurre', 50, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 8),
    (v_rid, 'Farine', 50, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 9),
    (v_rid, 'Crème fraîche épaisse', 20, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 10),
    (v_rid, 'Jaune d''œuf', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 11),
    (v_rid, 'Riz', 350, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 12),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 13),
    (v_rid, 'Poivre blanc', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 14);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper le veau (épaule ou tendron) en morceaux de 5 cm environ, les mettre dans une grande cocotte et les couvrir largement d''eau froide.'),
    (v_rid, 1, 'Porter à ébullition, puis écumer soigneusement pendant 5 min.'),
    (v_rid, 2, 'Éplucher les carottes et les couper en tronçons, nettoyer les poireaux et les couper en tronçons, puis éplucher l''oignon et le piquer des 2 clous de girofle.'),
    (v_rid, 3, 'Ajouter les légumes et le bouquet garni dans la cocotte, saler, puis laisser cuire 1 h 30 à petits frémissements, à couvert, jusqu''à ce que la viande soit tendre.'),
    (v_rid, 4, 'Pendant ce temps, nettoyer les champignons et les couper en quartiers. Les cuire 10 min à couvert dans une petite casserole avec une louche du bouillon de cuisson et le jus d''un demi-citron, puis les réserver.'),
    (v_rid, 5, 'Cuire le riz dans de l''eau bouillante salée selon le temps indiqué sur le paquet, puis l''égoutter et le garder au chaud.'),
    (v_rid, 6, 'Retirer la viande et les carottes à l''écumoire et les garder au chaud. Jeter l''oignon et le bouquet garni, puis filtrer le bouillon et en mesurer 1 l.'),
    (v_rid, 7, 'Faire fondre le beurre dans une casserole, ajouter la farine et cuire 2 min en remuant, sans colorer.'),
    (v_rid, 8, 'Verser le bouillon chaud petit à petit en fouettant, puis laisser épaissir 10 min à feu doux.'),
    (v_rid, 9, 'Dans un bol, mélanger la crème et les jaunes d''œufs, puis tempérer ce mélange en y fouettant une louche de sauce chaude.'),
    (v_rid, 10, 'Retirer la casserole du feu et incorporer le mélange crème-jaunes en fouettant, sans faire bouillir. Ajouter le jus du demi-citron restant, saler et poivrer.'),
    (v_rid, 11, 'Remettre la viande, les carottes et les champignons égouttés dans la sauce et réchauffer 5 min à feu très doux, sans laisser bouillir. Servir avec le riz.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Correction : Omelette aux champignons ──
  v_rid := NULL;
  SELECT rc.id INTO v_rid FROM public.recipes rc
   WHERE rc.title = 'Omelette aux champignons' AND md5(concat_ws('§',
      (SELECT r.title || '|' || coalesce(r.prep_time_min::text, '') || '|' || r.default_portions::text
         FROM public.recipes r WHERE r.id = rc.id),
      (SELECT string_agg(concat_ws('|', i.name, i.quantity::text, i.unit, sc.name), '¶' ORDER BY i.position, i.name)
         FROM public.recipe_ingredients i LEFT JOIN public.shopping_categories sc ON sc.id = i.shopping_category_id
        WHERE i.recipe_id = rc.id),
      (SELECT string_agg(s.instruction, '¶' ORDER BY s.position)
         FROM public.recipe_steps s WHERE s.recipe_id = rc.id))) = '03f593b64fa803065c49b8cbc206c619'
   LIMIT 1;
  IF v_rid IS NULL THEN
    v_skipped := v_skipped + 1;
    RAISE NOTICE 'recettes : « % » absente ou modifiée dans l''appli : non touchée', 'Omelette aux champignons';
  ELSE
    UPDATE public.recipes
       SET title = 'Omelette aux champignons', prep_time_min = 20, default_portions = 2,
           category_id = (SELECT id FROM public.recipe_categories WHERE name = 'Plat')
     WHERE id = v_rid;
    DELETE FROM public.recipe_ingredients WHERE recipe_id = v_rid;
    DELETE FROM public.recipe_steps WHERE recipe_id = v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Œuf', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 0),
    (v_rid, 'Champignon de Paris', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Beurre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Persil', 4, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Ail', 1, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Nettoyer les champignons et les émincer. Peler et hacher l''ail, puis ciseler le persil.'),
    (v_rid, 1, 'Faire fondre la moitié du beurre dans une grande poêle à feu vif et y faire sauter les champignons 5 à 6 min, jusqu''à ce que leur eau soit évaporée et qu''ils soient dorés.'),
    (v_rid, 2, 'Ajouter l''ail et le persil, cuire 1 min, saler, poivrer, puis réserver les champignons dans une assiette.'),
    (v_rid, 3, 'Battre les œufs à la fourchette avec du sel et du poivre, juste assez pour mélanger les jaunes et les blancs.'),
    (v_rid, 4, 'Essuyer la poêle et y faire fondre le reste du beurre à feu moyen-vif jusqu''à ce qu''il mousse.'),
    (v_rid, 5, 'Verser les œufs et les cuire 1 à 2 min en ramenant doucement les bords vers le centre avec une spatule.'),
    (v_rid, 6, 'Lorsque l''omelette est encore baveuse au centre, répartir les champignons sur une moitié.'),
    (v_rid, 7, 'Replier l''omelette, la faire glisser sur une planche, la couper en deux et servir aussitôt.');
    v_fixed := v_fixed + 1;
  END IF;

  -- ── Nouvelle : Pot-au-feu ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Pot-au-feu')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Pot-au-feu', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            220, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Viande à pot-au-feu', 1800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Os à moelle', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Carotte', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Poireau', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Navet', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Céleri', 2, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Clou de girofle', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 8),
    (v_rid, 'Bouquet garni', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Pomme de terre à chair ferme', 1500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 10),
    (v_rid, 'Gros sel', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11),
    (v_rid, 'Poivre noir en grains', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12),
    (v_rid, 'Moutarde', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 13),
    (v_rid, 'Cornichons (bocal)', 1, 'pot', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 14);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Mettre les morceaux de viande dans un grand faitout, couvrir d''environ 4 l d''eau froide et porter doucement à ébullition.'),
    (v_rid, 1, 'Retirer l''écume qui se forme à la surface avec une écumoire pendant 10 min, jusqu''à ce que le liquide soit clair.'),
    (v_rid, 2, 'Piquer chaque oignon épluché avec les clous de girofle, puis les ajouter avec l''ail pelé, le bouquet garni, le gros sel et le poivre en grains. Laisser cuire 2 h à petits frémissements, à couvert entrouvert.'),
    (v_rid, 3, 'Pendant ce temps, éplucher les carottes et les navets, couper les poireaux en deux dans la longueur, les laver et les ficeler en botte, et couper le céleri en tronçons de 5 cm.'),
    (v_rid, 4, 'Ajouter tous ces légumes dans le faitout et poursuivre la cuisson 1 h à petits frémissements, en complétant avec un peu d''eau chaude si la viande n''est plus couverte.'),
    (v_rid, 5, 'Frotter les extrémités des os à moelle avec un peu de gros sel et les plonger dans le bouillon pour les 20 dernières minutes de cuisson.'),
    (v_rid, 6, 'Pendant ce temps, éplucher les pommes de terre et les cuire 25 min dans une casserole de bouillon prélevé dans le faitout (ou d''eau salée), jusqu''à ce que la pointe d''un couteau s''y enfonce sans résistance.'),
    (v_rid, 7, 'Vérifier que la viande se détache à la fourchette, la trancher et la servir avec les légumes, la moelle, la moutarde et les cornichons. Dégraisser le bouillon restant et le servir en soupe ou le garder pour une autre recette.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Poulet basquaise ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Poulet basquaise')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Poulet basquaise', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            80, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Cuisse de poulet', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Poivron rouge', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Poivron vert', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Ail', 3, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Tomates pelées (conserve)', 800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 5),
    (v_rid, 'Jambon cru', 2, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 6),
    (v_rid, 'Vin blanc', 15, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Boissons'), 7),
    (v_rid, 'Huile d''olive', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Piment d''Espelette', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Thym frais', 2, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 10),
    (v_rid, 'Laurier', 2, 'feuille', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 13);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper chaque cuisse de poulet en deux à l''articulation (haut de cuisse et pilon), puis saler et poivrer les morceaux.'),
    (v_rid, 1, 'Épépiner les poivrons et les tailler en lanières, émincer les oignons, hacher l''ail et couper le jambon cru en petites lanières.'),
    (v_rid, 2, 'Chauffer 2 c. à soupe d''huile d''olive dans une cocotte à feu moyen-vif et dorer les morceaux de poulet 8 à 10 min en les retournant, côté peau d''abord. Les réserver sur une assiette.'),
    (v_rid, 3, 'Dans la même cocotte, ajouter le reste d''huile, puis les oignons, les poivrons et le jambon. Faire revenir 10 min à feu moyen en remuant, jusqu''à ce que les poivrons ramollissent, puis ajouter l''ail 1 min.'),
    (v_rid, 4, 'Verser le vin blanc et laisser réduire de moitié 2 à 3 min en grattant le fond de la cocotte.'),
    (v_rid, 5, 'Ajouter les tomates pelées en les écrasant à la cuillère, le piment d''Espelette, le thym et le laurier. Remettre le poulet dans la sauce.'),
    (v_rid, 6, 'Couvrir et laisser mijoter 40 min à feu doux en remuant de temps en temps. Le poulet est cuit quand le jus qui s''écoule près de l''os est clair, sans trace rosée (75 °C à cœur avec un thermomètre).'),
    (v_rid, 7, 'Retirer le thym et le laurier, goûter et rectifier l''assaisonnement. Si la sauce est trop liquide, la laisser réduire 5 min sans couvercle avant de servir.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Chili con carne ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Chili con carne')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Chili con carne', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            85, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Viande hachée de bœuf', 750, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Haricots rouges', 800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 1),
    (v_rid, 'Tomates pelées (conserve)', 800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Concentré de tomate', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Ail', 3, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Poivron rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Cumin', 2, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Paprika', 2, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Piment de Cayenne', 0.5, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Origan', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Bouillon de bœuf', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 11),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12),
    (v_rid, 'Riz', 450, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 13),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 14),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 15);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Émincer les oignons, hacher l''ail et couper le poivron épépiné en petits dés. Dissoudre le cube de bouillon dans 30 cl d''eau chaude.'),
    (v_rid, 1, 'Chauffer l''huile dans une grande cocotte à feu vif et y faire dorer la viande hachée 8 min en l''émiettant à la spatule, jusqu''à ce qu''il ne reste plus de partie rosée.'),
    (v_rid, 2, 'Ajouter les oignons et le poivron, baisser à feu moyen et cuire 5 min en remuant.'),
    (v_rid, 3, 'Ajouter l''ail, le cumin, le paprika, le piment de Cayenne et l''origan, puis remuer 1 min pour torréfier les épices.'),
    (v_rid, 4, 'Incorporer le concentré de tomate, les tomates pelées écrasées et le bouillon. Porter à ébullition, couvrir et laisser mijoter 45 min à feu doux en remuant de temps en temps.'),
    (v_rid, 5, 'Égoutter et rincer les haricots rouges, les ajouter dans la cocotte et poursuivre la cuisson 15 min sans couvercle, jusqu''à obtenir une sauce épaisse. Saler, poivrer et ajuster le piment.'),
    (v_rid, 6, 'Pendant ce temps, cuire le riz dans une grande casserole d''eau bouillante salée le temps indiqué sur le paquet (10 à 12 min environ), puis l''égoutter.'),
    (v_rid, 7, 'Servir le chili bien chaud avec le riz.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Curry de poulet au lait de coco ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Curry de poulet au lait de coco')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Curry de poulet au lait de coco', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            45, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Blanc de poulet', 600, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Lait de coco', 40, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Gingembre frais', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Curry', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Concentré de tomate', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 6),
    (v_rid, 'Huile de tournesol', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Citron vert', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 8),
    (v_rid, 'Coriandre fraîche', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 9),
    (v_rid, 'Riz basmati', 320, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 10),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper les blancs de poulet en cubes de 3 cm. Émincer l''oignon, hacher l''ail et râper le gingembre pelé.'),
    (v_rid, 1, 'Rincer le riz basmati à l''eau froide, puis le cuire dans une casserole d''eau bouillante salée 10 à 12 min (ou selon le paquet). L''égoutter et le garder au chaud.'),
    (v_rid, 2, 'Chauffer l''huile dans une sauteuse à feu moyen-vif et faire dorer les cubes de poulet 5 min en remuant. Les réserver.'),
    (v_rid, 3, 'Dans la même sauteuse, faire fondre l''oignon 5 min à feu moyen, puis ajouter l''ail, le gingembre et le curry et remuer 1 min.'),
    (v_rid, 4, 'Ajouter le concentré de tomate et le lait de coco, bien mélanger et porter à frémissement.'),
    (v_rid, 5, 'Remettre le poulet dans la sauce et laisser mijoter 12 à 15 min à feu doux, à découvert. Couper un gros morceau : la chair doit être blanche jusqu''au centre, sans trace rosée (75 °C à cœur).'),
    (v_rid, 6, 'Hors du feu, ajouter le jus du citron vert, saler, puis parsemer de coriandre ciselée. Servir avec le riz.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Gratin de pâtes au jambon ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Gratin de pâtes au jambon')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Gratin de pâtes au jambon', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            45, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Macaroni', 350, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Jambon blanc', 4, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Beurre', 45, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Farine', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Lait', 60, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Emmental râpé', 120, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200 °C et beurrer un plat à gratin avec 5 g de beurre.'),
    (v_rid, 1, 'Cuire les macaronis dans une grande casserole d''eau bouillante salée 2 min de moins que le temps indiqué sur le paquet, puis les égoutter : ils finiront de cuire au four.'),
    (v_rid, 2, 'Pendant ce temps, préparer la béchamel : faire fondre le reste du beurre dans une casserole à feu moyen, ajouter la farine et remuer 1 à 2 min sans laisser colorer.'),
    (v_rid, 3, 'Verser le lait froid petit à petit en fouettant sans arrêt, puis cuire 5 min en continuant de fouetter, jusqu''à ce que la sauce nappe la cuillère. Saler, poivrer et ajouter la muscade.'),
    (v_rid, 4, 'Couper le jambon en petits carrés et le mélanger avec les pâtes, la béchamel et la moitié de l''emmental.'),
    (v_rid, 5, 'Verser le tout dans le plat, parsemer du reste d''emmental et enfourner 20 min, jusqu''à ce que le dessus soit bien doré.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Endives au jambon ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Endives au jambon')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Endives au jambon', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            60, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Endive', 8, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Jambon blanc', 8, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Beurre', 45, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Farine', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Lait', 60, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Gruyère râpé', 100, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Sucre', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Retirer les feuilles abîmées des endives et creuser un petit cône à la base avec un couteau pour ôter la partie la plus amère.'),
    (v_rid, 1, 'Plonger les endives dans une grande casserole d''eau bouillante salée et sucrée et les cuire 15 min, jusqu''à ce qu''elles soient tendres.'),
    (v_rid, 2, 'Les égoutter tête en bas dans une passoire au moins 10 min, puis les presser délicatement entre les mains pour extraire un maximum d''eau. Préchauffer le four à 200 °C.'),
    (v_rid, 3, 'Préparer la béchamel : faire fondre 40 g de beurre dans une casserole, ajouter la farine et remuer 1 à 2 min, puis verser le lait froid en fouettant et cuire 5 min jusqu''à épaississement.'),
    (v_rid, 4, 'Hors du feu, incorporer la moitié du gruyère râpé, la muscade, du sel et du poivre.'),
    (v_rid, 5, 'Beurrer un plat à gratin avec le reste du beurre. Enrouler chaque endive dans une tranche de jambon et les ranger côte à côte dans le plat.'),
    (v_rid, 6, 'Napper de béchamel, parsemer du reste de gruyère et enfourner 25 min, jusqu''à ce que le dessus soit doré et que la sauce bouillonne sur les bords.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Boulettes de bœuf à la sauce tomate ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Boulettes de bœuf à la sauce tomate')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Boulettes de bœuf à la sauce tomate', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            55, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Viande hachée de bœuf', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Œuf', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Chapelure', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Lait', 5, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Parmesan râpé', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Persil', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 7),
    (v_rid, 'Tomates pelées (conserve)', 800, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 8),
    (v_rid, 'Huile d''olive', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Sucre', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 10),
    (v_rid, 'Origan', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11),
    (v_rid, 'Spaghetti', 350, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 12),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 13),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 14);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Émincer l''oignon, hacher l''ail et ciseler le persil. Dans un saladier, mélanger la chapelure avec le lait et laisser gonfler pendant la préparation de la sauce.'),
    (v_rid, 1, 'Chauffer 1 c. à soupe d''huile dans une sauteuse à feu moyen, faire fondre l''oignon 5 min, puis ajouter la moitié de l''ail 1 min.'),
    (v_rid, 2, 'Ajouter les tomates pelées écrasées, le sucre et l''origan, saler, poivrer et laisser mijoter 15 min à feu doux, à découvert.'),
    (v_rid, 3, 'Ajouter dans le saladier la viande hachée, l''œuf, le parmesan, le reste de l''ail, le persil, du sel et du poivre. Bien mélanger et former environ 16 boulettes de la taille d''une noix avec les mains humides.'),
    (v_rid, 4, 'Chauffer le reste d''huile dans une poêle à feu moyen-vif et faire dorer les boulettes 6 à 8 min en les retournant pour les colorer de tous côtés.'),
    (v_rid, 5, 'Plonger les boulettes dans la sauce, couvrir et laisser mijoter 15 min à feu doux. Couper une boulette : l''intérieur doit être cuit, sans partie rosée.'),
    (v_rid, 6, 'Pendant ce temps, cuire les spaghettis dans une grande casserole d''eau bouillante salée le temps indiqué sur le paquet, puis les égoutter.'),
    (v_rid, 7, 'Servir les spaghettis nappés de sauce avec les boulettes.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Couscous au poulet et merguez ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Couscous au poulet et merguez')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Couscous au poulet et merguez', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            95, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Cuisse de poulet', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Merguez', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Couscous (semoule)', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Carotte', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Courgette', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Navet', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Pois chiches', 400, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 7),
    (v_rid, 'Tomates pelées (conserve)', 400, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 8),
    (v_rid, 'Concentré de tomate', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 9),
    (v_rid, 'Ras el hanout', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Bouillon de volaille', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 11),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 12),
    (v_rid, 'Beurre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 13),
    (v_rid, 'Harissa', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 14),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 15),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 16);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper chaque cuisse de poulet en deux à l''articulation. Éplucher les carottes et les navets et les couper en gros tronçons, émincer les oignons, couper les courgettes en tronçons de 4 cm.'),
    (v_rid, 1, 'Chauffer 3 c. à soupe d''huile dans un grand faitout à feu moyen-vif et faire dorer les morceaux de poulet 8 à 10 min, puis ajouter les oignons et les faire revenir 5 min.'),
    (v_rid, 2, 'Ajouter le ras el hanout et le concentré de tomate et remuer 1 min, puis ajouter les tomates pelées, le cube de bouillon, les carottes, les navets et 2 l d''eau. Saler légèrement, poivrer, porter à ébullition et laisser mijoter 30 min à couvert.'),
    (v_rid, 3, 'Ajouter les courgettes et les pois chiches égouttés et rincés, puis poursuivre la cuisson 20 min. Le poulet est cuit quand le jus près de l''os est clair, sans trace rosée (75 °C à cœur).'),
    (v_rid, 4, 'Pendant ce temps, cuire les merguez dans une poêle à feu moyen 10 à 12 min en les retournant régulièrement, jusqu''à ce qu''elles soient bien dorées et cuites jusqu''au centre.'),
    (v_rid, 5, 'Préparer la semoule : la verser dans un grand saladier avec 1 c. à soupe d''huile et une pincée de sel, puis couvrir de 50 cl d''eau bouillante. Couvrir d''une assiette et laisser gonfler 5 min.'),
    (v_rid, 6, 'Égrener la semoule à la fourchette en incorporant le beurre en morceaux.'),
    (v_rid, 7, 'Diluer la harissa dans une louche de bouillon pour ceux qui aiment épicé. Servir la semoule avec le poulet, les merguez, les légumes et le bouillon à part.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Risotto aux champignons ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Risotto aux champignons')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Risotto aux champignons', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            45, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Riz arborio', 320, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Champignon de Paris', 400, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Échalote', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Ail', 1, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Vin blanc', 10, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Boissons'), 4),
    (v_rid, 'Bouillon de légumes', 2, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 5),
    (v_rid, 'Parmesan râpé', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 6),
    (v_rid, 'Beurre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 7),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Persil', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 9),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Dissoudre les cubes de bouillon dans 1,2 l d''eau dans une casserole et maintenir ce bouillon à petits frémissements pendant toute la cuisson.'),
    (v_rid, 1, 'Nettoyer les champignons, les émincer, puis les faire sauter 8 min à feu vif dans une poêle avec 20 g de beurre, jusqu''à ce que leur eau soit évaporée. Saler, poivrer et réserver.'),
    (v_rid, 2, 'Hacher finement les échalotes et l''ail. Les faire fondre 3 min à feu moyen dans une sauteuse avec l''huile d''olive, sans les colorer.'),
    (v_rid, 3, 'Ajouter le riz et le remuer 2 min, jusqu''à ce que les grains deviennent translucides sur les bords.'),
    (v_rid, 4, 'Verser le vin blanc et remuer jusqu''à ce qu''il soit entièrement absorbé.'),
    (v_rid, 5, 'Ajouter le bouillon chaud une louche à la fois, en remuant souvent et en attendant que chaque louche soit presque absorbée avant d''ajouter la suivante, pendant 18 à 20 min. Le riz doit rester légèrement ferme au centre et le mélange crémeux.'),
    (v_rid, 6, 'Hors du feu, incorporer les champignons, le reste du beurre et le parmesan. Couvrir et laisser reposer 2 min.'),
    (v_rid, 7, 'Goûter, rectifier le sel et le poivre, parsemer de persil ciselé et servir aussitôt.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Petit salé aux lentilles ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Petit salé aux lentilles')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Petit salé aux lentilles', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            110, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Petit salé', 1500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Lentilles', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 1),
    (v_rid, 'Carotte', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Clou de girofle', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Bouquet garni', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Pour dessaler la viande, mettre le petit salé dans un grand faitout, le couvrir largement d''eau froide et porter à ébullition. Laisser bouillir 5 min, puis égoutter et rincer la viande.'),
    (v_rid, 1, 'Remettre la viande dans le faitout rincé et la couvrir d''environ 3 l d''eau froide. Ajouter un oignon piqué des clous de girofle, l''ail pelé, le bouquet garni et du poivre, sans saler.'),
    (v_rid, 2, 'Porter à frémissement, retirer l''écume, couvrir à moitié et laisser cuire 45 min à petits frémissements.'),
    (v_rid, 3, 'Pendant ce temps, rincer les lentilles (vertes, idéalement du Puy), éplucher les carottes et les couper en rondelles, et émincer le second oignon.'),
    (v_rid, 4, 'Ajouter les lentilles, les carottes et l''oignon émincé dans le faitout, en vérifiant qu''ils sont couverts de 2 cm de bouillon (rajouter de l''eau chaude si besoin). Poursuivre la cuisson 30 à 35 min, jusqu''à ce que les lentilles soient tendres mais encore entières.'),
    (v_rid, 5, 'Vérifier que la viande est tendre et se détache facilement à la fourchette (porc bien cuit à cœur, au-delà de 70 °C). Goûter les lentilles et saler seulement si nécessaire, car la viande est déjà salée.'),
    (v_rid, 6, 'Retirer le bouquet garni, couper la viande en morceaux et servir sur les lentilles égouttées, avec un peu de bouillon.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Rôti de porc aux pommes de terre ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Rôti de porc aux pommes de terre')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Rôti de porc aux pommes de terre', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            100, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Rôti de porc', 1200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Pomme de terre à chair ferme', 1500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Oignon', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Ail', 4, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Thym frais', 4, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Laurier', 2, 'feuille', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Bouillon de volaille', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 6),
    (v_rid, 'Huile d''olive', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Beurre', 20, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 8),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Sortir le rôti du réfrigérateur 30 min avant la cuisson. Préchauffer le four à 180 °C et dissoudre le cube de bouillon dans 25 cl d''eau chaude.'),
    (v_rid, 1, 'Éplucher les pommes de terre et les couper en quartiers, couper les oignons en quartiers. Dans un grand plat à four, les mélanger avec 2 c. à soupe d''huile, les gousses d''ail entières non pelées, le thym, le laurier, du sel et du poivre.'),
    (v_rid, 2, 'Saler et poivrer le rôti. Chauffer le reste d''huile et le beurre dans une poêle à feu moyen-vif et faire dorer le rôti 8 à 10 min en le tournant sur toutes ses faces.'),
    (v_rid, 3, 'Poser le rôti au milieu des pommes de terre, verser le bouillon dans le fond du plat et enfourner pour environ 1 h 05.'),
    (v_rid, 4, 'Arroser le rôti et retourner les pommes de terre toutes les 20 min, en ajoutant un peu d''eau si le fond du plat accroche.'),
    (v_rid, 5, 'Vérifier la cuisson : le rôti est cuit quand un thermomètre planté au centre indique 70 °C, ou quand le jus qui s''écoule en le piquant est clair. Les pommes de terre doivent être dorées et fondantes.'),
    (v_rid, 6, 'Envelopper le rôti dans du papier aluminium et le laisser reposer 10 min en gardant les pommes de terre au four éteint, puis le trancher et le servir avec les pommes de terre et le jus du plat.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Galettes de sarrasin complètes ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Galettes de sarrasin complètes')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Galettes de sarrasin complètes', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            50, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Farine de sarrasin', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Œuf', 9, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Jambon blanc', 8, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 2),
    (v_rid, 'Emmental râpé', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Beurre demi-sel', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Dans un saladier, mélanger la farine de sarrasin avec 1 c. à café rase de sel et 1 œuf. Verser progressivement 60 cl d''eau froide en fouettant, jusqu''à obtenir une pâte lisse et assez fluide.'),
    (v_rid, 1, 'Couvrir et laisser reposer la pâte au moins 1 h au réfrigérateur (ou toute une nuit). Avant de l''utiliser, bien la remélanger et ajouter un peu d''eau si elle a épaissi.'),
    (v_rid, 2, 'Faire fondre le beurre demi-sel. Chauffer une grande poêle ou une crêpière à feu vif, la graisser au pinceau avec un peu de beurre fondu et y verser une louche de pâte en l''étalant finement.'),
    (v_rid, 3, 'Laisser cuire 1 à 2 min, jusqu''à ce que les bords se décollent, puis retourner la galette et baisser à feu moyen.'),
    (v_rid, 4, 'Casser un œuf au centre et étaler doucement le blanc avec le dos d''une cuillère, sans crever le jaune. Ajouter une tranche de jambon et environ 25 g d''emmental autour du jaune, puis poivrer.'),
    (v_rid, 5, 'Cuire 3 à 4 min, jusqu''à ce que le blanc soit bien pris et le fromage fondu. Rabattre les quatre bords vers le centre pour former un carré en laissant le jaune visible.'),
    (v_rid, 6, 'Glisser la galette sur une assiette chaude, la badigeonner d''un peu de beurre fondu et recommencer avec le reste de la pâte et de la garniture pour obtenir 8 galettes (2 par personne).');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Pizza maison ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Pizza maison')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Pizza maison', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            55, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Farine', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Levure de boulanger', 1, 'sachet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 1),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 2),
    (v_rid, 'Coulis de tomate', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Mozzarella', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Jambon blanc', 4, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 5),
    (v_rid, 'Champignon de Paris', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Origan', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Dans un grand saladier, mélanger la farine, la levure de boulanger sèche et 2 c. à café rases de sel. Ajouter 2 c. à soupe d''huile d''olive et 30 cl d''eau tiède, puis mélanger jusqu''à former une boule.'),
    (v_rid, 1, 'Pétrir la pâte 10 min sur le plan de travail fariné, jusqu''à ce qu''elle soit lisse et souple.'),
    (v_rid, 2, 'Remettre la pâte dans le saladier, couvrir d''un torchon et laisser lever 1 h 30 dans un endroit tiède, jusqu''à ce qu''elle double de volume.'),
    (v_rid, 3, 'Préchauffer le four à 250 °C (ou au maximum) avec deux plaques à l''intérieur. Pendant ce temps, émincer les champignons, couper le jambon en morceaux et la mozzarella égouttée en tranches.'),
    (v_rid, 4, 'Dégazer la pâte, la partager en deux et étaler chaque moitié sur une feuille de papier cuisson, en un disque ou un rectangle d''environ 3 mm d''épaisseur.'),
    (v_rid, 5, 'Étaler le coulis de tomate sur les pâtes en laissant 1 cm de bord, saler, poivrer et parsemer d''origan. Répartir le jambon, les champignons et la mozzarella, puis arroser du reste d''huile.'),
    (v_rid, 6, 'Faire glisser les pizzas avec leur papier sur les plaques chaudes et cuire 12 à 15 min, jusqu''à ce que les bords soient dorés et le fromage bien fondu. Si le four ne cuit pas bien sur deux niveaux, cuire les pizzas l''une après l''autre.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Moules marinières ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Moules marinières')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Moules marinières', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            40, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Moule', 3, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Échalote', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Vin blanc', 25, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Boissons'), 3),
    (v_rid, 'Beurre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Persil', 1, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Thym frais', 2, 'branche', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Laurier', 1, 'feuille', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Trier les moules : jeter celles dont la coquille est cassée et celles qui restent ouvertes après avoir été tapotées sur le plan de travail.'),
    (v_rid, 1, 'Gratter les moules, retirer les filaments (le byssus) en tirant dessus, puis les rincer à l''eau froide 2 ou 3 fois sans les laisser tremper. Les garder au frais jusqu''à la cuisson.'),
    (v_rid, 2, 'Hacher finement les échalotes et l''ail, et ciseler le persil.'),
    (v_rid, 3, 'Faire fondre le beurre dans un grand faitout à feu moyen et y faire suer les échalotes et l''ail 3 min, sans coloration.'),
    (v_rid, 4, 'Verser le vin blanc, ajouter le thym, le laurier et du poivre, puis porter à ébullition 2 min. Ne pas saler : les moules rendent une eau déjà salée.'),
    (v_rid, 5, 'Ajouter les moules, couvrir et cuire 5 à 8 min à feu vif, en remuant ou en secouant le faitout 2 fois, jusqu''à ce que les moules soient grandes ouvertes.'),
    (v_rid, 6, 'Jeter les moules restées fermées après la cuisson. Parsemer de persil, mélanger et servir aussitôt dans des assiettes creuses avec le jus de cuisson. Ne pas conserver les restes plus d''une journée au réfrigérateur.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Dahl de lentilles corail ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Dahl de lentilles corail')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Dahl de lentilles corail', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            40, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Lentilles corail', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Lait de coco', 40, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Tomates pelées (conserve)', 400, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Gingembre frais', 15, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Curry', 1, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Curcuma', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Cumin', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Bouillon de légumes', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 9),
    (v_rid, 'Huile de tournesol', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Citron vert', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 11),
    (v_rid, 'Coriandre fraîche', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 12),
    (v_rid, 'Riz basmati', 300, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 13),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 14);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Rincer les lentilles corail dans une passoire fine sous l''eau froide jusqu''à ce que l''eau soit claire. Émincer l''oignon, hacher l''ail et râper le gingembre pelé. Dissoudre le cube de bouillon dans 50 cl d''eau chaude.'),
    (v_rid, 1, 'Chauffer l''huile dans une cocotte à feu moyen et faire fondre l''oignon 5 min en remuant.'),
    (v_rid, 2, 'Ajouter l''ail, le gingembre, le curry, le curcuma et le cumin, puis remuer 1 min sans laisser brûler les épices.'),
    (v_rid, 3, 'Ajouter les lentilles, les tomates pelées écrasées, le lait de coco et le bouillon. Porter à ébullition, puis laisser mijoter 20 à 25 min à feu doux, à découvert, en remuant souvent pour que les lentilles n''attachent pas.'),
    (v_rid, 4, 'Pendant ce temps, rincer le riz basmati et le cuire dans une casserole d''eau bouillante salée 10 à 12 min (ou selon le paquet), puis l''égoutter.'),
    (v_rid, 5, 'Quand les lentilles sont fondantes et le dahl bien épais (ajouter un peu d''eau s''il épaissit trop), saler et ajouter le jus du citron vert.'),
    (v_rid, 6, 'Parsemer de coriandre ciselée et servir avec le riz.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Cabillaud au four et sauce vierge ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Cabillaud au four et sauce vierge')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Cabillaud au four et sauce vierge', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            35, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Cabillaud', 600, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 0),
    (v_rid, 'Tomate', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Échalote', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Basilic frais', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Citron', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Huile d''olive', 6, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200 °C. Sortir le cabillaud (4 dos ou pavés d''environ 150 g) du réfrigérateur, l''éponger avec du papier absorbant et retirer les éventuelles arêtes du bout des doigts.'),
    (v_rid, 1, 'Préparer la sauce vierge : couper les tomates en deux, ôter les graines et tailler la chair en petits dés. Peler l''échalote et la hacher très finement. Effeuiller et ciseler le basilic. Presser le citron.'),
    (v_rid, 2, 'Dans un bol, réunir les dés de tomate, l''échalote, 5 c. à soupe d''huile d''olive et 2 c. à soupe de jus de citron. Saler, poivrer et laisser à température ambiante le temps de la cuisson du poisson. Garder le basilic à part pour qu''il reste bien vert.'),
    (v_rid, 3, 'Ranger le cabillaud dans un plat allant au four, le badigeonner avec la dernière cuillerée d''huile d''olive, saler et poivrer.'),
    (v_rid, 4, 'Enfourner pour 12 à 15 minutes selon l''épaisseur (compter 18 à 20 minutes pour un dos très épais). Le poisson est cuit lorsque sa chair est nacrée et opaque jusqu''au centre et qu''elle se sépare en lamelles quand on la pique avec une fourchette ; si le cœur reste translucide, prolonger de 2 à 3 minutes.'),
    (v_rid, 5, 'Pour une sauce tiède, la chauffer 1 à 2 minutes dans une petite casserole sur feu très doux, sans la laisser bouillir. Ajouter le basilic juste avant de servir.'),
    (v_rid, 6, 'Servir le cabillaud sans attendre, nappé de sauce vierge.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Wok de nouilles au poulet et aux légumes ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Wok de nouilles au poulet et aux légumes')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Wok de nouilles au poulet et aux légumes', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            35, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Nouilles chinoises', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Blanc de poulet', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Carotte', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Poivron rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Courgette', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Gingembre frais', 15, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 7),
    (v_rid, 'Sauce soja', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 8),
    (v_rid, 'Sauce huître', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 9),
    (v_rid, 'Huile de tournesol', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Tailler le poulet en lanières d''environ 1 cm d''épaisseur. Éplucher les carottes et les couper en fins bâtonnets. Épépiner le poivron et le couper en lanières, détailler la courgette en bâtonnets et l''oignon en lamelles. Hacher l''ail et râper le gingembre après l''avoir pelé.'),
    (v_rid, 1, 'Dans un bol, mélanger la sauce soja, la sauce huître et 3 c. à soupe d''eau.'),
    (v_rid, 2, 'Cuire les nouilles dans une grande casserole d''eau bouillante en suivant le temps du paquet (souvent 3 à 4 minutes). Les égoutter, les passer sous l''eau froide, puis les mélanger avec 1 c. à soupe d''huile pour éviter qu''elles ne collent.'),
    (v_rid, 3, 'Chauffer 1 c. à soupe d''huile dans un wok ou une grande poêle à feu vif. Faire sauter le poulet 5 à 6 minutes en remuant souvent, jusqu''à ce qu''il soit doré et cuit à cœur : en coupant le morceau le plus épais, la chair doit être blanche, sans trace rosée, avec un jus clair (74 °C à cœur si l''on a un thermomètre). Le réserver dans une assiette propre.'),
    (v_rid, 4, 'Verser le reste de l''huile dans le wok. Faire sauter l''oignon et les carottes 3 minutes, puis ajouter le poivron, la courgette, l''ail et le gingembre et poursuivre 3 minutes : les légumes doivent rester un peu croquants.'),
    (v_rid, 5, 'Remettre le poulet dans le wok avec les nouilles et la sauce. Faire sauter 2 minutes à feu vif en mélangeant bien pour tout enrober et réchauffer, puis servir aussitôt.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Tomates farcies ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Tomates farcies')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Tomates farcies', (SELECT id FROM public.recipe_categories WHERE name = 'Plat'),
            75, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Tomate', 8, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Chair à saucisse', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 1),
    (v_rid, 'Viande hachée de bœuf', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Viandes & poissons'), 2),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Ail', 2, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Persil', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Pain de mie', 2, 'tranche', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 6),
    (v_rid, 'Lait', 5, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 7),
    (v_rid, 'Œuf', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 8),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 11);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180 °C. Choisir des tomates moyennes et fermes (environ 150 g chacune). Les laver, découper un chapeau côté pédoncule et les vider à la petite cuillère sans abîmer la peau. Saler légèrement l''intérieur et les poser à l''envers sur du papier absorbant 10 minutes pour qu''elles perdent leur eau. Hacher grossièrement la pulpe retirée et la garder.'),
    (v_rid, 1, 'Émietter le pain de mie dans un bol, l''arroser avec le lait, laisser imbiber 5 minutes puis l''écraser à la fourchette.'),
    (v_rid, 2, 'Peler et hacher finement l''oignon et l''ail. Laver, sécher et hacher le persil.'),
    (v_rid, 3, 'Dans un saladier, mélanger la chair à saucisse, la viande hachée, le pain imbibé, l''œuf, l''oignon, l''ail et le persil. Saler avec modération (la chair à saucisse est déjà assaisonnée) et poivrer. Malaxer jusqu''à obtenir une farce bien homogène.'),
    (v_rid, 4, 'Huiler un plat à four avec 1 c. à soupe d''huile d''olive et y étaler la pulpe hachée. Placer les tomates dessus, les remplir de farce en tassant un peu et en formant un léger dôme, puis reposer les chapeaux. Arroser avec le reste de l''huile.'),
    (v_rid, 5, 'Enfourner pour 45 minutes à 1 heure selon la grosseur des tomates, en les arrosant de jus à mi-cuisson. Vérifier la cuisson de la viande : en piquant le centre d''une tomate, le jus qui sort doit être clair et la farce ne doit plus être rosée (70 °C à cœur au thermomètre). Sinon, prolonger de 10 minutes.'),
    (v_rid, 6, 'Laisser reposer 5 minutes hors du four et servir avec le jus de cuisson.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Soupe poireaux-pommes de terre ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Soupe poireaux-pommes de terre')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Soupe poireaux-pommes de terre', (SELECT id FROM public.recipe_categories WHERE name = 'Entrée'),
            45, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Poireau', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Pomme de terre', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Beurre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 3),
    (v_rid, 'Bouillon de légumes', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 4),
    (v_rid, 'Crème fraîche', 10, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Retirer la partie vert foncé des poireaux, les fendre en deux dans la longueur et les rincer sous l''eau en écartant les feuilles pour chasser la terre, puis les émincer. Éplucher les pommes de terre et les couper en cubes d''environ 2 cm. Peler et émincer l''oignon.'),
    (v_rid, 1, 'Faire fondre le beurre dans un faitout à feu moyen. Ajouter les poireaux et l''oignon et les faire suer 5 minutes en remuant, sans les laisser colorer.'),
    (v_rid, 2, 'Ajouter les pommes de terre, émietter le cube de bouillon et verser 1,2 litre d''eau. Porter à ébullition, puis couvrir et laisser cuire 25 minutes à petits frémissements, jusqu''à ce que les pommes de terre s''écrasent sans effort.'),
    (v_rid, 3, 'Mixer finement au mixeur plongeant (ou laisser des morceaux pour une soupe plus rustique). Incorporer la crème fraîche, goûter puis saler et poivrer (le bouillon est déjà salé). Si la soupe est trop épaisse, l''allonger d''un peu d''eau chaude.'),
    (v_rid, 4, 'Servir bien chaud.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Taboulé ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Taboulé')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Taboulé', (SELECT id FROM public.recipe_categories WHERE name = 'Entrée'),
            30, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Couscous (semoule)', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Tomate', 4, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Concombre', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Oignon rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Persil', 1, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Menthe fraîche', 1, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Citron', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 6),
    (v_rid, 'Huile d''olive', 6, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Verser la semoule dans un grand saladier, ajouter 1 c. à soupe d''huile d''olive et une pincée de sel, puis mélanger du bout des doigts. Couvrir de 25 cl d''eau bouillante, poser une assiette dessus et laisser gonfler 5 minutes. Égrainer à la fourchette et laisser refroidir complètement.'),
    (v_rid, 1, 'Couper les tomates en petits dés (retirer les graines si elles sont très juteuses). Peler le concombre, l''ouvrir en deux, ôter les graines à la cuillère et le couper en dés. Peler l''oignon rouge et le hacher finement.'),
    (v_rid, 2, 'Laver et bien sécher le persil et la menthe, les effeuiller puis les ciseler finement.'),
    (v_rid, 3, 'Presser les citrons. Ajouter à la semoule froide les légumes, les herbes, le jus de citron et le reste de l''huile d''olive. Saler, poivrer et mélanger soigneusement.'),
    (v_rid, 4, 'Couvrir et réfrigérer au moins 1 heure pour que la semoule s''imprègne des jus. Remuer et goûter avant de servir pour ajuster le citron et le sel. Le taboulé se garde 2 jours au réfrigérateur.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Œufs mimosa ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Œufs mimosa')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Œufs mimosa', (SELECT id FROM public.recipe_categories WHERE name = 'Entrée'),
            30, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Œuf', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 0),
    (v_rid, 'Mayonnaise', 3, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 1),
    (v_rid, 'Moutarde', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 2),
    (v_rid, 'Ciboulette', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Porter une casserole d''eau à ébullition. Y descendre doucement les œufs à l''aide d''une cuillère (s''ils sortent du réfrigérateur, le faire sans les cogner pour éviter qu''ils se fêlent) et les cuire 10 minutes à petits bouillons.'),
    (v_rid, 1, 'Les transférer aussitôt dans un saladier d''eau très froide, avec des glaçons si possible, et les y laisser au moins 10 minutes : ils doivent être froids jusqu''au jaune. Ce refroidissement arrête la cuisson et facilite l''écalage.'),
    (v_rid, 2, 'Écaler les œufs, les rincer, puis les couper en deux dans la longueur. Sortir délicatement les jaunes.'),
    (v_rid, 3, 'Mettre 2 jaunes de côté. Écraser les 4 autres à la fourchette avec la mayonnaise et la moutarde, ajouter la moitié de la ciboulette ciselée, saler et poivrer.'),
    (v_rid, 4, 'Remplir les demi-blancs de cette crème à la petite cuillère. Émietter les 2 jaunes réservés au-dessus, à la fourchette ou en les frottant contre une passoire fine, pour obtenir l''effet mimosa, puis parsemer du reste de ciboulette.'),
    (v_rid, 5, 'Servir tout de suite ou garder au réfrigérateur, couverts, 24 heures au maximum. Ne pas les laisser plus de 2 heures à température ambiante.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Salade de pâtes ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Salade de pâtes')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Salade de pâtes', (SELECT id FROM public.recipe_categories WHERE name = 'Entrée'),
            30, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Farfalle', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Thon en conserve', 1, 'boîte', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 1),
    (v_rid, 'Tomate cerise', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Maïs en conserve', 1, 'boîte', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Concombre', 0.5, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Basilic frais', 0.5, 'botte', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Vinaigre de vin', 2, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Moutarde', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 9),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 10);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Cuire les farfalle dans une grande casserole d''eau bouillante salée, le temps indiqué sur le paquet (environ 10 minutes), pour qu''elles restent légèrement fermes.'),
    (v_rid, 1, 'Les égoutter, les rafraîchir sous l''eau froide pour stopper la cuisson, bien les égoutter puis les mélanger avec 1 c. à soupe d''huile d''olive.'),
    (v_rid, 2, 'Préparer la vinaigrette dans un grand saladier : fouetter la moutarde, le vinaigre, du sel et du poivre, puis ajouter le reste de l''huile d''olive en fouettant.'),
    (v_rid, 3, 'Couper les tomates cerises en deux et le demi-concombre en dés. Égoutter le maïs. Égoutter le thon et l''émietter.'),
    (v_rid, 4, 'Verser les pâtes et toute la garniture dans le saladier, mélanger, puis ajouter le basilic ciselé.'),
    (v_rid, 5, 'Réfrigérer au moins 30 minutes avant de servir. Garder au frais et consommer dans les 24 heures.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Purée de pommes de terre ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Purée de pommes de terre')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Purée de pommes de terre', (SELECT id FROM public.recipe_categories WHERE name = 'Accompagnement'),
            40, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pomme de terre', 1, 'kg', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Lait', 25, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Beurre', 60, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Muscade', 1, 'pincée', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 3),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher les pommes de terre (de préférence une variété pour purée, à chair fondante ou farineuse), les couper en morceaux de taille égale et les rincer.'),
    (v_rid, 1, 'Les mettre dans une grande casserole, couvrir d''eau froide et saler. Porter à ébullition puis cuire 20 à 25 minutes à frémissement : la pointe d''un couteau doit s''enfoncer sans résistance.'),
    (v_rid, 2, 'Pendant ce temps, chauffer le lait sans le faire bouillir et couper le beurre en dés.'),
    (v_rid, 3, 'Égoutter soigneusement les pommes de terre et les remettre 1 à 2 minutes dans la casserole sur feu doux pour évaporer l''eau restante.'),
    (v_rid, 4, 'Les écraser au presse-purée ou au moulin à légumes (le mixeur rend la purée collante). Incorporer d''abord le beurre, puis le lait chaud petit à petit en remuant à la spatule jusqu''à la consistance souhaitée.'),
    (v_rid, 5, 'Assaisonner de sel, de poivre et de muscade, puis servir bien chaud.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Riz pilaf ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Riz pilaf')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Riz pilaf', (SELECT id FROM public.recipe_categories WHERE name = 'Accompagnement'),
            35, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Riz', 250, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Oignon', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Beurre', 40, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Bouillon de volaille', 1, 'cube', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Laurier', 1, 'feuille', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Chauffer 45 cl d''eau, y dissoudre le cube de bouillon et le garder chaud.'),
    (v_rid, 1, 'Peler et hacher finement l''oignon. Dans une casserole à fond épais avec couvercle (ou une cocotte allant au four), faire fondre 30 g de beurre à feu doux et y faire suer l''oignon 3 à 4 minutes, sans coloration.'),
    (v_rid, 2, 'Ajouter le riz long, sans le rincer, et remuer 2 minutes : les grains enrobés de beurre deviennent translucides, on dit qu''ils sont nacrés.'),
    (v_rid, 3, 'Verser le bouillon chaud (environ une fois et demie le volume du riz), ajouter la feuille de laurier et poivrer. Goûter le bouillon avant de saler, le cube l''étant déjà. Porter à ébullition.'),
    (v_rid, 4, 'Couvrir et laisser cuire 17 minutes à feu très doux sans soulever le couvercle. Variante : 18 minutes au four à 200 °C dans la cocotte couverte.'),
    (v_rid, 5, 'Hors du feu, laisser reposer 5 minutes à couvert. Retirer le laurier, ajouter le reste du beurre et égrainer le riz à la fourchette avant de servir.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Légumes rôtis au four ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Légumes rôtis au four')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Légumes rôtis au four', (SELECT id FROM public.recipe_categories WHERE name = 'Accompagnement'),
            55, 4, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Carotte', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Courgette', 2, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 1),
    (v_rid, 'Poivron rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 2),
    (v_rid, 'Oignon rouge', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 3),
    (v_rid, 'Ail', 4, 'gousse', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 4),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 5),
    (v_rid, 'Herbes de Provence', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7),
    (v_rid, 'Poivre', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200 °C (190 °C en chaleur tournante).'),
    (v_rid, 1, 'Éplucher les carottes et les couper en bâtonnets d''environ 1 cm. Couper les courgettes en demi-rondelles de 1,5 cm, le poivron épépiné en morceaux de 3 cm et l''oignon rouge en quartiers. Écraser légèrement les gousses d''ail avec le plat d''un couteau sans les peler.'),
    (v_rid, 2, 'Étaler les carottes sur une grande plaque couverte de papier cuisson, les arroser de 1 c. à soupe d''huile d''olive, saler et enfourner 15 minutes : elles demandent plus de temps que les autres légumes.'),
    (v_rid, 3, 'Dans un saladier, mélanger les courgettes, le poivron, l''oignon et l''ail avec le reste de l''huile d''olive, les herbes de Provence, du sel et du poivre.'),
    (v_rid, 4, 'Ajouter ces légumes sur la plaque avec les carottes, en une seule couche (utiliser deux plaques si nécessaire, sinon ils cuisent à l''étouffée au lieu de rôtir). Poursuivre la cuisson 25 à 30 minutes en les retournant à mi-cuisson, jusqu''à ce qu''ils soient tendres et dorés sur les bords.'),
    (v_rid, 5, 'Servir chaud, en pressant la pulpe des gousses d''ail rôties sur les légumes.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Gâteau au yaourt ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Gâteau au yaourt')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Gâteau au yaourt', (SELECT id FROM public.recipe_categories WHERE name = 'Dessert'),
            55, 8, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Yaourt nature', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 0),
    (v_rid, 'Œuf', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Sucre', 200, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 2),
    (v_rid, 'Farine', 210, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 3),
    (v_rid, 'Huile de tournesol', 6, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Sucre vanillé', 1, 'sachet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 5),
    (v_rid, 'Levure chimique', 0.5, 'sachet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 6),
    (v_rid, 'Beurre', 10, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180 °C. Beurrer un moule à manqué d''environ 24 cm ou un moule à cake.'),
    (v_rid, 1, 'Verser le yaourt (pot de 125 g) dans un saladier. Rincer et sécher le pot vide : selon la tradition, il sert de verre doseur. Équivalences : 2 pots de sucre font environ 200 g, 3 pots de farine environ 210 g et un demi-pot d''huile environ 6 cl.'),
    (v_rid, 2, 'Ajouter les œufs, le sucre et le sucre vanillé, puis fouetter 1 minute jusqu''à ce que le mélange mousse légèrement.'),
    (v_rid, 3, 'Ajouter la farine, la levure et une pincée de sel. Mélanger juste assez pour obtenir une pâte lisse et sans grumeaux, sans trop la travailler.'),
    (v_rid, 4, 'Incorporer l''huile et mélanger jusqu''à ce que la pâte soit homogène.'),
    (v_rid, 5, 'Verser dans le moule et enfourner pour 35 à 40 minutes (40 à 45 minutes dans un moule à cake). Le gâteau est cuit quand une lame de couteau plantée au centre ressort sèche. S''il dore trop vite, le couvrir d''une feuille d''aluminium après 25 minutes.'),
    (v_rid, 6, 'Laisser tiédir 10 minutes dans le moule, puis démouler sur une grille et laisser refroidir.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Clafoutis aux cerises ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Clafoutis aux cerises')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Clafoutis aux cerises', (SELECT id FROM public.recipe_categories WHERE name = 'Dessert'),
            55, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Cerise', 500, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Œuf', 3, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Farine', 80, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 2),
    (v_rid, 'Sucre', 80, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 3),
    (v_rid, 'Lait', 30, 'cl', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Beurre', 30, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 5),
    (v_rid, 'Sucre vanillé', 1, 'sachet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 6),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 7);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180 °C. Faire fondre 20 g de beurre et beurrer avec le reste un plat à gratin de 24 à 26 cm.'),
    (v_rid, 1, 'Laver, équeuter et sécher les cerises. Traditionnellement, on garde les noyaux (plus de goût, moins de jus) ; s''il y a de jeunes enfants à table, les dénoyauter ou bien prévenir tout le monde. Répartir les cerises dans le plat.'),
    (v_rid, 2, 'Dans un saladier, fouetter les œufs avec le sucre, le sucre vanillé et une pincée de sel jusqu''à ce que le mélange pâlisse. Ajouter la farine en pluie en fouettant pour éviter les grumeaux.'),
    (v_rid, 3, 'Verser le lait petit à petit sans cesser de fouetter, puis le beurre fondu : la pâte doit être fluide, comme une pâte à crêpes.'),
    (v_rid, 4, 'Verser la pâte sur les cerises. Enfourner pour 35 à 40 minutes : le clafoutis doit être gonflé et doré, et une lame plantée au centre doit ressortir sans pâte liquide.'),
    (v_rid, 5, 'Laisser tiédir au moins 15 minutes avant de servir (il retombe un peu, c''est normal). Il se mange tiède ou froid.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Riz au lait ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Riz au lait')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Riz au lait', (SELECT id FROM public.recipe_categories WHERE name = 'Dessert'),
            55, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Riz rond', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 0),
    (v_rid, 'Lait entier', 1, 'l', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 1),
    (v_rid, 'Sucre', 100, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 2),
    (v_rid, 'Gousse de vanille', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 3);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Porter une casserole d''eau à ébullition, y verser le riz rond et le cuire 3 minutes. L''égoutter et le rincer : cela enlève l''amidon de surface et évite un riz collant.'),
    (v_rid, 1, 'Fendre la gousse de vanille en deux dans la longueur et gratter les graines avec la pointe d''un couteau. Dans une grande casserole à fond épais, verser le lait entier, ajouter les graines et la gousse et porter à frémissement à feu moyen en surveillant (le lait monte vite).'),
    (v_rid, 2, 'Ajouter le riz et baisser sur feu très doux : le lait doit à peine frémir. Cuire 40 à 45 minutes à découvert en remuant souvent, surtout vers la fin, pour que rien n''attache au fond.'),
    (v_rid, 3, 'Quand le riz est très tendre et le mélange crémeux, encore un peu liquide (il épaissit en refroidissant), ajouter le sucre et remuer 2 à 3 minutes pour le dissoudre. Retirer la gousse de vanille.'),
    (v_rid, 4, 'Répartir dans 6 ramequins ou un grand bol, laisser refroidir, puis réfrigérer au moins 2 heures. On peut aussi le servir tiède.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Crumble aux pommes ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Crumble aux pommes')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Crumble aux pommes', (SELECT id FROM public.recipe_categories WHERE name = 'Dessert'),
            55, 6, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pomme', 6, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 0),
    (v_rid, 'Farine', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 1),
    (v_rid, 'Beurre', 110, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 2),
    (v_rid, 'Cassonade', 120, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 3),
    (v_rid, 'Cannelle', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 4),
    (v_rid, 'Citron', 0.5, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Fruits & légumes'), 5),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 6);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180 °C. Beurrer un plat à gratin d''environ 24 × 30 cm avec 10 g de beurre.'),
    (v_rid, 1, 'Peler les pommes (environ 1 kg), retirer le cœur et les pépins, puis les couper en cubes de 2 cm. Les mélanger directement dans le plat avec le jus du demi-citron, 20 g de cassonade et la cannelle.'),
    (v_rid, 2, 'Préparer la pâte à crumble : dans un saladier, mélanger la farine, 100 g de cassonade et une pincée de sel. Ajouter 100 g de beurre froid coupé en dés et frotter le tout du bout des doigts jusqu''à obtenir une sorte de grosse chapelure avec des petits grumeaux, sans former de boule.'),
    (v_rid, 3, 'Parsemer la pâte sur les pommes, sans tasser.'),
    (v_rid, 4, 'Enfourner pour 35 à 40 minutes : le dessus doit être doré et croustillant, le jus doit bouillonner sur les bords et les pommes se laisser traverser facilement par la pointe d''un couteau.'),
    (v_rid, 5, 'Laisser tiédir 10 minutes avant de servir.');
    v_added := v_added + 1;
  END IF;

  -- ── Nouvelle : Cookies aux pépites de chocolat ──
  IF NOT EXISTS (SELECT 1 FROM public.recipes WHERE lower(title) = lower('Cookies aux pépites de chocolat')) THEN
    INSERT INTO public.recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
    VALUES (v_family, 'Cookies aux pépites de chocolat', (SELECT id FROM public.recipe_categories WHERE name = 'Dessert'),
            40, 10, v_user)
    RETURNING id INTO v_rid;
  INSERT INTO public.recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Beurre', 125, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 0),
    (v_rid, 'Cassonade', 100, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 1),
    (v_rid, 'Sucre', 50, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 2),
    (v_rid, 'Sucre vanillé', 1, 'sachet', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 3),
    (v_rid, 'Œuf', 1, 'pièce', (SELECT id FROM public.shopping_categories WHERE name = 'Produits laitiers & œufs'), 4),
    (v_rid, 'Farine', 225, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie salée'), 5),
    (v_rid, 'Levure chimique', 1, 'c. à café', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 6),
    (v_rid, 'Pépites de chocolat', 150, 'g', (SELECT id FROM public.shopping_categories WHERE name = 'Épicerie sucrée'), 7),
    (v_rid, 'Sel', NULL, NULL, (SELECT id FROM public.shopping_categories WHERE name = 'Condiments & épices'), 8);
  INSERT INTO public.recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Sortir le beurre 1 heure à l''avance pour qu''il soit bien mou (ou le ramollir quelques secondes au micro-ondes sans le faire fondre). Préchauffer le four à 180 °C et couvrir deux plaques de papier cuisson.'),
    (v_rid, 1, 'Dans un saladier, travailler le beurre mou avec la cassonade, le sucre et le sucre vanillé, à la spatule ou au fouet, jusqu''à obtenir une crème homogène. Ajouter l''œuf et bien mélanger.'),
    (v_rid, 2, 'Ajouter la farine, la levure et une pincée de sel, et mélanger juste jusqu''à ce que la pâte soit homogène. Incorporer les pépites de chocolat. Éviter de goûter la pâte crue, qui contient de l''œuf et de la farine crus.'),
    (v_rid, 3, 'La recette donne environ 20 cookies, soit 2 par portion. Former des boules de la taille d''une noix (35 à 40 g), les poser sur les plaques en les espaçant de 5 cm car elles s''étalent, puis les aplatir légèrement. Si la pâte est trop molle pour être façonnée, la réfrigérer 30 minutes.'),
    (v_rid, 4, 'Cuire une plaque à la fois, 10 à 12 minutes : les bords doivent être dorés et le centre encore pâle et tendre, il durcit en refroidissant.'),
    (v_rid, 5, 'Laisser reposer 5 minutes sur la plaque, puis faire glisser sur une grille pour refroidir. Conserver dans une boîte hermétique.');
    v_added := v_added + 1;
  END IF;

  RAISE NOTICE 'recettes : % corrigée(s), % non touchée(s), % ajoutée(s)', v_fixed, v_skipped, v_added;
END $$;
