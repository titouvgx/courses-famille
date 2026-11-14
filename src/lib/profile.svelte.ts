// État du profil utilisateur (famille, rôle, etc.)
// Chargé une fois après login, utilisé partout.

import { supabase } from './supabase'
import type { Family, Profile, SuperFamily } from './types'

/** Place de la personne dans l'organisation familiale. */
export interface FamilyContext {
  family: Family | null
  superFamily: SuperFamily | null
  /** Fondateur de sa super-famille : crée les familles (3 max) et y invite. */
  isFounder: boolean
  /** Super-admin de l'appli : crée les liens « fondateur ». */
  isSuperAdmin: boolean
}

interface ProfileState {
  profile: Profile | null
  context: FamilyContext | null
  loading: boolean
}

export const profileState: ProfileState = $state({
  profile: null,
  context: null,
  loading: true,
})

/** L'utilisateur peut-il inviter dans sa propre famille ? */
export function canInviteInOwnFamily(): boolean {
  const c = profileState.context
  return profileState.profile?.role === 'admin' || !!c?.isFounder || !!c?.isSuperAdmin
}

/** Charge famille, super-famille et rôles (tolère une base sans la migration 17). */
async function loadContext(profile: Profile): Promise<FamilyContext> {
  const ctx: FamilyContext = { family: null, superFamily: null, isFounder: false, isSuperAdmin: false }
  if (!supabase) return ctx
  const [fam, admin] = await Promise.all([
    supabase.from('families').select('*').eq('id', profile.family_id).maybeSingle(),
    supabase.from('super_admins').select('user_id').eq('user_id', profile.id).maybeSingle(),
  ])
  ctx.family = (fam.data as Family | null) ?? null
  ctx.isSuperAdmin = !!admin.data
  if (ctx.family?.super_family_id) {
    const sf = await supabase.from('super_families').select('*').eq('id', ctx.family.super_family_id).maybeSingle()
    ctx.superFamily = (sf.data as SuperFamily | null) ?? null
    ctx.isFounder = ctx.superFamily?.founder_id === profile.id
  }
  return ctx
}

// Le profil est aussi gardé sur le téléphone : sans lui, l'appli ne sait pas
// à quel foyer appartient la liste de courses. Hors connexion (au fond d'un
// magasin), on reprend la dernière version connue.
const CACHE_KEY = (userId: string) => `courses:profil:${userId}`
const CACHE_CTX = (userId: string) => `courses:contexte:${userId}`

function readCache(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(userId))
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

function readContextCache(userId: string): FamilyContext | null {
  try {
    const raw = localStorage.getItem(CACHE_CTX(userId))
    return raw ? (JSON.parse(raw) as FamilyContext) : null
  } catch {
    return null
  }
}

function writeCache(profile: Profile, context?: FamilyContext): void {
  try {
    localStorage.setItem(CACHE_KEY(profile.id), JSON.stringify(profile))
    if (context) localStorage.setItem(CACHE_CTX(profile.id), JSON.stringify(context))
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
  const cachedCtx = readContextCache(userId)
  if (cachedCtx) profileState.context = cachedCtx

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) throw error
    profileState.profile = data as Profile
    const ctx = await loadContext(data as Profile)
    profileState.context = ctx
    writeCache(data as Profile, ctx)
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
  profileState.context = null
  profileState.loading = false
}

/** Recharge le contexte (après création d'une famille, renommage…). */
export async function refreshContext(): Promise<void> {
  const p = profileState.profile
  if (!p) return
  const ctx = await loadContext(p)
  profileState.context = ctx
  writeCache(p, ctx)
}
