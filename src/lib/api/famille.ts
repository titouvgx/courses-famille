// Familles, super-familles et invitations par lien.
// Toutes les écritures sensibles passent par des fonctions de la base
// (create_invitation, revoke_invitation, create_family) qui vérifient les
// droits ; la création de compte passe par la fonction serveur
// « accepter-invitation » (voir supabase/functions/).

import { supabase } from '../supabase'
import type { Family, FamilyMember, Invitation, SuperFamily } from '../types'

function db() {
  if (!supabase) throw new Error('Supabase non configuré')
  return supabase
}

// ────────── Membres et familles ──────────

export interface Member extends FamilyMember {
  family_id: string
  created_at: string
}

/** Membres d'une famille (sa famille, ou une famille de sa super-famille pour le fondateur). */
export async function fetchMembers(familyId: string): Promise<Member[]> {
  const { data, error } = await db()
    .from('profiles')
    .select('id, display_name, role, family_id, created_at')
    .eq('family_id', familyId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Member[]
}

/** Change le rôle d'un membre (admin de la famille ou fondateur ; jamais soi-même). */
export async function setMemberRole(memberId: string, role: 'admin' | 'member'): Promise<void> {
  const { data, error } = await db().from('profiles').update({ role }).eq('id', memberId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Modification refusée')
}

export async function renameFamily(familyId: string, name: string): Promise<void> {
  const { data, error } = await db().from('families').update({ name: name.trim() }).eq('id', familyId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Modification refusée')
}

/** Familles d'une super-famille (visibles par ses membres et son fondateur). */
export async function fetchFamilies(superFamilyId: string): Promise<Family[]> {
  const { data, error } = await db()
    .from('families')
    .select('*')
    .eq('super_family_id', superFamilyId)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Family[]
}

/** Nombre de membres par famille (pour l'aperçu du fondateur et du super-admin). */
export async function countMembers(familyIds: string[]): Promise<Record<string, number>> {
  if (!familyIds.length) return {}
  const { data, error } = await db().from('profiles').select('family_id').in('family_id', familyIds)
  if (error) throw error
  const n: Record<string, number> = {}
  for (const r of data ?? []) n[r.family_id] = (n[r.family_id] ?? 0) + 1
  return n
}

/** Crée une famille dans sa super-famille (fondateur : 3 au maximum). */
export async function createFamily(name: string, superFamilyId?: string): Promise<string> {
  const { data, error } = await db().rpc('create_family', {
    p_name: name.trim(),
    p_super_family_id: superFamilyId ?? null,
  })
  if (error) throw error
  return data as string
}

// ────────── Invitations ──────────

export const INVITATION_DAYS = 7

export interface NewInvitation {
  id: string
  token: string
  expires_at: string
  url: string
}

/** Adresse du lien d'invitation (le jeton est après le #, il n'est donc jamais envoyé au serveur web). */
export function invitationUrl(token: string): string {
  const { origin, pathname } = window.location
  return `${origin}${pathname}#/rejoindre/${token}`
}

/**
 * Crée un lien d'invitation. Le jeton n'est renvoyé qu'ICI : la base ne garde
 * que son empreinte. Il faut donc le partager tout de suite.
 */
export async function createInvitation(
  kind: 'fondateur' | 'membre',
  opts: { familyId?: string; role?: 'admin' | 'member'; label?: string } = {},
): Promise<NewInvitation> {
  const { data, error } = await db().rpc('create_invitation', {
    p_kind: kind,
    p_family_id: opts.familyId ?? null,
    p_role: opts.role ?? null,
    p_label: opts.label?.trim() || null,
  })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; token: string; expires_at: string }
  return { ...row, url: invitationUrl(row.token) }
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await db().rpc('revoke_invitation', { p_id: id })
  if (error) throw error
}

/** Liens d'une famille (membres) ou liens « fondateur » (super-admin). */
export async function fetchInvitations(filter: { familyIds?: string[]; kind?: 'fondateur' }): Promise<Invitation[]> {
  let q = db().from('invitations').select('*').order('created_at', { ascending: false }).limit(100)
  if (filter.kind) q = q.eq('kind', filter.kind)
  if (filter.familyIds) q = q.in('family_id', filter.familyIds)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Invitation[]
}

export type InvitationStatus = 'valide' | 'utilisee' | 'expiree' | 'annulee'

export function invitationStatus(i: Invitation, now = Date.now()): InvitationStatus {
  if (i.revoked_at) return 'annulee'
  if (i.used_at) return 'utilisee'
  if (new Date(i.expires_at).getTime() <= now) return 'expiree'
  return 'valide'
}

/** Noms des comptes ayant utilisé des liens (pour l'historique des invitations). */
export async function namesOf(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data } = await db().from('profiles').select('id, display_name').in('id', ids)
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.display_name]))
}

