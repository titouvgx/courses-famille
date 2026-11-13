-- ============================================================
-- Migration : temps réel (Realtime) pour la liste ET le planning
-- ============================================================
-- Supabase n'envoie les changements en direct que pour les tables ajoutées
-- à la publication « supabase_realtime ».
--   - shopping_list_items : cochage partagé dans la page Courses
--   - meal_slots          : planning partagé dans la page Semaine (nouveau)
-- Idempotent : peut être exécuté plusieurs fois sans erreur.
-- Les droits RLS s'appliquent aussi au temps réel : chacun ne reçoit que
-- les changements des lignes qu'il a le droit de lire.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shopping_list_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'meal_slots'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meal_slots;
  END IF;
END $$;

-- Pour les suppressions (DELETE), Realtime ne transmet par défaut que la clé
-- primaire. C'est suffisant ici : l'appli recharge le planning à chaque événement.
