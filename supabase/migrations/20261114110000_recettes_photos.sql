-- ============================================================
-- Migration : photos des recettes du catalogue commun
-- ============================================================
-- FICHIER GÉNÉRÉ par scripts/recettes/generer.ts à partir de
-- supabase/recettes/photos.json — NE PAS MODIFIER À LA MAIN (npm run recettes).
--
-- 49 photos Unsplash (licence Unsplash : usage gratuit, attribution non
-- obligatoire), chacune vérifiée à l'œil. Ne touche QUE les recettes du
-- catalogue (visibility = 'catalogue') sans photo ou avec une photo Unsplash :
-- une photo envoyée dans l'appli (chemin de notre stockage) n'est jamais remplacée.
-- Les recettes ajoutées par les familles ne sont pas concernées.
-- Nécessite la migration 17 (colonne visibility). Idempotente.
-- ============================================================

DO $$
DECLARE
  v_n integer;
BEGIN
  WITH photos(title, url) AS (
    VALUES
    ('Bœuf bourguignon', 'https://images.unsplash.com/photo-1608500218987-0f2b3be34b47?w=800&h=600&fit=crop&auto=format'),
    ('Poulet rôti', 'https://images.unsplash.com/photo-1616401616927-3c81de22dfa8?w=800&h=600&fit=crop&auto=format'),
    ('Quiche lorraine', 'https://images.unsplash.com/photo-1767065584177-9ceb902eec7a?w=800&h=600&fit=crop&auto=format'),
    ('Pâte à crêpes', 'https://images.unsplash.com/photo-1777891258086-52a41e4477f6?w=800&h=600&fit=crop&auto=format'),
    ('Gratin dauphinois', 'https://images.unsplash.com/photo-1701520181969-2d3e5e00eee5?w=800&h=600&fit=crop&auto=format'),
    ('Hachis parmentier', 'https://images.unsplash.com/photo-1696935257293-9ec4f03074a1?w=800&h=600&fit=crop&auto=format'),
    ('Tartiflette', 'https://images.unsplash.com/photo-1760445530213-bd887eec98fa?w=800&h=600&fit=crop&auto=format'),
    ('Mousse au chocolat', 'https://images.unsplash.com/photo-1673551494277-92204546b504?w=800&h=600&fit=crop&auto=format'),
    ('Pâtes à la carbonara', 'https://images.unsplash.com/photo-1588013273468-315fd88ea34c?w=800&h=600&fit=crop&auto=format'),
    ('Soupe à l''oignon gratinée', 'https://images.unsplash.com/photo-1549203438-a7696aed4dac?w=800&h=600&fit=crop&auto=format'),
    ('Ratatouille', 'https://images.unsplash.com/photo-1572453800999-e8d2d1589b7c?w=800&h=600&fit=crop&auto=format'),
    ('Tarte aux pommes', 'https://images.unsplash.com/photo-1621743478914-cc8a86d7e7b5?w=800&h=600&fit=crop&auto=format'),
    ('Fondant au chocolat', 'https://images.unsplash.com/photo-1673551490812-eaee2e9bf0ef?w=800&h=600&fit=crop&auto=format'),
    ('Saumon en papillote', 'https://images.unsplash.com/photo-1617146629059-0814c2d61b41?w=800&h=600&fit=crop&auto=format'),
    ('Velouté de potiron', 'https://images.unsplash.com/photo-1476718406336-bb5a9690ee2a?w=800&h=600&fit=crop&auto=format'),
    ('Lasagnes bolognaise', 'https://images.unsplash.com/photo-1759409117421-1a64af35f118?w=800&h=600&fit=crop&auto=format'),
    ('Salade niçoise', 'https://images.unsplash.com/photo-1604909052743-94e838986d24?w=800&h=600&fit=crop&auto=format'),
    ('Croque-monsieur', 'https://images.unsplash.com/photo-1748522133662-1c5f382d0569?w=800&h=600&fit=crop&auto=format'),
    ('Blanquette de veau', 'https://images.unsplash.com/photo-1709786204884-e65fb0598c14?w=800&h=600&fit=crop&auto=format'),
    ('Omelette aux champignons', 'https://images.unsplash.com/photo-1766146431872-a4472ccd3889?w=800&h=600&fit=crop&auto=format'),
    ('Pot-au-feu', 'https://images.unsplash.com/photo-1689860892307-7db54ab276ba?w=800&h=600&fit=crop&auto=format'),
    ('Poulet basquaise', 'https://images.unsplash.com/photo-1748864221145-269b4a23a67e?w=800&h=600&fit=crop&auto=format'),
    ('Chili con carne', 'https://images.unsplash.com/photo-1790701909034-6c7b45c7b58a?w=800&h=600&fit=crop&auto=format'),
    ('Curry de poulet au lait de coco', 'https://images.unsplash.com/photo-1764304733301-3a9f335f0c67?w=800&h=600&fit=crop&auto=format'),
    ('Gratin de pâtes au jambon', 'https://images.unsplash.com/photo-1645453014403-4ad5170a386c?w=800&h=600&fit=crop&auto=format'),
    ('Boulettes de bœuf à la sauce tomate', 'https://images.unsplash.com/photo-1768187067375-4cd5a79fec41?w=800&h=600&fit=crop&auto=format'),
    ('Couscous au poulet et merguez', 'https://images.unsplash.com/photo-1742806418170-f051cb880314?w=800&h=600&fit=crop&auto=format'),
    ('Risotto aux champignons', 'https://images.unsplash.com/photo-1680420574628-225def8eea0a?w=800&h=600&fit=crop&auto=format'),
    ('Petit salé aux lentilles', 'https://images.unsplash.com/photo-1648455320791-a667c8aab7e4?w=800&h=600&fit=crop&auto=format'),
    ('Rôti de porc aux pommes de terre', 'https://images.unsplash.com/photo-1741560591088-505db91cd105?w=800&h=600&fit=crop&auto=format'),
    ('Galettes de sarrasin complètes', 'https://images.unsplash.com/photo-1577953589629-446f28f0d8c1?w=800&h=600&fit=crop&auto=format'),
    ('Pizza maison', 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&h=600&fit=crop&auto=format'),
    ('Moules marinières', 'https://images.unsplash.com/photo-1715249792920-bfe1a3b9d79e?w=800&h=600&fit=crop&auto=format'),
    ('Dahl de lentilles corail', 'https://images.unsplash.com/photo-1626500154744-e4b394ffea16?w=800&h=600&fit=crop&auto=format'),
    ('Cabillaud au four et sauce vierge', 'https://images.unsplash.com/photo-1689199407130-4694f3f5344e?w=800&h=600&fit=crop&auto=format'),
    ('Wok de nouilles au poulet et aux légumes', 'https://images.unsplash.com/photo-1634864572865-1cf8ff8bd23d?w=800&h=600&fit=crop&auto=format'),
    ('Tomates farcies', 'https://images.unsplash.com/photo-1618825827072-74b096164e44?w=800&h=600&fit=crop&auto=format'),
    ('Soupe poireaux-pommes de terre', 'https://images.unsplash.com/photo-1616501268826-ee9731c915d4?w=800&h=600&fit=crop&auto=format'),
    ('Taboulé', 'https://images.unsplash.com/photo-1673960802455-ec189a6207e5?w=800&h=600&fit=crop&auto=format'),
    ('Œufs mimosa', 'https://images.unsplash.com/photo-1557965983-5b9fc9ab9014?w=800&h=600&fit=crop&auto=format'),
    ('Salade de pâtes', 'https://images.unsplash.com/photo-1757625620914-1f686e8d15b5?w=800&h=600&fit=crop&auto=format'),
    ('Purée de pommes de terre', 'https://images.unsplash.com/photo-1707616954324-99c89a78a20d?w=800&h=600&fit=crop&auto=format'),
    ('Riz pilaf', 'https://images.unsplash.com/photo-1666181190996-80ed100c66ef?w=800&h=600&fit=crop&auto=format'),
    ('Légumes rôtis au four', 'https://images.unsplash.com/photo-1606791422814-b32c705e3e2f?w=800&h=600&fit=crop&auto=format'),
    ('Gâteau au yaourt', 'https://images.unsplash.com/photo-1605466237764-3d8d802c8a8d?w=800&h=600&fit=crop&auto=format'),
    ('Clafoutis aux cerises', 'https://images.unsplash.com/photo-1719577823946-8a6331d450a3?w=800&h=600&fit=crop&auto=format'),
    ('Riz au lait', 'https://images.unsplash.com/photo-1665529545347-8eac2abf7f41?w=800&h=600&fit=crop&auto=format'),
    ('Crumble aux pommes', 'https://images.unsplash.com/photo-1589462286900-15610446ff76?w=800&h=600&fit=crop&auto=format'),
    ('Cookies aux pépites de chocolat', 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=800&h=600&fit=crop&auto=format')
  ), upd AS (
    UPDATE public.recipes r
       SET image_url = p.url
      FROM photos p
     WHERE r.title = p.title
       AND r.visibility = 'catalogue'
       AND (r.image_url IS NULL OR r.image_url LIKE 'https://images.unsplash.com/%')
       AND r.image_url IS DISTINCT FROM p.url
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM upd;
  RAISE NOTICE 'recettes_photos : % photo(s) mise(s) à jour', v_n;
END $$;
