-- ============================================================
-- Migration 005 : Ajout d'une icône (émoji) par rayon de courses
-- ============================================================

ALTER TABLE shopping_categories ADD COLUMN icon text NOT NULL DEFAULT '🛒';

UPDATE shopping_categories SET icon = '🥬' WHERE name = 'Fruits & légumes';
UPDATE shopping_categories SET icon = '🥩' WHERE name = 'Viandes & poissons';
UPDATE shopping_categories SET icon = '🧀' WHERE name = 'Produits laitiers & œufs';
UPDATE shopping_categories SET icon = '🍝' WHERE name = 'Épicerie salée';
UPDATE shopping_categories SET icon = '🍪' WHERE name = 'Épicerie sucrée';
UPDATE shopping_categories SET icon = '🌿' WHERE name = 'Condiments & épices';
UPDATE shopping_categories SET icon = '❄️' WHERE name = 'Surgelés';
UPDATE shopping_categories SET icon = '🥤' WHERE name = 'Boissons';
UPDATE shopping_categories SET icon = '🧴' WHERE name = 'Hygiène & maison';
UPDATE shopping_categories SET icon = '🛒' WHERE name = 'Autre';
