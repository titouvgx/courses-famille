// État du profil utilisateur (famille, rôle, etc.)
// Chargé une fois après login, utilisé partout.

import { supabase } from './supabase'
import type { Profile } from './types'

interface ProfileState {
  profile: Profile | null
  loading: boolean
}

export const profileState: ProfileState = $state({
  profile: null,
  loading: true,
})

/** Charge le profil depuis Supabase. Appeler après login. */
export async function loadProfile(userId: string): Promise<void> {
  if (!supabase) return

  profileState.loading = true
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('Erreur chargement profil:', error.message)
    profileState.profile = null
  } else {
    profileState.profile = data as Profile
  }
  profileState.loading = false
}

/** Remet le profil à zéro (déconnexion). */
export function clearProfile(): void {
  profileState.profile = null
  profileState.loading = false
}