// ────────── Rejoindre (sans compte) ──────────

export interface InvitationInfo {
  status: 'valide' | 'utilisee' | 'expiree' | 'annulee' | 'inconnue'
  kind: 'fondateur' | 'membre' | null
  role: 'admin' | 'member' | null
  family_name: string | null
}

export async function invitationInfo(token: string): Promise<InvitationInfo> {
  const { data, error } = await db().rpc('invitation_info', { p_token: token })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as InvitationInfo | undefined
  return row ?? { status: 'inconnue', kind: null, role: null, family_name: null }
}

export interface AcceptInvitationInput {
  token: string
  email: string
  password: string
  display_name: string
  family_name?: string
}

/** Crée le compte via la fonction serveur, puis connecte la personne. */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<void> {
  const client = db()
  const { data, error } = await client.functions.invoke('accepter-invitation', { body: input })
  if (error) {
    // Message lisible renvoyé par la fonction (JSON { erreur })
    let message = 'Le compte n’a pas pu être créé. Réessaie dans un instant.'
    try {
      const ctx = (error as { context?: Response }).context
      const body = ctx ? await ctx.json() : null
      if (body?.erreur) message = body.erreur
    } catch {
      // réponse illisible : message générique
    }
    throw new Error(message)
  }
  if (!(data as { ok?: boolean })?.ok) throw new Error('Le compte n’a pas pu être créé.')
  const { error: e2 } = await client.auth.signInWithPassword({ email: input.email.trim(), password: input.password })
  if (e2) throw new Error('Compte créé ! Connecte-toi avec ton e-mail et ton mot de passe.')
}

// ────────── Mot de passe oublié ──────────

/** Envoie l'e-mail de réinitialisation (même réponse que le compte existe ou non). */
export async function requestPasswordReset(email: string): Promise<void> {
  const { origin, pathname } = window.location
  const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}${pathname}` })
  // Trop de demandes : on le dit ; sinon on ne révèle pas si l'adresse existe
  if (error && /rate|limit|too many/i.test(error.message)) {
    throw new Error('Trop de demandes. Réessaie dans une heure.')
  }
}

/** Valide le lien reçu par e-mail (?token_hash=…&type=recovery) et ouvre une session. */
export async function verifyRecoveryLink(tokenHash: string): Promise<void> {
  const { error } = await db().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
  if (error) throw new Error('Ce lien a expiré ou a déjà servi. Demande un nouvel e-mail.')
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await db().auth.updateUser({ password })
  if (error) throw new Error(error.message.includes('different') ? 'Choisis un mot de passe différent de l’ancien.' : 'Le mot de passe n’a pas pu être changé.')
}

// ────────── Super-admin ──────────

export interface SuperFamilyOverview extends SuperFamily {
  founder_name: string | null
  families: (Family & { members: number })[]
}

/** Vue d'ensemble pour le super-admin (lecture seule). */
export async function fetchOverview(): Promise<SuperFamilyOverview[]> {
  const client = db()
  const [sfs, fams] = await Promise.all([
    client.from('super_families').select('*').order('created_at'),
    client.from('families').select('*').order('created_at'),
  ])
  if (sfs.error) throw sfs.error
  if (fams.error) throw fams.error
  const families = (fams.data ?? []) as Family[]
  const counts = await countMembers(families.map((f) => f.id))
  const founders = await namesOf(((sfs.data ?? []) as SuperFamily[]).map((s) => s.founder_id ?? ''))
  return ((sfs.data ?? []) as SuperFamily[]).map((sf) => ({
    ...sf,
    founder_name: sf.founder_id ? founders[sf.founder_id] ?? null : null,
    families: families.filter((f) => f.super_family_id === sf.id).map((f) => ({ ...f, members: counts[f.id] ?? 0 })),
  }))
}
