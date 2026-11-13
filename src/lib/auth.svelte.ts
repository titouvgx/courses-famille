// État d'authentification réactif (Svelte 5 runes)
// Écoute les changements de session Supabase et expose l'état global.

import { supabase, supabaseConfigured } from './supabase'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
}

export const auth: AuthState = $state({
  user: null,
  session: null,
  loading: true,
  error: null,
})

/** Initialise l'écoute des changements de session. Appeler une seule fois. */
export function initAuth(): void {
  if (!supabase || !supabaseConfigured) {
    auth.loading = false
    auth.error = 'Supabase non configuré.'
    return
  }

  // Récupérer la session existante
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      auth.error = error.message
    } else {
      auth.session = data.session
      auth.user = data.session?.user ?? null
    }
    auth.loading = false
  })

  // Écouter les changements (login, logout, refresh)
  supabase.auth.onAuthStateChange((_event, session) => {
    auth.session = session
    auth.user = session?.user ?? null
    auth.error = null
  })
}

/** Connexion par email/password. */
export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) {
    auth.error = 'Supabase non configuré.'
    return
  }

  // Pas de auth.loading ici : il sert au chargement initial de la session, et
  // App.svelte remplacerait la page de connexion par le spinner (saisie perdue).
  // La page Login affiche elle-même l'état « Connexion… ».
  auth.error = null

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    auth.error = error.message === 'Invalid login credentials'
      ? 'Email ou mot de passe incorrect.'
      : error.message
  }
}

/** Déconnexion. */
export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
  auth.user = null
  auth.session = null
}
