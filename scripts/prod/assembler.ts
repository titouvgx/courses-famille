// Prépare le SQL d'installation d'une base NEUVE (courses-prod) en 3 fichiers à
// coller dans l'ordre dans le SQL Editor de Supabase :
//   1-structure.sql     migrations jusqu'aux ingrédients (avant les recettes de démo)
//   2-ton-compte.sql    ta famille + ton profil super-admin (à compléter : ton e-mail)
//   3-suite.sql         toutes les migrations suivantes (recettes, photos, familles…)
//
//   npm run prod:sql    → supabase/prod/sortie/ (ignoré par Git)
//
// La migration seed_recipes exige au moins 1 compte et 1 famille : c'est pour
// cela que ton compte est créé entre les deux blocs.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const MIG = join(ROOT, 'supabase', 'migrations')
const OUT = join(ROOT, 'supabase', 'prod', 'sortie')

export function decouper(fichiers: string[]): { avant: string[]; apres: string[] } {
  const i = fichiers.findIndex((f) => /seed_recipes/.test(f))
  if (i < 0) throw new Error('migration seed_recipes introuvable')
  return { avant: fichiers.slice(0, i), apres: fichiers.slice(i) }
}

function bloc(fichiers: string[], titre: string): string {
  const parties = fichiers.map((f) => `\n-- ════════ ${f} ════════\n${readFileSync(join(MIG, f), 'utf8')}`)
  return `-- ${titre}\n-- Généré par scripts/prod/assembler.ts — ${fichiers.length} migration(s), dans l'ordre.\n-- Si une erreur apparaît : arrête-toi et note le nom de la migration indiqué au-dessus.\n${parties.join('\n')}`
}

export const COMPTE_SQL = `-- 2/3 — Ta famille et ton compte super-admin
-- AVANT : Authentication → Users → « Add user » → ton e-mail + un mot de passe
--         (10 caractères minimum), « Auto Confirm User » coché.
-- ENSUITE : remplace les deux valeurs ci-dessous, puis Run.
DO $$
DECLARE
  v_email   text := 'remplace-moi@exemple.fr';  -- ← ton e-mail (celui du compte créé)
  v_prenom  text := 'Ton prénom';               -- ← ton prénom affiché dans l'appli
  v_famille text := 'Ma famille';               -- ← nom de ta famille
  v_user    uuid;
  v_fam     uuid;
BEGIN
  IF v_email = 'remplace-moi@exemple.fr' THEN
    RAISE EXCEPTION 'Remplace d''abord l''e-mail, le prénom et le nom de famille en haut du script';
  END IF;
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Aucun compte avec cet e-mail : crée-le dans Authentication → Users';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user) THEN
    RAISE NOTICE 'Ce compte a déjà un profil : rien à faire';
    RETURN;
  END IF;
  INSERT INTO public.families (name) VALUES (v_famille) RETURNING id INTO v_fam;
  INSERT INTO public.profiles (id, family_id, display_name, role) VALUES (v_user, v_fam, v_prenom, 'admin');
  INSERT INTO public.super_admins (user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  RAISE NOTICE 'OK : famille « % » et compte super-admin créés', v_famille;
END $$;
`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fichiers = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  const { avant, apres } = decouper(fichiers)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, '1-structure.sql'), bloc(avant, '1/3 — Structure de la base (tables, règles, catégories, ingrédients)'))
  writeFileSync(join(OUT, '2-ton-compte.sql'), COMPTE_SQL)
  writeFileSync(join(OUT, '3-suite.sql'), bloc(apres, '3/3 — Recettes, photos, temps réel, stockage, sécurité, familles et invitations'))
  console.log(`Écrit dans supabase/prod/sortie/ : 1-structure.sql (${avant.length}), 2-ton-compte.sql, 3-suite.sql (${apres.length})`)
}
