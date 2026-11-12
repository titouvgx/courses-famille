-- ============================================================
-- Migration : Ajout d'images aux recettes
-- ============================================================
-- Ajoute une colonne image_url à la table recipes
-- et associe une photo Unsplash à chaque recette existante.
-- Photos libres de droits (Unsplash License).
-- ============================================================

-- 1. Ajouter la colonne
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Mettre à jour les recettes existantes avec des photos Unsplash
UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1609607285694-e283bd2ea9a0?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Bœuf bourguignon';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1616401616927-3c81de22dfa8?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Poulet rôti';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1767065584177-9ceb902eec7a?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Quiche lorraine';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1777891258086-52a41e4477f6?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Pâte à crêpes';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1552845683-cfefc701e423?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Gratin dauphinois';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1696935257293-9ec4f03074a1?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Hachis parmentier';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1623238913973-21e45cced554?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Tartiflette';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1551578657-a7e74acb0135?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Mousse au chocolat';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1588013273468-315fd88ea34c?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Pâtes à la carbonara';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1549203438-a7696aed4dac?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Soupe à l''oignon gratinée';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1572453800999-e8d2d1589b7c?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Ratatouille';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1621743478914-cc8a86d7e7b5?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Tarte aux pommes';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1605807646983-377bc5a76493?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Fondant au chocolat';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1565299647508-7c3b8ec04837?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Saumon en papillote';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Velouté de potiron';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1759409117421-1a64af35f118?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Lasagnes bolognaise';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1604909052743-94e838986d24?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Salade niçoise';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1531664412848-9610afed156c?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Croque-monsieur';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1608500218987-0f2b3be34b47?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Blanquette de veau';

UPDATE recipes SET image_url = 'https://images.unsplash.com/photo-1677844592730-ce9c936d8f1a?w=800&h=600&fit=crop&auto=format'
WHERE title = 'Omelette aux champignons';
