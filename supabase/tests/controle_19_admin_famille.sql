-- ============================================================
-- Contrôle de la migration 19 (admin_famille) — LECTURE SEULE
-- ============================================================
-- À lancer dans le SQL Editor juste après la migration 19.
-- Attendu : une seule ligne, toutes les colonnes « _ok » à true,
-- recettes_catalogue = 50. comptes_sans_profil est une information
-- (comptes de connexion sans famille : à regarder s'il y en a).
-- ============================================================
SELECT
  (SELECT count(*) = 2
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('remove_member', 'delete_family') AND p.prosecdef
  ) AS fonctions_ok,
  (SELECT coalesce(bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                            AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('remove_member', 'delete_family')
  ) AS droits_execution_ok,
  -- La fonction tourne avec les droits de son propriétaire : il doit pouvoir supprimer un compte
  (SELECT coalesce(bool_and(has_table_privilege(p.proowner, 'auth.users', 'DELETE')), false)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'remove_member'
  ) AS suppression_compte_ok,
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND policyname IN ('families_delete', 'profiles_delete')
  ) AS plus_de_delete_direct_ok,
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgname = 'trg_guard_family_delete' AND NOT tgisinternal AND tgenabled <> 'D'
  ) AS garde_catalogue_ok,
  position('un autre membre' IN pg_get_functiondef('public.guard_profile_update()'::regprocedure)) > 0
    AND position('rôle du fondateur' IN pg_get_functiondef('public.guard_profile_update()'::regprocedure)) > 0
    AS gardes_profil_ok,
  position('auth.users' IN pg_get_functiondef('public.guard_recipe_write()'::regprocedure)) > 0
    AS garde_auteur_ok,
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) = 0 AS rls_partout_ok,
  (SELECT count(*) FROM public.recipes WHERE visibility = 'catalogue') AS recettes_catalogue,
  (SELECT count(*) FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)) AS comptes_sans_profil;
