-- ============================================================
-- Migration : Photos de recettes (Supabase Storage)
-- ============================================================
-- Crée le bucket `recipe-photos` et ses règles RLS sur storage.objects.
-- Les fichiers sont rangés sous `<recipe_id>/<uuid>.webp|jpg`
-- (compressés dans le navigateur : 1600 px max, ~400 Ko).
-- Idempotente : peut être relancée sans erreur.
--
-- DÉCISION : bucket PUBLIC (lecture par URL directe)
--   Pour :
--     - URL stable et directe, stockée telle quelle dans recipes.image_url
--       (même modèle que les URL Unsplash existantes : aucun code d'affichage à changer) ;
--     - mise en cache HTTP longue (nom de fichier unique, Cache-Control 1 an) ;
--       l'image reste disponible hors connexion tant qu'elle est en cache ;
--     - pas d'URL signée qui expire (une URL signée mise en cache par la PWA
--       ou stockée en base deviendrait invalide au bout de N minutes, et
--       chaque affichage coûterait un appel createSignedUrl).
--   Contre :
--     - quiconque connaît l'URL peut voir la photo, sans être connecté.
--       Risque jugé acceptable : ce sont des photos de plats (pas de données
--       personnelles), et les noms contiennent deux UUID aléatoires
--       (impossibles à deviner). Le LISTAGE du bucket via l'API, lui,
--       reste réservé aux membres (règle SELECT ci-dessous).
--   => Ne jamais y déposer autre chose que des photos de plats.
--
-- ÉCRITURE : réservée au foyer propriétaire de la recette (même règle que
-- recipes_update : is_family(family_id)). Le premier dossier du chemin doit
-- être l'id d'une recette du foyer.
-- ============================================================

-- ── 1. Bucket ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-photos',
  'recipe-photos',
  true,
  2097152,                                  -- 2 Mo max par fichier (cible réelle : ~400 Ko)
  ARRAY['image/webp', 'image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 2. Règles RLS sur storage.objects ────────────────────────
-- (RLS est déjà activé par Supabase sur storage.objects : ne pas y toucher.)

-- Lecture via l'API (liste, suppression) : membres seulement.
-- L'affichage passe par l'URL publique, qui ne dépend pas de cette règle.
DROP POLICY IF EXISTS "recipe_photos_select" ON storage.objects;
CREATE POLICY "recipe_photos_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND public.is_member()
  );

-- Existence d'une recette, indépendamment des droits de lecture de l'appelant.
-- (Sans cela, la clause « fichier orphelin » ci-dessous dépendrait de la règle
-- RLS de lecture sur recipes : si un jour certaines recettes devenaient
-- privées à un foyer, elles paraîtraient « inexistantes » aux autres membres,
-- qui pourraient alors supprimer leurs photos.)
CREATE OR REPLACE FUNCTION public.recipe_exists(rid text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.recipes WHERE id::text = rid)
$$;

REVOKE ALL ON FUNCTION public.recipe_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recipe_exists(text) TO authenticated;

-- Envoi : uniquement dans le dossier d'une recette du foyer, extensions attendues,
-- et chemin exact « <recipeId>/<fichier> » (pas de sous-dossier).
DROP POLICY IF EXISTS "recipe_photos_insert" ON storage.objects;
CREATE POLICY "recipe_photos_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-photos'
    AND public.is_member()
    AND lower(storage.extension(name)) IN ('webp', 'jpg')
    AND array_length(storage.foldername(name), 1) = 1
    AND EXISTS (
      SELECT 1 FROM public.recipes r
      WHERE r.id::text = (storage.foldername(name))[1]
        AND public.is_family(r.family_id)
    )
  );

-- Pas de règle UPDATE : chaque photo a un nom unique, on n'écrase jamais
-- un fichier (upsert désactivé côté appli).
DROP POLICY IF EXISTS "recipe_photos_update" ON storage.objects;

-- Suppression : foyer propriétaire de la recette, OU fichier orphelin
-- (la recette n'existe plus : l'appli supprime la photo juste après la recette).
DROP POLICY IF EXISTS "recipe_photos_delete" ON storage.objects;
CREATE POLICY "recipe_photos_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recipe-photos'
    AND public.is_member()
    AND (
      EXISTS (
        SELECT 1 FROM public.recipes r
        WHERE r.id::text = (storage.foldername(name))[1]
          AND public.is_family(r.family_id)
      )
      OR NOT public.recipe_exists((storage.foldername(name))[1])
    )
  );
