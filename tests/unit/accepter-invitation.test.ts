// Fonction serveur « accepter-invitation » : logique testée avec un faux Supabase
import { describe, expect, it } from 'vitest'
import { traiter, type Acces } from '../../supabase/functions/accepter-invitation/index.ts'

const JETON = 'a'.repeat(64)
const ORIGINE = 'https://titouvgx.github.io'

function faux(o: Partial<Acces> & { statut?: string; kind?: string } = {}) {
  const journal: string[] = []
  const acces: Acces = {
    invitationInfo: o.invitationInfo ?? (async () => ({ status: o.statut ?? 'valide', kind: o.kind ?? 'membre' })),
    creerCompte: o.creerCompte ?? (async (email) => (journal.push(`créé ${email}`), { id: 'u1' })),
    supprimerCompte: o.supprimerCompte ?? (async (id) => void journal.push(`supprimé ${id}`)),
    consommer: o.consommer ?? (async (_t, uid, nom, fam) => (journal.push(`consommé ${uid} ${nom} ${fam}`), { ok: true, kind: o.kind ?? 'membre' })),
  }
  return { acces, journal }
}

const demande = (corps: unknown, init: RequestInit = {}) =>
  new Request('https://x.supabase.co/functions/v1/accepter-invitation', {
    method: 'POST',
    headers: { Origin: ORIGINE, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: typeof corps === 'string' ? corps : JSON.stringify(corps),
    ...init,
  })

const ok = { token: JETON, email: 'Marie@Exemple.fr ', password: 'un-mot-de-passe', display_name: ' Marie ' }

describe('accepter-invitation', () => {
  it('crée le compte puis le rattache (lien membre)', async () => {
    const { acces, journal } = faux()
    const r = await traiter(demande(ok), acces)
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ ok: true, kind: 'membre' })
    expect(journal).toEqual(['créé marie@exemple.fr', 'consommé u1 Marie null'])
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGINE)
  })

  it('lien fondateur : exige un nom de famille et le transmet', async () => {
    const { acces, journal } = faux({ kind: 'fondateur' })
    expect((await traiter(demande(ok), acces)).status).toBe(400)
    expect(journal).toEqual([]) // aucun compte créé
    const r = await traiter(demande({ ...ok, family_name: ' Les Martin ' }), acces)
    expect(r.status).toBe(201)
    expect(journal).toEqual(['créé marie@exemple.fr', 'consommé u1 Marie Les Martin'])
  })

  it.each(['inconnue', 'annulee', 'utilisee', 'expiree'])('refuse un lien %s sans créer de compte', async (statut) => {
    const { acces, journal } = faux({ statut })
    const r = await traiter(demande(ok), acces)
    expect(r.status).toBe(410)
    expect(journal).toEqual([])
  })

  it('supprime le compte si le rattachement échoue (pas de compte orphelin)', async () => {
    const { acces, journal } = faux({ consommer: async () => ({ ok: false, message: 'Lien déjà utilisé' }) })
    const r = await traiter(demande(ok), acces)
    expect(r.status).toBe(410)
    expect(journal).toEqual(['créé marie@exemple.fr', 'supprimé u1'])
  })

  it('adresse déjà utilisée : 409, rien d’autre', async () => {
    const { acces, journal } = faux({ creerCompte: async () => ({ erreur: 'existe' as const }) })
    const r = await traiter(demande(ok), acces)
    expect(r.status).toBe(409)
    expect(journal).toEqual([])
  })

  it.each([
    ['jeton mal formé', { ...ok, token: 'abc' }],
    ['e-mail invalide', { ...ok, email: 'pas-un-email' }],
    ['mot de passe trop court', { ...ok, password: 'court' }],
    ['prénom vide', { ...ok, display_name: '  ' }],
    ['prénom trop long', { ...ok, display_name: 'x'.repeat(41) }],
  ])('refuse : %s', async (_l, corps) => {
    const { acces, journal } = faux()
    expect((await traiter(demande(corps), acces)).status).toBe(400)
    expect(journal).toEqual([])
  })

  it('refuse une autre origine, une autre méthode, un corps illisible ou trop gros', async () => {
    const { acces } = faux()
    expect((await traiter(demande(ok, { headers: { Origin: 'https://espion.example' } }), acces)).status).toBe(403)
    expect((await traiter(new Request('https://x/f', { method: 'GET' }), acces)).status).toBe(405)
    expect((await traiter(demande('{pas du json'), acces)).status).toBe(400)
    expect((await traiter(demande({ ...ok, display_name: 'x'.repeat(5000) }), acces)).status).toBe(413)
  })

  it('répond à la pré-vérification CORS du navigateur', async () => {
    const r = await traiter(new Request('https://x/f', { method: 'OPTIONS', headers: { Origin: ORIGINE } }), faux().acces)
    expect(r.status).toBe(204)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGINE)
    const autre = await traiter(new Request('https://x/f', { method: 'OPTIONS', headers: { Origin: 'https://espion.example' } }), faux().acces)
    expect(autre.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
