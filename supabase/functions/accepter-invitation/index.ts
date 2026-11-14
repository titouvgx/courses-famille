// Fonction serveur Supabase « accepter-invitation »
// ------------------------------------------------------------------
// Crée le compte d'une personne invitée par lien, puis la rattache à sa
// famille (ou crée sa super-famille et sa famille si c'est un lien
// « fondateur »). Les inscriptions publiques restant fermées, c'est le SEUL
// moyen de créer un compte depuis l'appli.
//
// Sécurité :
// - la clé secrète n'existe QUE dans l'environnement de la fonction, chez
//   Supabase (variable SUPABASE_SECRET_KEYS fournie par la plateforme) ;
// - le jeton est vérifié puis consommé dans la base par consume_invitation()
//   (atomique : un lien ne sert qu'une fois, même avec deux envois simultanés) ;
// - si le rattachement échoue, le compte tout juste créé est supprimé ;
// - seules les adresses de l'appli peuvent l'appeler depuis un navigateur (CORS).
//
// Déploiement : voir supabase/functions/README.md (tableau de bord Supabase,
// « Verify JWT » désactivé : la personne n'a pas encore de compte).
// ------------------------------------------------------------------

// Import STATIQUE obligatoire : au déploiement, Supabase emballe le code et ses
// dépendances dans un seul fichier (eszip) ; un import dynamique dont le nom est
// dans une variable n'y est pas inclus et la fonction plantait au démarrage.
// (Dans les tests Node, ce module est remplacé par un faux : vite.config.ts.)
import { createClient } from 'npm:@supabase/supabase-js@2'

/** Accès à Supabase dont la fonction a besoin (remplacé par un faux dans les tests). */
export interface Acces {
  invitationInfo(token: string): Promise<{ status: string; kind: string | null } | null>
  creerCompte(email: string, motDePasse: string, nom: string): Promise<{ id: string } | { erreur: 'existe' | 'autre'; message?: string }>
  supprimerCompte(id: string): Promise<void>
  consommer(token: string, userId: string, nom: string, famille: string | null): Promise<{ ok: true; kind: string } | { ok: false; message: string }>
}

export const ORIGINES_PAR_DEFAUT = ['https://titouvgx.github.io', 'http://localhost:5173', 'http://localhost:4173']

const MESSAGES_STATUT: Record<string, string> = {
  inconnue: 'Ce lien d’invitation n’existe pas. Vérifie qu’il est complet.',
  annulee: 'Ce lien d’invitation a été annulé. Demande un nouveau lien.',
  utilisee: 'Ce lien d’invitation a déjà été utilisé. Demande un nouveau lien.',
  expiree: 'Ce lien d’invitation a expiré (7 jours). Demande un nouveau lien.',
}

function entetesCors(origine: string | null, origines: string[]): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Liste recommandée par supabase-js (@supabase/supabase-js/cors) : un en-tête
    // manquant ici ferait échouer la demande préalable du navigateur
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
  if (origine && origines.includes(origine)) h['Access-Control-Allow-Origin'] = origine
  return h
}

