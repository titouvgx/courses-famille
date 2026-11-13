-- ============================================================
-- Migration : enrichissement de known_ingredients (~250 produits)
-- ============================================================
-- Objet : compléter la base d'autocomplétion du formulaire de recette
-- et de la liste de courses avec des produits courants d'un foyer
-- français absents de la migration 20261112200000_known_ingredients :
-- fruits & légumes, viandes & poissons, crèmerie, épicerie salée et
-- sucrée, épices, surgelés, boissons, et quelques produits d'hygiène /
-- d'entretien (la liste de courses sert aussi à ça). Inclut les
-- ingrédients des recettes de démo (seed_recipes) qui manquaient.
--
-- Conventions reprises de l'existant : majuscule initiale seulement,
-- singulier pour les produits frais comptés à l'unité, unités par
-- défaut parmi les libellés déjà utilisés (g, cl, pièce, botte,
-- tranche, boîte, sachet, c. à café, pincée), NULL quand le produit
-- n'a pas d'unité naturelle (entretien, hygiène…).
--
-- Rayon : désigné par son NOM (jointure sur shopping_categories.name),
-- jamais par uuid. Si un nom de rayon est introuvable (rayon renommé
-- ou supprimé), la migration échoue avec une erreur explicite au lieu
-- d'insérer des ingrédients sans rayon en silence.
--
-- Idempotente : INSERT … ON CONFLICT (name) DO NOTHING. Relancée, elle
-- n'ajoute rien et ne modifie aucune ligne existante. Aucun DROP,
-- DELETE ni UPDATE ; les règles RLS de la table ne sont pas touchées.
-- ============================================================

DO $$
DECLARE
  v_missing  text;
  v_inserted integer;
