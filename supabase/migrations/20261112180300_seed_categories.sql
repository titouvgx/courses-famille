-- ============================================================
-- Migration 004 : Données initiales — catégories
-- ============================================================

-- Catégories de recettes (types de plat) -----------------------
INSERT INTO recipe_categories (name, color, position) VALUES
  ('Entrée',         '#5A7FA0', 0),
  ('Plat',           '#D97B3A', 1),
  ('Accompagnement', '#4A8A6A', 2),
  ('Dessert',        '#9A4A7A', 3);

-- Catégories de courses (rayons supermarché) -------------------
INSERT INTO shopping_categories (name, color, position) VALUES
  ('Fruits & légumes',       '#4A8A6A',  0),
  ('Viandes & poissons',     '#C45A3A',  1),
  ('Produits laitiers & œufs','#5A7FA0', 2),
  ('Épicerie salée',         '#D97B3A',  3),
  ('Épicerie sucrée',        '#B07A3A',  4),
  ('Condiments & épices',    '#9A4A7A',  5),
  ('Surgelés',               '#5A9AB0',  6),
  ('Boissons',               '#6A7A4A',  7),
  ('Hygiène & maison',       '#7A8A9A',  8),
  ('Autre',                  '#8A94A0',  9);
