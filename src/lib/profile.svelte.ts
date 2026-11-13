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

// Le profil est aussi gardé sur le téléphone : sans lui, l'appli ne sait pas
// à quel foyer appartient la liste de courses. Hors connexion (au fond d'un
// magasin), on reprend la dernière version connue.
const CACHE_KEY = (userId: string) => `courses:profil:${userId}`

function readCache(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(userId))
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function writeCache(profile: Profile): void {
  try {
    localStorage.setItem(CACHE_KEY(profile.id), JSON.stringify(profile))
  } catch {
    // stockage indisponible : tant pis, on continue sans cache
  }
}

/** Charge le profil depuis Supabase (ou depuis le téléphone si pas de réseau). */
export async function loadProfile(userId: string): Promise<void> {
  if (!supabase) return

  profileState.loading = true
  // Affichage immédiat avec la version connue, rafraîchie juste après
  const cached = readCache(userId)
  if (cached) profileState.profile = cached

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) throw error
    profileState.profile = data as Profile
    writeCache(data as Profile)
  } catch (e: any) {
    console.error('Erreur chargement profil:', e?.message ?? e)
    profileState.profile = cached // null si jamais chargé sur ce téléphone
  } finally {
    profileState.loading = false
  }
}

/**
 * Remet le profil à zéro.
 * @param forget true à la déconnexion : efface aussi les données gardées sur
 *   le téléphone (profil, liste de courses, cochages en attente).
 */
export function clearProfile(forget = false): void {
  if (forget) {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('courses:')) localStorage.removeItem(key)
      }
    } catch {
      // rien à faire
    }
  }
  profileState.profile = null
  profileState.loading = false
}
