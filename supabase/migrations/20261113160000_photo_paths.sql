-- ============================================================
-- Migration : photos de recettes enregistrées par CHEMIN (sécurité)
-- ============================================================
-- Faille corrigée (trouvée par le banc d'attaque RLS, 13/11/2026) :
-- la règle de security_fixes acceptait une image hébergée sur le stockage
-- de N'IMPORTE QUEL projet Supabase (`https://<n'importe quoi>.supabase.co/…`).
-- Un membre pouvait donc pointer une recette (partagée avec tous les foyers)
-- vers le stockage d'un projet à lui : « pixel espion » qui récupère
-- l'adresse IP de toute la famille.
--
-- Nouvelle règle : recipes.image_url ne contient plus que
--   • soit le CHEMIN d'une photo de NOTRE bucket : `<id de la recette>/<uuid>.webp|jpg`
--     (l'appli reconstruit l'adresse avec l'adresse de notre projet : aucun
--     autre hôte n'est possible) ;
--   • soit une photo Unsplash (recettes de démo) au format strict
--     `https://images.unsplash.com/photo-…` ;
--   • soit NULL.
-- En plus, un trigger vérifie qu'un chemin désigne un fichier qui EXISTE
-- vraiment dans le bucket `recipe-photos`, dans le dossier de CETTE recette.
--
-- Données existantes :
--   • URL complète d'une de nos photos → convertie en chemin si le fichier
--     existe dans notre bucket et dans le dossier de la recette ;
--   • toute autre valeur non conforme → NULL (photo cassée ou suspecte).
--   Le nombre de lignes converties / vidées est affiché (NOTICE).
--
-- Appli : nécessite la v0.9.0 ou plus récente (qui enregistre des chemins).
-- Une version plus ancienne restée ouverte ne pourra plus enregistrer de
-- photo (refus de la base) : il suffit de recharger l'appli.
--
-- Idempotente : peut être relancée sans erreur.
-- ============================================================

-- ── 0. Garde-fou : la base peut-elle lire storage.objects ? ──
-- Le trigger ci-dessous en a besoin. Si ce n'est pas le cas, on s'arrête
-- ici avec un message clair plutôt que de casser l'envoi de photos.
DO $$
BEGIN
  PERFORM 1 FROM storage.objects LIMIT 1;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'photo_paths : le rôle courant ne peut pas lire storage.objects. Migration annulée, rien n''a changé.';
END $$;

-- ── 1. Ancienne règle retirée (elle bloquerait la conversion) ──
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_image_url_origin;
DROP TRIGGER IF EXISTS trg_recipe_image_exists ON public.recipes;

-- ── 2. Conversion des données existantes ──
DO $$
DECLARE
  v_converted integer;
  v_cleared   integer;
BEGIN
  -- URL complète d'une photo de notre bucket → chemin (si le fichier est bien chez nous)
  WITH candidates AS (
    SELECT r.id,
           substring(r.image_url FROM '/storage/v1/object/public/recipe-photos/(.+)$') AS path
    FROM public.recipes r
    WHERE r.image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/recipe-photos/'
  ), upd AS (
    UPDATE public.recipes r
    SET image_url = c.path
    FROM candidates c
    WHERE r.id = c.id
      AND c.path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
      AND split_part(c.path, '/', 1) = r.id::text
      AND EXISTS (SELECT 1 FROM storage.objects o
                  WHERE o.bucket_id = 'recipe-photos' AND o.name = c.path)
    RETURNING 1
  )
  SELECT count(*) INTO v_converted FROM upd;

  -- Tout ce qui reste non conforme → NULL
  WITH upd AS (
    UPDATE public.recipes r
    SET image_url = NULL
    WHERE r.image_url IS NOT NULL
      AND NOT (
        r.image_url ~ '^https://images\.unsplash\.com/photo-[A-Za-z0-9_-]+(\?[A-Za-z0-9=&%._-]*)?$'
        OR (
          r.image_url ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
          AND split_part(r.image_url, '/', 1) = r.id::text
          AND EXISTS (SELECT 1 FROM storage.objects o
                      WHERE o.bucket_id = 'recipe-photos' AND o.name = r.image_url)
        )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_cleared FROM upd;

  RAISE NOTICE 'photo_paths : % photo(s) convertie(s) en chemin, % valeur(s) non conforme(s) vidée(s)',
    v_converted, v_cleared;
END $$;

-- ── 3. Règle de format (vérifiée sur TOUTES les lignes, pas NOT VALID) ──
ALTER TABLE public.recipes ADD CONSTRAINT recipes_image_url_origin CHECK (
  image_url IS NULL
  OR image_url ~ '^https://images\.unsplash\.com/photo-[A-Za-z0-9_-]+(\?[A-Za-z0-9=&%._-]*)?$'
  OR (
    image_url ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
    AND split_part(image_url, '/', 1) = id::text
  )
);

-- ── 4. Le fichier doit exister dans notre bucket ──
-- SECURITY DEFINER : lit storage.objects quels que soient les droits de
-- l'appelant (il ne renvoie rien, il ne fait que refuser).
CREATE OR REPLACE FUNCTION public.check_recipe_image_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Seulement pour un chemin de notre bucket ; toute autre valeur est
  -- refusée (ou acceptée pour Unsplash) par la contrainte recipes_image_url_origin.
  IF NEW.image_url ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'
     AND NOT EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'recipe-photos' AND o.name = NEW.image_url
     )
  THEN
    RAISE EXCEPTION 'Photo introuvable dans le stockage de l''appli'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- Fonction de trigger : jamais appelable directement par l'API
REVOKE ALL ON FUNCTION public.check_recipe_image_exists() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_recipe_image_exists
  BEFORE INSERT OR UPDATE OF image_url ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.check_recipe_image_exists();