function json(statut: number, corps: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

/** Logique de la fonction, indépendante de Deno et de Supabase (testée dans tests/unit). */
export async function traiter(req: Request, acces: Acces, origines: string[] = ORIGINES_PAR_DEFAUT): Promise<Response> {
  const origine = req.headers.get('Origin')
  const cors = entetesCors(origine, origines)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json(405, { erreur: 'Méthode non autorisée' }, cors)
  if (origine && !origines.includes(origine)) return json(403, { erreur: 'Origine non autorisée' }, cors)
  if (Number(req.headers.get('Content-Length') ?? 0) > 4096) return json(413, { erreur: 'Demande trop grande' }, cors)

  let corps: Record<string, unknown>
  try {
    const texte = await req.text()
    if (texte.length > 4096) return json(413, { erreur: 'Demande trop grande' }, cors)
    corps = JSON.parse(texte)
    if (!corps || typeof corps !== 'object') throw new Error()
  } catch {
    return json(400, { erreur: 'Demande illisible' }, cors)
  }

  const texte = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const token = texte(corps.token).toLowerCase()
  const email = texte(corps.email).toLowerCase()
  const motDePasse = typeof corps.password === 'string' ? corps.password : ''
  const nom = texte(corps.display_name)
  const famille = texte(corps.family_name)

  if (!/^[0-9a-f]{64}$/.test(token)) return json(400, { erreur: MESSAGES_STATUT.inconnue }, cors)
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { erreur: 'Adresse e-mail invalide' }, cors)
  if (motDePasse.length < 10 || motDePasse.length > 72) return json(400, { erreur: 'Le mot de passe doit faire entre 10 et 72 caractères' }, cors)
  if (nom.length < 1 || nom.length > 40) return json(400, { erreur: 'Indique ton prénom (40 caractères maximum)' }, cors)
  if (famille.length > 60) return json(400, { erreur: 'Nom de famille trop long (60 caractères maximum)' }, cors)

  const info = await acces.invitationInfo(token)
  if (!info || info.status !== 'valide') {
    return json(410, { erreur: MESSAGES_STATUT[info?.status ?? 'inconnue'] ?? MESSAGES_STATUT.inconnue }, cors)
  }
  if (info.kind === 'fondateur' && famille.length < 1) {
    return json(400, { erreur: 'Donne un nom à ta famille' }, cors)
  }

  const compte = await acces.creerCompte(email, motDePasse, nom)
  if ('erreur' in compte) {
    if (compte.erreur === 'existe') return json(409, { erreur: 'Un compte existe déjà avec cette adresse. Connecte-toi plutôt.' }, cors)
    return json(502, { erreur: 'Le compte n’a pas pu être créé. Réessaie dans un instant.' }, cors)
  }

  const res = await acces.consommer(token, compte.id, nom, info.kind === 'fondateur' ? famille : null)
  if (!res.ok) {
    // Pas de compte orphelin : on annule la création
    await acces.supprimerCompte(compte.id)
    return json(410, { erreur: res.message || 'Ce lien d’invitation n’est plus valable.' }, cors)
  }
  return json(201, { ok: true, kind: res.kind }, cors)
}

// ── Branchement sur Supabase (exécuté seulement dans Deno, chez Supabase) ──
declare const Deno: {
  env: { get(nom: string): string | undefined }
  serve(h: (req: Request) => Response | Promise<Response>): void
} | undefined

if (typeof Deno !== 'undefined') {
  const url = Deno.env.get('SUPABASE_URL')!
  // Nouvelle clé secrète (« default ») si présente, sinon ancienne clé service_role
  let cle = ''
  try {
    cle = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default ?? ''
  } catch {
    cle = ''
  }
  if (!cle) cle = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const origines = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const admin = createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } })

  const acces: Acces = {
    async invitationInfo(token) {
      const { data, error } = await admin.rpc('invitation_info', { p_token: token })
      if (error) return null
      const ligne = Array.isArray(data) ? data[0] : data
      return ligne ? { status: ligne.status, kind: ligne.kind } : null
    },
    async creerCompte(email, motDePasse, nom) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: motDePasse,
        email_confirm: true, // le lien d'invitation tient lieu de vérification
        user_metadata: { display_name: nom },
      })
      if (error || !data?.user) {
        const m = (error?.message ?? '').toLowerCase()
        const existe = (error as { status?: number } | null)?.status === 422 || m.includes('already') || m.includes('exists')
        return { erreur: existe ? 'existe' : 'autre', message: error?.message }
      }
      return { id: data.user.id }
    },
    async supprimerCompte(id) {
      await admin.auth.admin.deleteUser(id)
    },
    async consommer(token, userId, nom, famille) {
      const { data, error } = await admin.rpc('consume_invitation', {
        p_token: token,
        p_user_id: userId,
        p_display_name: nom,
        p_family_name: famille,
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true, kind: (data as { kind: string }).kind }
    },
  }

  Deno.serve((req) => traiter(req, acces, origines.length ? origines : ORIGINES_PAR_DEFAUT))
}
