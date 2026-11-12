# Étape 2 — Base de données et sécurité

## Fichiers créés

```
supabase/
├── migrations/
│   ├── 20261112180000_schema.sql          ← 12 tables + index + trigger
│   ├── 20261112180100_rls_functions.sql   ← 5 fonctions RLS
│   ├── 20261112180200_rls_policies.sql    ← 48 policies (4 par table)
│   └── 20261112180300_seed_categories.sql ← 4 catégories recettes + 10 rayons
├── tests/
│   └── rls_tests.sql                      ← 6 tests de sécurité
└── GUIDE_ETAPE2.md                        ← ce fichier
```

## Comment appliquer les migrations

### Sur le projet TEST

1. Ouvrir le **SQL Editor** dans le dashboard Supabase du projet test
2. Exécuter les 4 fichiers **dans l'ordre** :
   - `20261112180000_schema.sql`
   - `20261112180100_rls_functions.sql`
   - `20261112180200_rls_policies.sql`
   - `20261112180300_seed_categories.sql`
3. Vérifier : onglet **Table Editor** → 12 tables visibles
4. Vérifier : onglet **Authentication > Policies** → policies sur chaque table

### Lancer les tests

1. Toujours dans le SQL Editor du projet test
2. Exécuter `tests/rls_tests.sql` → crée les données de test + tests auto (1, 2, 6)
3. Pour les tests 3, 4, 5 : suivre les instructions manuelles dans le fichier

### Sur le projet PROD (plus tard)

Même procédure, sans les tests.

## Schéma résumé

```
families ──< profiles
         ──< recipes ──< recipe_ingredients
                     ──< recipe_steps
         ──< meal_plans ──< meal_slots ──> recipes
         ──< shopping_lists ──< shopping_list_items

recipe_categories (global, 4 entrées)
shopping_categories (global, 10 entrées)
super_admins (1 entrée : Titouan)
```

## Règles RLS

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| families | famille + super | super | super | super |
| profiles | famille + super | super | soi / admin / super | super |
| recipe_categories | membre | super | super | super |
| shopping_categories | membre | super | super | super |
| recipes | famille | famille | famille | admin + super |
| recipe_ingredients | via recette | via recette | via recette | via recette |
| recipe_steps | via recette | via recette | via recette | via recette |
| meal_plans | famille | famille | famille | admin + super |
| meal_slots | via plan | via plan | via plan | via plan |
| shopping_lists | famille | famille | famille | admin + super |
| shopping_list_items | via liste | via liste | via liste | via liste |