BEGIN
  WITH data(name, default_unit, rayon) AS (
    VALUES

    -- ══════════ FRUITS & LÉGUMES ══════════
    ('Abricot', 'pièce', 'Fruits & légumes'),
    ('Aneth frais', 'botte', 'Fruits & légumes'),
    ('Blette', 'botte', 'Fruits & légumes'),
    ('Butternut', 'pièce', 'Fruits & légumes'),
    ('Cerfeuil', 'botte', 'Fruits & légumes'),
    ('Châtaigne', 'g', 'Fruits & légumes'),
    ('Chou kale', 'g', 'Fruits & légumes'),
    ('Chou romanesco', 'pièce', 'Fruits & légumes'),
    ('Chou vert', 'pièce', 'Fruits & légumes'),
    ('Cresson', 'botte', 'Fruits & légumes'),
    ('Épi de maïs', 'pièce', 'Fruits & légumes'),
    ('Estragon', 'botte', 'Fruits & légumes'),
    ('Fèves', 'g', 'Fruits & légumes'),
    ('Figue', 'pièce', 'Fruits & légumes'),
    ('Fruit de la passion', 'pièce', 'Fruits & légumes'),
    ('Girolle', 'g', 'Fruits & légumes'),
    ('Grenade', 'pièce', 'Fruits & légumes'),
    ('Mandarine', 'pièce', 'Fruits & légumes'),
    ('Mesclun', 'g', 'Fruits & légumes'),
    ('Mûre', 'g', 'Fruits & légumes'),
    ('Oignon nouveau', 'botte', 'Fruits & légumes'),
    ('Piment frais', 'pièce', 'Fruits & légumes'),
    ('Pleurote', 'g', 'Fruits & légumes'),
    ('Poivron jaune', 'pièce', 'Fruits & légumes'),
    ('Poivron rouge', 'pièce', 'Fruits & légumes'),
    ('Poivron vert', 'pièce', 'Fruits & légumes'),
    ('Pois gourmands', 'g', 'Fruits & légumes'),
    ('Pomme de terre à chair ferme', 'g', 'Fruits & légumes'),
    ('Pomme de terre grenaille', 'g', 'Fruits & légumes'),
    ('Pousses d''épinard', 'g', 'Fruits & légumes'),
    ('Pousses de soja', 'g', 'Fruits & légumes'),
    ('Prune', 'g', 'Fruits & légumes'),
    ('Rhubarbe', 'g', 'Fruits & légumes'),
    ('Salade batavia', 'pièce', 'Fruits & légumes'),
    ('Salade frisée', 'pièce', 'Fruits & légumes'),
    ('Sauge fraîche', 'botte', 'Fruits & légumes'),
    ('Sucrine', 'pièce', 'Fruits & légumes'),
    ('Tomate cœur de bœuf', 'pièce', 'Fruits & légumes'),

    -- ══════════ VIANDES & POISSONS ══════════
    ('Aiguillette de poulet', 'g', 'Viandes & poissons'),
    ('Pilon de poulet', 'pièce', 'Viandes & poissons'),
    ('Cuisse de canard', 'pièce', 'Viandes & poissons'),
    ('Rôti de dinde', 'g', 'Viandes & poissons'),
    ('Cordon bleu', 'pièce', 'Viandes & poissons'),
    ('Bœuf à braiser', 'g', 'Viandes & poissons'),
    ('Viande hachée de bœuf', 'g', 'Viandes & poissons'),
    ('Bavette', 'pièce', 'Viandes & poissons'),
    ('Faux-filet', 'pièce', 'Viandes & poissons'),
    ('Côte de bœuf', 'pièce', 'Viandes & poissons'),
    ('Viande à pot-au-feu', 'g', 'Viandes & poissons'),
    ('Rôti de porc', 'g', 'Viandes & poissons'),
    ('Sauté de porc', 'g', 'Viandes & poissons'),
    ('Poitrine fumée', 'g', 'Viandes & poissons'),
    ('Lardons fumés', 'g', 'Viandes & poissons'),
    ('Guanciale', 'g', 'Viandes & poissons'),
    ('Saucisse de Toulouse', 'pièce', 'Viandes & poissons'),
    ('Saucisse de Strasbourg', 'pièce', 'Viandes & poissons'),
    ('Saucisson sec', 'pièce', 'Viandes & poissons'),
    ('Chorizo', 'g', 'Viandes & poissons'),
    ('Pâté de campagne', 'g', 'Viandes & poissons'),
    ('Rillettes', 'g', 'Viandes & poissons'),
    ('Blanc de dinde', 'tranche', 'Viandes & poissons'),
    ('Veau (blanquette)', 'g', 'Viandes & poissons'),
    ('Paupiette de veau', 'pièce', 'Viandes & poissons'),
    ('Agneau (épaule)', 'g', 'Viandes & poissons'),
    ('Pavé de saumon', 'pièce', 'Viandes & poissons'),
    ('Lieu noir', 'g', 'Viandes & poissons'),
    ('Merlu', 'g', 'Viandes & poissons'),
    ('Maquereau', 'pièce', 'Viandes & poissons'),
    ('Truite fumée', 'tranche', 'Viandes & poissons'),
    ('Noix de Saint-Jacques', 'g', 'Viandes & poissons'),
    ('Calamar', 'g', 'Viandes & poissons'),
    ('Huître', 'pièce', 'Viandes & poissons'),
    ('Gambas', 'g', 'Viandes & poissons'),
    ('Surimi', 'g', 'Viandes & poissons'),

    -- ══════════ PRODUITS LAITIERS & ŒUFS ══════════
    ('Crème fraîche épaisse', 'cl', 'Produits laitiers & œufs'),
    ('Crème chantilly', 'pièce', 'Produits laitiers & œufs'),
    ('Lait entier', 'cl', 'Produits laitiers & œufs'),
    ('Lait d''avoine', 'cl', 'Produits laitiers & œufs'),
    ('Jaune d''œuf', 'pièce', 'Produits laitiers & œufs'),
    ('Emmental râpé', 'g', 'Produits laitiers & œufs'),
    ('Gruyère râpé', 'g', 'Produits laitiers & œufs'),
    ('Parmesan râpé', 'g', 'Produits laitiers & œufs'),
    ('Pecorino', 'g', 'Produits laitiers & œufs'),
    ('Feta', 'g', 'Produits laitiers & œufs'),
    ('Burrata', 'pièce', 'Produits laitiers & œufs'),
    ('Crottin de chèvre', 'pièce', 'Produits laitiers & œufs'),
    ('Brie', 'g', 'Produits laitiers & œufs'),
    ('Reblochon', 'pièce', 'Produits laitiers & œufs'),
    ('Fromage à raclette', 'g', 'Produits laitiers & œufs'),
    ('Tomme de Savoie', 'g', 'Produits laitiers & œufs'),
    ('Cantal', 'g', 'Produits laitiers & œufs'),
    ('Beaufort', 'g', 'Produits laitiers & œufs'),
    ('Mimolette', 'g', 'Produits laitiers & œufs'),
    ('Cheddar', 'g', 'Produits laitiers & œufs'),
    ('Fromage frais à tartiner', 'g', 'Produits laitiers & œufs'),
    ('Petit-suisse', 'pièce', 'Produits laitiers & œufs'),
    ('Faisselle', 'pièce', 'Produits laitiers & œufs'),
    ('Skyr', 'pièce', 'Produits laitiers & œufs'),
    ('Yaourt aux fruits', 'pièce', 'Produits laitiers & œufs'),
    ('Crème dessert', 'pièce', 'Produits laitiers & œufs'),
    ('Tofu', 'g', 'Produits laitiers & œufs'),

    -- ══════════ ÉPICERIE SALÉE ══════════
    ('Fusilli', 'g', 'Épicerie salée'),
    ('Farfalle', 'g', 'Épicerie salée'),
    ('Coquillettes', 'g', 'Épicerie salée'),
    ('Macaroni', 'g', 'Épicerie salée'),
    ('Ravioli', 'g', 'Épicerie salée'),
    ('Tortellini', 'g', 'Épicerie salée'),
    ('Riz arborio', 'g', 'Épicerie salée'),
    ('Riz complet', 'g', 'Épicerie salée'),
    ('Riz rond', 'g', 'Épicerie salée'),
    ('Polenta', 'g', 'Épicerie salée'),
    ('Blé précuit', 'g', 'Épicerie salée'),
    ('Purée en flocons', 'g', 'Épicerie salée'),
    ('Flageolets', 'g', 'Épicerie salée'),
    ('Farine de sarrasin', 'g', 'Épicerie salée'),
    ('Fécule de pomme de terre', 'g', 'Épicerie salée'),
    ('Pulpe de tomate', 'g', 'Épicerie salée'),
    ('Tomates séchées', 'g', 'Épicerie salée'),
    ('Haricots verts en conserve', 'boîte', 'Épicerie salée'),
    ('Petits pois en conserve', 'boîte', 'Épicerie salée'),
    ('Champignons en conserve', 'boîte', 'Épicerie salée'),
    ('Cœurs d''artichaut', 'boîte', 'Épicerie salée'),
    ('Maquereaux en conserve', 'boîte', 'Épicerie salée'),
    ('Anchois', 'pièce', 'Épicerie salée'),
    ('Fond de veau', 'g', 'Épicerie salée'),
    ('Sauce huître', 'cl', 'Épicerie salée'),
    ('Pain de campagne', 'pièce', 'Épicerie salée'),
    ('Baguette', 'pièce', 'Épicerie salée'),
    ('Pain à burger', 'pièce', 'Épicerie salée'),
    ('Croûtons', 'g', 'Épicerie salée'),
    ('Chips', 'g', 'Épicerie salée'),
    ('Cacahuètes', 'g', 'Épicerie salée'),
    ('Biscuits apéritif', 'g', 'Épicerie salée'),

    -- ══════════ ÉPICERIE SUCRÉE ══════════
    ('Sucre en morceaux', 'g', 'Épicerie sucrée'),
    ('Caramel liquide', 'cl', 'Épicerie sucrée'),
    ('Lait concentré sucré', 'g', 'Épicerie sucrée'),
    ('Amandes effilées', 'g', 'Épicerie sucrée'),
    ('Poudre de noisette', 'g', 'Épicerie sucrée'),
    ('Pâte d''amande', 'g', 'Épicerie sucrée'),
    ('Eau de fleur d''oranger', 'cl', 'Épicerie sucrée'),
    ('Bicarbonate de soude', 'g', 'Épicerie sucrée'),
    ('Chocolat en poudre', 'g', 'Épicerie sucrée'),
    ('Céréales du petit-déjeuner', 'g', 'Épicerie sucrée'),
    ('Muesli', 'g', 'Épicerie sucrée'),
    ('Biscottes', 'pièce', 'Épicerie sucrée'),
    ('Pain d''épices', 'pièce', 'Épicerie sucrée'),
    ('Brioche', 'pièce', 'Épicerie sucrée'),
    ('Pain au lait', 'pièce', 'Épicerie sucrée'),
    ('Madeleines', 'pièce', 'Épicerie sucrée'),
    ('Petits-beurre', 'g', 'Épicerie sucrée'),
    ('Cookies', 'g', 'Épicerie sucrée'),
    ('Barres de céréales', 'pièce', 'Épicerie sucrée'),
    ('Compote en gourde', 'pièce', 'Épicerie sucrée'),
    ('Confiture d''abricot', 'g', 'Épicerie sucrée'),
    ('Confiture de fraise', 'g', 'Épicerie sucrée'),
    ('Crème de marrons', 'g', 'Épicerie sucrée'),
    ('Beurre de cacahuète', 'g', 'Épicerie sucrée'),
    ('Pruneaux', 'g', 'Épicerie sucrée'),
    ('Abricots secs', 'g', 'Épicerie sucrée'),
    ('Dattes', 'g', 'Épicerie sucrée'),
    ('Figues sèches', 'g', 'Épicerie sucrée'),
    ('Pignons de pin', 'g', 'Épicerie sucrée'),
    ('Bonbons', 'g', 'Épicerie sucrée'),

    -- ══════════ CONDIMENTS & ÉPICES ══════════
    ('Gros sel', 'g', 'Condiments & épices'),
    ('Poivre blanc', 'g', 'Condiments & épices'),
    ('Poivre noir en grains', 'g', 'Condiments & épices'),
    ('Vinaigre blanc', 'cl', 'Condiments & épices'),
    ('Vinaigre de Xérès', 'cl', 'Condiments & épices'),
    ('Crème de balsamique', 'cl', 'Condiments & épices'),
    ('Huile de noix', 'cl', 'Condiments & épices'),
    ('Huile d''arachide', 'cl', 'Condiments & épices'),
    ('Huile de coco', 'g', 'Condiments & épices'),
    ('Vinaigrette', 'cl', 'Condiments & épices'),
    ('Sauce barbecue', 'g', 'Condiments & épices'),
    ('Tapenade', 'g', 'Condiments & épices'),
    ('Pâte de curry', 'g', 'Condiments & épices'),
    ('Tahini', 'g', 'Condiments & épices'),
    ('Oignons frits', 'g', 'Condiments & épices'),
    ('Bouquet garni', 'pièce', 'Condiments & épices'),
    ('Clou de girofle', 'pièce', 'Condiments & épices'),
    ('Badiane', 'pièce', 'Condiments & épices'),
    ('Cardamome', 'c. à café', 'Condiments & épices'),
    ('Gingembre en poudre', 'c. à café', 'Condiments & épices'),
    ('Ail en poudre', 'c. à café', 'Condiments & épices'),
    ('Paprika fumé', 'c. à café', 'Condiments & épices'),
    ('Piment de Cayenne', 'c. à café', 'Condiments & épices'),
    ('Quatre-épices', 'c. à café', 'Condiments & épices'),
    ('Graines de fenouil', 'c. à café', 'Condiments & épices'),
    ('Tandoori', 'c. à café', 'Condiments & épices'),
    ('Épices à couscous', 'c. à café', 'Condiments & épices'),
    ('Persil séché', 'c. à café', 'Condiments & épices'),
    ('Romarin séché', 'c. à café', 'Condiments & épices'),
    ('Safran', 'pincée', 'Condiments & épices'),

    -- ══════════ SURGELÉS ══════════
    ('Brocolis surgelés', 'g', 'Surgelés'),
    ('Herbes surgelées', 'g', 'Surgelés'),
    ('Oignons émincés surgelés', 'g', 'Surgelés'),
    ('Pommes noisettes surgelées', 'g', 'Surgelés'),
    ('Potatoes surgelées', 'g', 'Surgelés'),
    ('Poisson pané', 'pièce', 'Surgelés'),
    ('Filets de cabillaud surgelés', 'g', 'Surgelés'),
    ('Pavés de saumon surgelés', 'pièce', 'Surgelés'),
    ('Moules surgelées', 'g', 'Surgelés'),
    ('Fruits de mer surgelés', 'g', 'Surgelés'),
    ('Nuggets de poulet', 'g', 'Surgelés'),
    ('Steak haché surgelé', 'pièce', 'Surgelés'),
    ('Pizza surgelée', 'pièce', 'Surgelés'),
    ('Glace chocolat', 'cl', 'Surgelés'),
    ('Sorbet', 'cl', 'Surgelés'),
    ('Glaçons', 'sachet', 'Surgelés'),

    -- ══════════ BOISSONS ══════════
    ('Eau minérale', 'cl', 'Boissons'),
    ('Jus de pomme', 'cl', 'Boissons'),
    ('Jus multifruits', 'cl', 'Boissons'),
    ('Cola', 'cl', 'Boissons'),
    ('Limonade', 'cl', 'Boissons'),
    ('Thé glacé', 'cl', 'Boissons'),
    ('Sirop de grenadine', 'cl', 'Boissons'),
    ('Sirop de menthe', 'cl', 'Boissons'),
    ('Café moulu', 'g', 'Boissons'),
    ('Café en grains', 'g', 'Boissons'),
    ('Capsules de café', 'pièce', 'Boissons'),
    ('Thé', 'sachet', 'Boissons'),
    ('Tisane', 'sachet', 'Boissons'),
    ('Vin rosé', 'cl', 'Boissons'),
    ('Champagne', 'cl', 'Boissons'),
    ('Cidre', 'cl', 'Boissons'),
    ('Pastis', 'cl', 'Boissons'),
    ('Whisky', 'cl', 'Boissons'),

    -- ══════════ HYGIÈNE & MAISON ══════════
    ('Papier toilette', NULL, 'Hygiène & maison'),
    ('Essuie-tout', NULL, 'Hygiène & maison'),
    ('Mouchoirs', NULL, 'Hygiène & maison'),
    ('Liquide vaisselle', NULL, 'Hygiène & maison'),
    ('Pastilles lave-vaisselle', NULL, 'Hygiène & maison'),
    ('Lessive', NULL, 'Hygiène & maison'),
    ('Éponge', 'pièce', 'Hygiène & maison'),
    ('Sacs poubelle', NULL, 'Hygiène & maison'),
    ('Papier aluminium', NULL, 'Hygiène & maison'),
    ('Film alimentaire', NULL, 'Hygiène & maison'),
    ('Papier cuisson', NULL, 'Hygiène & maison'),
    ('Sacs congélation', NULL, 'Hygiène & maison'),
    ('Nettoyant multi-usage', NULL, 'Hygiène & maison'),
    ('Eau de Javel', NULL, 'Hygiène & maison'),
    ('Gel douche', NULL, 'Hygiène & maison'),
    ('Shampooing', NULL, 'Hygiène & maison'),
    ('Savon', NULL, 'Hygiène & maison'),
    ('Déodorant', NULL, 'Hygiène & maison'),
    ('Dentifrice', NULL, 'Hygiène & maison'),
    ('Brosse à dents', 'pièce', 'Hygiène & maison'),
    ('Couches', NULL, 'Hygiène & maison'),
    ('Lingettes', NULL, 'Hygiène & maison'),

    -- ══════════ AUTRE ══════════
    ('Croquettes pour animaux', NULL, 'Autre'),
    ('Litière', NULL, 'Autre')
  ),
  ins AS (
    INSERT INTO public.known_ingredients (name, default_unit, shopping_category_id)
    SELECT d.name, d.default_unit, sc.id
    FROM data d
    JOIN public.shopping_categories sc ON sc.name = d.rayon
    ON CONFLICT (name) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT string_agg(DISTINCT d.rayon, ', ')
       FROM data d
      WHERE NOT EXISTS (SELECT 1 FROM public.shopping_categories sc WHERE sc.name = d.rayon)),
    (SELECT count(*) FROM ins)
  INTO v_missing, v_inserted;

  -- Rayon introuvable : on annule tout (l'exception défait l'INSERT ci-dessus).
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'known_ingredients : rayon(s) introuvable(s) dans shopping_categories : %', v_missing;
  END IF;

  RAISE NOTICE 'known_ingredients : % ingrédient(s) ajouté(s)', v_inserted;
END $$;
