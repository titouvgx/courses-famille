import { createClient } from '@supabase/supabase-js'

// Les deux valeurs viennent de .env.local (en local) ou des variables du dépôt
// GitHub (en production). Vite ne transmet au navigateur que les variables
// qui commencent par VITE_ : c'est voulu, ce sont des valeurs publiques.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** true si l'appli a bien reçu son adresse Supabase et sa clé publique. */
export const supabaseConfigured = Boolean(url && publishableKey)

// Garde-fou : si quelqu'un colle par erreur la clé secrète, on refuse de démarrer
// plutôt que de l'envoyer à tous les navigateurs.
if (publishableKey?.startsWith('sb_secret_')) {
  throw new Error('Clé secrète détectée dans le frontend : utilise la clé publishable.')
}

export const supabase = supabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
