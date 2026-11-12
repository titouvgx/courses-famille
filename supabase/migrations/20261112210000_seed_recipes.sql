-- ============================================================
-- Migration : Seed — 20 recettes françaises classiques
-- ============================================================
-- Détecte automatiquement la première famille et le premier user.
-- Les recettes sont partagées (visibles par tous les foyers).
-- ============================================================

DO $$
DECLARE
  v_family_id uuid;
  v_user_id   uuid;

  -- Catégories de recettes
  v_entree   uuid;
  v_plat     uuid;
  v_accomp   uuid;
  v_dessert  uuid;

  -- Rayons de courses
  v_fruits     uuid;
  v_viandes    uuid;
  v_laitiers   uuid;
  v_ep_salee   uuid;
  v_ep_sucree  uuid;
  v_condiments uuid;
  v_surgeles   uuid;
  v_boissons   uuid;

  v_rid uuid; -- recipe id courant
BEGIN
  -- Détecter automatiquement la première famille et le premier user
  SELECT id INTO v_family_id FROM families ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user_id   FROM auth.users ORDER BY created_at LIMIT 1;

  IF v_family_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'Il faut au moins 1 famille et 1 utilisateur avant de lancer ce script.';
  END IF;

  -- Récupérer les catégories de recettes
  SELECT id INTO v_entree   FROM recipe_categories WHERE name = 'Entrée';
  SELECT id INTO v_plat     FROM recipe_categories WHERE name = 'Plat';
  SELECT id INTO v_accomp   FROM recipe_categories WHERE name = 'Accompagnement';
  SELECT id INTO v_dessert  FROM recipe_categories WHERE name = 'Dessert';

  -- Récupérer les rayons
  SELECT id INTO v_fruits     FROM shopping_categories WHERE name = 'Fruits & légumes';
  SELECT id INTO v_viandes    FROM shopping_categories WHERE name = 'Viandes & poissons';
  SELECT id INTO v_laitiers   FROM shopping_categories WHERE name = 'Produits laitiers & œufs';
  SELECT id INTO v_ep_salee   FROM shopping_categories WHERE name = 'Épicerie salée';
  SELECT id INTO v_ep_sucree  FROM shopping_categories WHERE name = 'Épicerie sucrée';
  SELECT id INTO v_condiments FROM shopping_categories WHERE name = 'Condiments & épices';
  SELECT id INTO v_surgeles   FROM shopping_categories WHERE name = 'Surgelés';
  SELECT id INTO v_boissons   FROM shopping_categories WHERE name = 'Boissons';

  -- ══════════════════════════════════════════════════════════
  -- 1. BŒUF BOURGUIGNON
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Bœuf bourguignon', v_plat, 180, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Bœuf à braiser (paleron ou macreuse)', 1.2, 'kg', v_viandes, 0),
    (v_rid, 'Vin rouge (Bourgogne)', 75, 'cl', v_boissons, 1),
    (v_rid, 'Carottes', 4, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Oignons', 3, 'pièce(s)', v_fruits, 3),
    (v_rid, 'Lardons fumés', 150, 'g', v_viandes, 4),
    (v_rid, 'Champignons de Paris', 250, 'g', v_fruits, 5),
    (v_rid, 'Concentré de tomates', 2, 'c. à soupe', v_condiments, 6),
    (v_rid, 'Bouquet garni (thym, laurier, persil)', 1, 'pièce(s)', v_condiments, 7),
    (v_rid, 'Farine', 2, 'c. à soupe', v_ep_salee, 8),
    (v_rid, 'Beurre', 30, 'g', v_laitiers, 9),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', v_condiments, 10),
    (v_rid, 'Ail', 2, 'gousse(s)', v_fruits, 11),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 12),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 13);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper la viande en gros cubes de 4-5 cm. La faire mariner dans le vin rouge avec les carottes coupées en rondelles, les oignons émincés et le bouquet garni pendant au moins 2h (idéalement une nuit au frigo).'),
    (v_rid, 1, 'Égoutter la viande et les légumes, réserver la marinade. Bien éponger la viande.'),
    (v_rid, 2, 'Faire revenir les lardons dans une cocotte avec un peu de beurre. Réserver.'),
    (v_rid, 3, 'Dans la même cocotte, faire dorer les morceaux de viande sur toutes les faces dans l''huile bien chaude. Procéder en plusieurs fois pour ne pas surcharger.'),
    (v_rid, 4, 'Saupoudrer la viande de farine, mélanger et laisser colorer 1-2 minutes.'),
    (v_rid, 5, 'Ajouter le concentré de tomates, l''ail écrasé, les légumes de la marinade et les lardons. Verser la marinade filtrée. Ajouter le bouquet garni.'),
    (v_rid, 6, 'Porter à ébullition, couvrir et laisser mijoter à feu très doux pendant 2h30 à 3h.'),
    (v_rid, 7, 'Pendant ce temps, faire sauter les champignons coupés en quartiers dans du beurre. Les ajouter 30 minutes avant la fin de la cuisson.'),
    (v_rid, 8, 'Rectifier l''assaisonnement. Servir avec des pommes de terre vapeur ou des tagliatelles fraîches.');

  -- ══════════════════════════════════════════════════════════
  -- 2. POULET RÔTI
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Poulet rôti', v_plat, 90, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Poulet entier', 1.5, 'kg', v_viandes, 0),
    (v_rid, 'Beurre', 50, 'g', v_laitiers, 1),
    (v_rid, 'Citron', 1, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Ail', 4, 'gousse(s)', v_fruits, 3),
    (v_rid, 'Thym frais', 4, 'branche(s)', v_condiments, 4),
    (v_rid, 'Romarin', 2, 'branche(s)', v_condiments, 5),
    (v_rid, 'Pommes de terre', 800, 'g', v_fruits, 6),
    (v_rid, 'Huile d''olive', 3, 'c. à soupe', v_condiments, 7),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 8),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 9);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200°C. Sortir le poulet 30 min avant pour qu''il soit à température ambiante.'),
    (v_rid, 1, 'Couper le citron en deux. Peler l''ail. Glisser à l''intérieur du poulet le demi-citron, 2 gousses d''ail et quelques branches de thym.'),
    (v_rid, 2, 'Badigeonner le poulet de beurre mou mélangé avec du sel, du poivre et du thym effeuillé.'),
    (v_rid, 3, 'Couper les pommes de terre en quartiers. Les disposer autour du poulet dans le plat avec le reste d''ail, un filet d''huile d''olive, du romarin, sel et poivre.'),
    (v_rid, 4, 'Enfourner pour 1h15-1h30 en arrosant régulièrement le poulet avec le jus de cuisson (toutes les 20 min).'),
    (v_rid, 5, 'Le poulet est cuit quand le jus qui s''écoule de la cuisse est clair. Laisser reposer 10 min avant de découper.');

  -- ══════════════════════════════════════════════════════════
  -- 3. QUICHE LORRAINE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Quiche lorraine', v_plat, 50, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pâte brisée', 1, 'pièce(s)', v_ep_salee, 0),
    (v_rid, 'Lardons fumés', 200, 'g', v_viandes, 1),
    (v_rid, 'Œufs', 3, 'pièce(s)', v_laitiers, 2),
    (v_rid, 'Crème fraîche épaisse', 20, 'cl', v_laitiers, 3),
    (v_rid, 'Lait', 10, 'cl', v_laitiers, 4),
    (v_rid, 'Gruyère râpé', 80, 'g', v_laitiers, 5),
    (v_rid, 'Noix de muscade', 1, 'pincée', v_condiments, 6),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 7),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 8);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180°C. Étaler la pâte dans un moule à tarte, piquer le fond avec une fourchette.'),
    (v_rid, 1, 'Faire revenir les lardons à sec dans une poêle jusqu''à ce qu''ils soient dorés. Les répartir sur le fond de tarte.'),
    (v_rid, 2, 'Dans un saladier, battre les œufs avec la crème, le lait, la muscade, le sel et le poivre.'),
    (v_rid, 3, 'Verser l''appareil sur les lardons. Parsemer de gruyère râpé.'),
    (v_rid, 4, 'Enfourner 30-35 minutes jusqu''à ce que la quiche soit bien dorée et gonflée. Laisser tiédir 5 min avant de servir.');

  -- ══════════════════════════════════════════════════════════
  -- 4. CRÊPES (SALÉES OU SUCRÉES)
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Pâte à crêpes', v_dessert, 30, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Farine', 250, 'g', v_ep_salee, 0),
    (v_rid, 'Œufs', 4, 'pièce(s)', v_laitiers, 1),
    (v_rid, 'Lait', 50, 'cl', v_laitiers, 2),
    (v_rid, 'Beurre fondu', 30, 'g', v_laitiers, 3),
    (v_rid, 'Sucre vanillé', 1, 'sachet', v_ep_sucree, 4),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 5);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Mettre la farine dans un grand saladier, creuser un puits au centre.'),
    (v_rid, 1, 'Y casser les œufs, ajouter le sel et le sucre vanillé. Mélanger en incorporant progressivement la farine.'),
    (v_rid, 2, 'Verser le lait petit à petit en fouettant pour éviter les grumeaux. Ajouter le beurre fondu.'),
    (v_rid, 3, 'Laisser reposer la pâte au moins 30 minutes au frigo (1h c''est mieux).'),
    (v_rid, 4, 'Faire chauffer une poêle à crêpes légèrement beurrée. Verser une louche de pâte, étaler en inclinant la poêle.'),
    (v_rid, 5, 'Cuire 1-2 min par face jusqu''à ce que la crêpe soit dorée. Garnir selon les envies : sucre, Nutella, citron, jambon-fromage…');

  -- ══════════════════════════════════════════════════════════
  -- 5. GRATIN DAUPHINOIS
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Gratin dauphinois', v_accomp, 75, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pommes de terre (type Bintje)', 1.2, 'kg', v_fruits, 0),
    (v_rid, 'Crème fraîche liquide', 40, 'cl', v_laitiers, 1),
    (v_rid, 'Lait', 30, 'cl', v_laitiers, 2),
    (v_rid, 'Ail', 2, 'gousse(s)', v_fruits, 3),
    (v_rid, 'Noix de muscade', 1, 'pincée', v_condiments, 4),
    (v_rid, 'Beurre', 20, 'g', v_laitiers, 5),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 6),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 7);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 150°C. Éplucher les pommes de terre et les couper en fines rondelles (2-3 mm). Ne pas les rincer, l''amidon est important.'),
    (v_rid, 1, 'Frotter un plat à gratin avec les gousses d''ail coupées en deux, puis le beurrer généreusement.'),
    (v_rid, 2, 'Disposer les rondelles de pommes de terre en couches, en assaisonnant chaque couche de sel, poivre et muscade.'),
    (v_rid, 3, 'Mélanger la crème et le lait, verser sur les pommes de terre. Le liquide doit arriver juste sous la dernière couche.'),
    (v_rid, 4, 'Enfourner pour 1h à 1h15 à 150°C. Le gratin est prêt quand les pommes de terre sont fondantes (tester avec la pointe d''un couteau) et le dessus doré.');

  -- ══════════════════════════════════════════════════════════
  -- 6. HACHIS PARMENTIER
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Hachis parmentier', v_plat, 60, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Viande hachée de bœuf', 600, 'g', v_viandes, 0),
    (v_rid, 'Pommes de terre', 1, 'kg', v_fruits, 1),
    (v_rid, 'Oignons', 2, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Ail', 2, 'gousse(s)', v_fruits, 3),
    (v_rid, 'Concentré de tomates', 2, 'c. à soupe', v_condiments, 4),
    (v_rid, 'Beurre', 50, 'g', v_laitiers, 5),
    (v_rid, 'Lait', 15, 'cl', v_laitiers, 6),
    (v_rid, 'Gruyère râpé', 100, 'g', v_laitiers, 7),
    (v_rid, 'Persil frais', 4, 'branche(s)', v_condiments, 8),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', v_condiments, 9),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 10),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 11);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher et couper les pommes de terre en morceaux. Les faire cuire 20 min dans de l''eau bouillante salée.'),
    (v_rid, 1, 'Pendant ce temps, émincer les oignons et l''ail. Les faire revenir dans l''huile d''olive jusqu''à ce qu''ils soient translucides.'),
    (v_rid, 2, 'Ajouter la viande hachée, la faire revenir en l''émiettant. Ajouter le concentré de tomates, le persil ciselé, saler et poivrer. Cuire 10 min.'),
    (v_rid, 3, 'Écraser les pommes de terre avec le beurre et le lait chaud. Assaisonner pour obtenir une purée lisse.'),
    (v_rid, 4, 'Préchauffer le four à 200°C. Étaler la viande dans un plat à gratin, recouvrir de purée en lissant avec une fourchette (faire des stries pour le croustillant).'),
    (v_rid, 5, 'Parsemer de gruyère râpé. Enfourner 20-25 minutes jusqu''à ce que le dessus soit bien doré.');

  -- ══════════════════════════════════════════════════════════
  -- 7. TARTIFLETTE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Tartiflette', v_plat, 60, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pommes de terre à chair ferme', 1, 'kg', v_fruits, 0),
    (v_rid, 'Reblochon', 1, 'pièce(s)', v_laitiers, 1),
    (v_rid, 'Lardons fumés', 200, 'g', v_viandes, 2),
    (v_rid, 'Oignons', 2, 'pièce(s)', v_fruits, 3),
    (v_rid, 'Crème fraîche', 10, 'cl', v_laitiers, 4),
    (v_rid, 'Vin blanc sec', 10, 'cl', v_boissons, 5),
    (v_rid, 'Beurre', 20, 'g', v_laitiers, 6),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 7),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 8);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Faire cuire les pommes de terre en robe des champs 20 minutes dans l''eau bouillante. Les éplucher et les couper en rondelles.'),
    (v_rid, 1, 'Faire revenir les lardons à sec, ajouter les oignons émincés et cuire jusqu''à ce qu''ils soient fondants.'),
    (v_rid, 2, 'Déglacer avec le vin blanc, laisser réduire 2 minutes.'),
    (v_rid, 3, 'Préchauffer le four à 200°C. Dans un plat à gratin beurré, alterner couches de pommes de terre et mélange lardons-oignons. Verser la crème.'),
    (v_rid, 4, 'Couper le reblochon en deux dans l''épaisseur. Le poser croûte vers le haut sur le gratin.'),
    (v_rid, 5, 'Enfourner 20-25 minutes jusqu''à ce que le reblochon soit bien fondu et doré.');

  -- ══════════════════════════════════════════════════════════
  -- 8. MOUSSE AU CHOCOLAT
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Mousse au chocolat', v_dessert, 30, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Chocolat noir pâtissier (min 70%)', 200, 'g', v_ep_sucree, 0),
    (v_rid, 'Œufs', 6, 'pièce(s)', v_laitiers, 1),
    (v_rid, 'Beurre', 20, 'g', v_laitiers, 2),
    (v_rid, 'Sucre en poudre', 30, 'g', v_ep_sucree, 3),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 4);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Faire fondre le chocolat cassé en morceaux avec le beurre au bain-marie (ou micro-ondes par tranches de 30 sec). Laisser tiédir.'),
    (v_rid, 1, 'Séparer les blancs des jaunes. Ajouter les jaunes un par un au chocolat tiédi en mélangeant bien.'),
    (v_rid, 2, 'Monter les blancs en neige très ferme avec une pincée de sel. Quand ils sont fermes, ajouter le sucre et fouetter encore 30 secondes.'),
    (v_rid, 3, 'Incorporer délicatement 1/3 des blancs au chocolat pour détendre le mélange, puis le reste en soulevant la masse avec une spatule.'),
    (v_rid, 4, 'Répartir dans des verrines ou ramequins. Filmer et réfrigérer au moins 4h (une nuit c''est encore mieux).');

  -- ══════════════════════════════════════════════════════════
  -- 9. PÂTES CARBONARA
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Pâtes à la carbonara', v_plat, 25, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Spaghetti', 400, 'g', v_ep_salee, 0),
    (v_rid, 'Guanciale (ou lardons)', 200, 'g', v_viandes, 1),
    (v_rid, 'Jaunes d''œufs', 4, 'pièce(s)', v_laitiers, 2),
    (v_rid, 'Pecorino Romano râpé', 80, 'g', v_laitiers, 3),
    (v_rid, 'Parmesan râpé', 40, 'g', v_laitiers, 4),
    (v_rid, 'Poivre noir du moulin', 1, 'pincée', v_condiments, 5);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Faire bouillir un grand volume d''eau salée et cuire les spaghetti al dente (1 min de moins que ce qu''indique le paquet).'),
    (v_rid, 1, 'Pendant ce temps, couper le guanciale en petits lardons. Le faire rissoler à sec dans une poêle à feu moyen jusqu''à ce qu''il soit croustillant.'),
    (v_rid, 2, 'Dans un bol, mélanger les jaunes d''œufs avec le pecorino, le parmesan et une bonne dose de poivre noir.'),
    (v_rid, 3, 'Égoutter les pâtes en réservant une tasse d''eau de cuisson. Hors du feu, verser les pâtes dans la poêle avec le guanciale.'),
    (v_rid, 4, 'Toujours hors du feu (important !), verser le mélange œufs-fromage et remuer vigoureusement. Ajouter un peu d''eau de cuisson si trop épais. Servir immédiatement.');

  -- ══════════════════════════════════════════════════════════
  -- 10. SOUPE À L'OIGNON
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Soupe à l''oignon gratinée', v_entree, 50, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Oignons jaunes', 6, 'pièce(s)', v_fruits, 0),
    (v_rid, 'Beurre', 40, 'g', v_laitiers, 1),
    (v_rid, 'Farine', 1, 'c. à soupe', v_ep_salee, 2),
    (v_rid, 'Bouillon de bœuf', 1, 'L', v_ep_salee, 3),
    (v_rid, 'Vin blanc sec', 15, 'cl', v_boissons, 4),
    (v_rid, 'Pain de campagne rassis', 4, 'tranche(s)', v_ep_salee, 5),
    (v_rid, 'Gruyère râpé', 150, 'g', v_laitiers, 6),
    (v_rid, 'Thym', 2, 'branche(s)', v_condiments, 7),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 8),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 9);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Émincer finement les oignons. Faire fondre le beurre dans une grande casserole et y cuire les oignons à feu doux 25-30 min en remuant régulièrement, jusqu''à ce qu''ils soient bien caramélisés.'),
    (v_rid, 1, 'Ajouter la farine, mélanger 1 minute. Déglacer au vin blanc et laisser réduire.'),
    (v_rid, 2, 'Verser le bouillon, ajouter le thym. Porter à ébullition puis laisser mijoter 15 minutes. Saler et poivrer.'),
    (v_rid, 3, 'Répartir la soupe dans des bols allant au four. Poser une tranche de pain, couvrir généreusement de gruyère.'),
    (v_rid, 4, 'Passer sous le grill du four 3-5 minutes jusqu''à ce que le fromage soit fondu et doré. Servir brûlant.');

  -- ══════════════════════════════════════════════════════════
  -- 11. RATATOUILLE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Ratatouille', v_accomp, 60, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Courgettes', 3, 'pièce(s)', v_fruits, 0),
    (v_rid, 'Aubergines', 2, 'pièce(s)', v_fruits, 1),
    (v_rid, 'Poivrons (rouge et jaune)', 2, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Tomates bien mûres', 4, 'pièce(s)', v_fruits, 3),
    (v_rid, 'Oignon', 2, 'pièce(s)', v_fruits, 4),
    (v_rid, 'Ail', 3, 'gousse(s)', v_fruits, 5),
    (v_rid, 'Huile d''olive', 6, 'c. à soupe', v_condiments, 6),
    (v_rid, 'Herbes de Provence', 2, 'c. à café', v_condiments, 7),
    (v_rid, 'Basilic frais', 8, 'feuille(s)', v_condiments, 8),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 9),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 10);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Laver et couper tous les légumes en cubes d''environ 2 cm. Couper les oignons en demi-lunes et émincer l''ail.'),
    (v_rid, 1, 'Faire revenir séparément dans l''huile d''olive : d''abord les aubergines (5 min), puis les courgettes (3 min), puis les poivrons (3 min). Réserver chaque légume.'),
    (v_rid, 2, 'Dans la même cocotte, faire revenir les oignons 5 min, ajouter l''ail, puis les tomates coupées. Cuire 5 min.'),
    (v_rid, 3, 'Remettre tous les légumes dans la cocotte, ajouter les herbes de Provence. Saler, poivrer.'),
    (v_rid, 4, 'Couvrir et laisser mijoter à feu doux 30-40 min en remuant doucement de temps en temps. Les légumes doivent être fondants.'),
    (v_rid, 5, 'Parsemer de basilic frais ciselé. Se déguste chaude, tiède ou froide.');

  -- ══════════════════════════════════════════════════════════
  -- 12. TARTE AUX POMMES
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Tarte aux pommes', v_dessert, 50, 8, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pâte feuilletée', 1, 'pièce(s)', v_ep_salee, 0),
    (v_rid, 'Pommes (Golden ou Reinette)', 6, 'pièce(s)', v_fruits, 1),
    (v_rid, 'Compote de pommes', 200, 'g', v_ep_sucree, 2),
    (v_rid, 'Sucre en poudre', 40, 'g', v_ep_sucree, 3),
    (v_rid, 'Beurre', 30, 'g', v_laitiers, 4),
    (v_rid, 'Cannelle', 1, 'c. à café', v_condiments, 5),
    (v_rid, 'Confiture d''abricot (pour le glaçage)', 3, 'c. à soupe', v_ep_sucree, 6);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200°C. Dérouler la pâte feuilletée dans un moule à tarte.'),
    (v_rid, 1, 'Étaler la compote de pommes sur le fond de pâte.'),
    (v_rid, 2, 'Éplucher les pommes, les couper en fines lamelles. Les disposer en rosace sur la compote, en les faisant se chevaucher.'),
    (v_rid, 3, 'Saupoudrer de sucre et de cannelle. Parsemer de petits morceaux de beurre.'),
    (v_rid, 4, 'Enfourner 30-35 minutes jusqu''à ce que les pommes soient dorées et la pâte croustillante.'),
    (v_rid, 5, 'À la sortie du four, chauffer la confiture d''abricot avec une cuillère d''eau et badigeonner la tarte pour la faire briller.');

  -- ══════════════════════════════════════════════════════════
  -- 13. FONDANT AU CHOCOLAT
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Fondant au chocolat', v_dessert, 30, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Chocolat noir', 200, 'g', v_ep_sucree, 0),
    (v_rid, 'Beurre', 150, 'g', v_laitiers, 1),
    (v_rid, 'Sucre en poudre', 150, 'g', v_ep_sucree, 2),
    (v_rid, 'Œufs', 4, 'pièce(s)', v_laitiers, 3),
    (v_rid, 'Farine', 50, 'g', v_ep_salee, 4);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 180°C. Beurrer et fariner un moule à manqué.'),
    (v_rid, 1, 'Faire fondre le chocolat et le beurre ensemble au bain-marie. Laisser tiédir.'),
    (v_rid, 2, 'Fouetter les œufs et le sucre jusqu''à ce que le mélange blanchisse et double de volume.'),
    (v_rid, 3, 'Incorporer le chocolat fondu, puis la farine tamisée en mélangeant délicatement.'),
    (v_rid, 4, 'Verser dans le moule et enfourner 20-25 minutes. Le centre doit rester légèrement tremblotant. Laisser tiédir 10 min avant de démouler.');

  -- ══════════════════════════════════════════════════════════
  -- 14. SAUMON EN PAPILLOTE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Saumon en papillote', v_plat, 30, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pavés de saumon', 4, 'pièce(s)', v_viandes, 0),
    (v_rid, 'Courgette', 1, 'pièce(s)', v_fruits, 1),
    (v_rid, 'Tomates cerises', 12, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Citron', 1, 'pièce(s)', v_fruits, 3),
    (v_rid, 'Aneth frais', 4, 'branche(s)', v_condiments, 4),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', v_condiments, 5),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 6),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 7);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préchauffer le four à 200°C. Préparer 4 grandes feuilles de papier cuisson.'),
    (v_rid, 1, 'Couper la courgette en fines rondelles. Couper les tomates cerises en deux. Couper le citron en rondelles fines.'),
    (v_rid, 2, 'Sur chaque feuille, déposer un lit de rondelles de courgette, puis un pavé de saumon. Ajouter les tomates cerises, une rondelle de citron et une branche d''aneth.'),
    (v_rid, 3, 'Arroser d''un filet d''huile d''olive, saler et poivrer. Fermer les papillotes en les pliant hermétiquement.'),
    (v_rid, 4, 'Enfourner 15-18 minutes. Le saumon doit être juste cuit (rosé au centre). Servir dans la papillote ouverte avec du riz.');

  -- ══════════════════════════════════════════════════════════
  -- 15. VELOUTÉ DE POTIRON
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Velouté de potiron', v_entree, 40, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Potiron (ou butternut)', 800, 'g', v_fruits, 0),
    (v_rid, 'Pomme de terre', 1, 'pièce(s)', v_fruits, 1),
    (v_rid, 'Oignon', 1, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Crème fraîche', 10, 'cl', v_laitiers, 3),
    (v_rid, 'Bouillon de volaille', 60, 'cl', v_ep_salee, 4),
    (v_rid, 'Beurre', 20, 'g', v_laitiers, 5),
    (v_rid, 'Noix de muscade', 1, 'pincée', v_condiments, 6),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 7),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 8);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Éplucher et couper le potiron en cubes, la pomme de terre en morceaux, et émincer l''oignon.'),
    (v_rid, 1, 'Faire fondre le beurre dans une cocotte, y faire suer l''oignon 3-4 min sans colorer.'),
    (v_rid, 2, 'Ajouter les cubes de potiron et la pomme de terre. Verser le bouillon, porter à ébullition.'),
    (v_rid, 3, 'Couvrir et laisser cuire 20-25 min à feu moyen jusqu''à ce que les légumes soient bien tendres.'),
    (v_rid, 4, 'Mixer au plongeur jusqu''à obtenir un velouté bien lisse. Ajouter la crème, la muscade, saler et poivrer.'),
    (v_rid, 5, 'Servir chaud avec des croûtons grillés et une touche de crème fraîche.');

  -- ══════════════════════════════════════════════════════════
  -- 16. LASAGNES BOLOGNAISE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Lasagnes bolognaise', v_plat, 90, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Feuilles de lasagne', 12, 'pièce(s)', v_ep_salee, 0),
    (v_rid, 'Viande hachée de bœuf', 500, 'g', v_viandes, 1),
    (v_rid, 'Coulis de tomates', 500, 'g', v_ep_salee, 2),
    (v_rid, 'Oignon', 1, 'pièce(s)', v_fruits, 3),
    (v_rid, 'Carottes', 2, 'pièce(s)', v_fruits, 4),
    (v_rid, 'Ail', 2, 'gousse(s)', v_fruits, 5),
    (v_rid, 'Beurre', 60, 'g', v_laitiers, 6),
    (v_rid, 'Farine', 60, 'g', v_ep_salee, 7),
    (v_rid, 'Lait', 75, 'cl', v_laitiers, 8),
    (v_rid, 'Gruyère râpé', 150, 'g', v_laitiers, 9),
    (v_rid, 'Noix de muscade', 1, 'pincée', v_condiments, 10),
    (v_rid, 'Herbes de Provence', 1, 'c. à café', v_condiments, 11),
    (v_rid, 'Huile d''olive', 2, 'c. à soupe', v_condiments, 12),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 13),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 14);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préparer la bolognaise : émincer oignon, ail et carottes. Faire revenir dans l''huile d''olive, ajouter la viande hachée et la faire dorer.'),
    (v_rid, 1, 'Ajouter le coulis de tomates, les herbes de Provence, saler et poivrer. Laisser mijoter 30 min à feu doux.'),
    (v_rid, 2, 'Préparer la béchamel : faire fondre le beurre, ajouter la farine d''un coup et mélanger 2 min. Verser le lait froid petit à petit en fouettant. Cuire jusqu''à épaississement. Ajouter muscade, sel, poivre.'),
    (v_rid, 3, 'Préchauffer le four à 180°C. Dans un plat à gratin, alterner : béchamel, feuilles de lasagne, bolognaise. Répéter 3-4 fois.'),
    (v_rid, 4, 'Terminer par une couche de béchamel et couvrir de gruyère râpé.'),
    (v_rid, 5, 'Enfourner 35-40 minutes jusqu''à ce que le dessus soit bien gratiné. Laisser reposer 10 min avant de servir.');

  -- ══════════════════════════════════════════════════════════
  -- 17. SALADE NIÇOISE
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Salade niçoise', v_entree, 20, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Thon en boîte', 2, 'boîte(s)', v_ep_salee, 0),
    (v_rid, 'Œufs', 4, 'pièce(s)', v_laitiers, 1),
    (v_rid, 'Tomates', 3, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Haricots verts', 200, 'g', v_fruits, 3),
    (v_rid, 'Olives noires', 80, 'g', v_condiments, 4),
    (v_rid, 'Anchois', 8, 'filet(s)', v_ep_salee, 5),
    (v_rid, 'Poivron vert', 1, 'pièce(s)', v_fruits, 6),
    (v_rid, 'Oignon rouge', 1, 'pièce(s)', v_fruits, 7),
    (v_rid, 'Huile d''olive', 4, 'c. à soupe', v_condiments, 8),
    (v_rid, 'Vinaigre de vin', 1, 'c. à soupe', v_condiments, 9),
    (v_rid, 'Basilic frais', 6, 'feuille(s)', v_condiments, 10),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 11),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 12);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Faire cuire les œufs durs (10 min dans l''eau bouillante). Les refroidir et les écaler. Cuire les haricots verts croquants à l''eau salée (7 min) puis les rafraîchir.'),
    (v_rid, 1, 'Couper les tomates en quartiers, le poivron en lamelles, l''oignon en fines rondelles.'),
    (v_rid, 2, 'Préparer la vinaigrette : mélanger huile d''olive, vinaigre, sel et poivre.'),
    (v_rid, 3, 'Dresser dans un grand plat : disposer les haricots verts, les tomates, le poivron, l''oignon. Émietter le thon par-dessus. Ajouter les olives, les anchois et les œufs coupés en quartiers.'),
    (v_rid, 4, 'Arroser de vinaigrette et parsemer de basilic frais. Servir aussitôt.');

  -- ══════════════════════════════════════════════════════════
  -- 18. CROQUE-MONSIEUR
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Croque-monsieur', v_plat, 20, 4, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Pain de mie', 8, 'tranche(s)', v_ep_salee, 0),
    (v_rid, 'Jambon blanc', 4, 'tranche(s)', v_viandes, 1),
    (v_rid, 'Gruyère râpé', 200, 'g', v_laitiers, 2),
    (v_rid, 'Beurre', 40, 'g', v_laitiers, 3),
    (v_rid, 'Farine', 20, 'g', v_ep_salee, 4),
    (v_rid, 'Lait', 25, 'cl', v_laitiers, 5),
    (v_rid, 'Noix de muscade', 1, 'pincée', v_condiments, 6),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 7),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 8);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Préparer la béchamel : faire fondre le beurre, ajouter la farine et remuer 1 min. Verser le lait froid progressivement en fouettant. Cuire jusqu''à épaississement. Assaisonner de muscade, sel et poivre.'),
    (v_rid, 1, 'Étaler une fine couche de béchamel sur chaque tranche de pain.'),
    (v_rid, 2, 'Sur 4 tranches : poser une tranche de jambon, une couche de gruyère. Refermer avec les 4 autres tranches.'),
    (v_rid, 3, 'Napper le dessus d''une cuillère de béchamel et saupoudrer de gruyère râpé.'),
    (v_rid, 4, 'Enfourner sous le grill 5-8 minutes ou cuire au four à 200°C pendant 10-12 min, jusqu''à ce que le fromage soit fondu et doré.');

  -- ══════════════════════════════════════════════════════════
  -- 19. BLANQUETTE DE VEAU
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Blanquette de veau', v_plat, 120, 6, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Épaule ou tendron de veau', 1.2, 'kg', v_viandes, 0),
    (v_rid, 'Carottes', 4, 'pièce(s)', v_fruits, 1),
    (v_rid, 'Poireaux', 2, 'pièce(s)', v_fruits, 2),
    (v_rid, 'Oignon piqué de clous de girofle', 1, 'pièce(s)', v_fruits, 3),
    (v_rid, 'Champignons de Paris', 250, 'g', v_fruits, 4),
    (v_rid, 'Crème fraîche épaisse', 20, 'cl', v_laitiers, 5),
    (v_rid, 'Jaunes d''œufs', 2, 'pièce(s)', v_laitiers, 6),
    (v_rid, 'Citron', 1, 'pièce(s)', v_fruits, 7),
    (v_rid, 'Bouquet garni', 1, 'pièce(s)', v_condiments, 8),
    (v_rid, 'Beurre', 30, 'g', v_laitiers, 9),
    (v_rid, 'Farine', 30, 'g', v_ep_salee, 10),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 11),
    (v_rid, 'Poivre blanc', 1, 'pincée', v_condiments, 12);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Couper le veau en morceaux. Les mettre dans une cocotte, couvrir d''eau froide et porter à ébullition. Écumer soigneusement.'),
    (v_rid, 1, 'Ajouter les carottes en rondelles, les poireaux en tronçons, l''oignon piqué et le bouquet garni. Saler. Laisser mijoter à feu doux 1h30.'),
    (v_rid, 2, 'Faire sauter les champignons dans du beurre. Réserver. Sortir la viande et les légumes, filtrer le bouillon.'),
    (v_rid, 3, 'Préparer un roux blanc : fondre le beurre, ajouter la farine, cuire 2 min sans colorer. Mouiller avec le bouillon petit à petit en fouettant. Laisser épaissir 10 min.'),
    (v_rid, 4, 'Hors du feu, mélanger la crème et les jaunes d''œufs. Les incorporer à la sauce en remuant (ne plus faire bouillir !). Ajouter un filet de jus de citron.'),
    (v_rid, 5, 'Remettre la viande, les légumes et les champignons dans la sauce. Réchauffer doucement. Servir avec du riz basmati.');

  -- ══════════════════════════════════════════════════════════
  -- 20. OMELETTE AUX CHAMPIGNONS
  -- ══════════════════════════════════════════════════════════
  INSERT INTO recipes (family_id, title, category_id, prep_time_min, default_portions, created_by)
  VALUES (v_family_id, 'Omelette aux champignons', v_plat, 15, 2, v_user_id)
  RETURNING id INTO v_rid;

  INSERT INTO recipe_ingredients (recipe_id, name, quantity, unit, shopping_category_id, position) VALUES
    (v_rid, 'Œufs', 6, 'pièce(s)', v_laitiers, 0),
    (v_rid, 'Champignons de Paris', 200, 'g', v_fruits, 1),
    (v_rid, 'Beurre', 30, 'g', v_laitiers, 2),
    (v_rid, 'Persil frais', 4, 'branche(s)', v_condiments, 3),
    (v_rid, 'Ail', 1, 'gousse(s)', v_fruits, 4),
    (v_rid, 'Sel', 1, 'pincée', v_condiments, 5),
    (v_rid, 'Poivre', 1, 'pincée', v_condiments, 6);

  INSERT INTO recipe_steps (recipe_id, position, instruction) VALUES
    (v_rid, 0, 'Nettoyer et émincer les champignons. Émincer l''ail, ciseler le persil.'),
    (v_rid, 1, 'Faire sauter les champignons dans la moitié du beurre à feu vif 5 minutes. Ajouter l''ail et le persil en fin de cuisson. Réserver.'),
    (v_rid, 2, 'Battre les œufs dans un bol avec du sel et du poivre. Ne pas trop battre, juste mélanger jaunes et blancs.'),
    (v_rid, 3, 'Faire fondre le reste du beurre dans une grande poêle à feu moyen-vif. Quand il mousse, verser les œufs.'),
    (v_rid, 4, 'Remuer doucement avec une spatule en ramenant les bords vers le centre. Quand l''omelette est encore baveuse, ajouter les champignons sur une moitié.'),
    (v_rid, 5, 'Replier l''omelette et la faire glisser dans l''assiette. Servir immédiatement avec une salade verte.');

  RAISE NOTICE '✅ 20 recettes insérées avec succès !';
END;
$$;
