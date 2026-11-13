import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, loadEnv } from 'vite'

/**
 * Refuse de construire le site si la clé fournie n'est pas une clé publique.
 * Le garde-fou de src/lib/supabase.ts agit trop tard : au moment où il
 * s'exécute, la clé est déjà dans le JavaScript envoyé à tout le monde.
 */
function assertPublicKey(key: string | undefined) {
  if (!key) return // pas de clé : l'appli affichera « Supabase non configuré »
  if (key.startsWith('sb_secret_')) {
    throw new Error('Clé SECRÈTE détectée dans VITE_SUPABASE_PUBLISHABLE_KEY : build arrêté. Utilise la clé publishable.')
  }
  // Anciennes clés (JWT) : refuser le rôle service_role
  const parts = key.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      if (payload?.role === 'service_role') {
        throw new Error('Clé service_role détectée : build arrêté. Utilise la clé publique (anon / publishable).')
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('build arrêté')) throw e
    }
  }
}

// base: './' = chemins relatifs. L'appli marche donc quelle que soit
// l'adresse GitHub Pages (https://<toi>.github.io/<nom-du-depot>/),
// sans avoir à écrire le nom du dépôt ici.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  assertPublicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY)
  return {
    base: './',
    plugins: [svelte()],
  }
})
