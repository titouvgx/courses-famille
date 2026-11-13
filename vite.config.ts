import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/** Vrai si la valeur ressemble à une clé secrète Supabase (nouvelle ou ancienne). */
function isSecretKey(value: string): boolean {
  if (value.includes('sb_secret_')) return true
  // Anciennes clés (JWT) : refuser le rôle service_role
  const parts = value.split('.')
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      return payload?.role === 'service_role'
    } catch {
      return false
    }
  }
  return false
}

/**
 * Refuse de construire le site si UNE SEULE variable VITE_… contient une clé
 * secrète. Toutes les variables VITE_… finissent dans le JavaScript public :
 * le garde-fou de src/lib/supabase.ts agit trop tard (la clé serait déjà publiée).
 */
function assertNoSecretInPublicEnv(env: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue
    if (isSecretKey(value)) {
      throw new Error(`Clé SECRÈTE détectée dans ${name} : build arrêté. Seule la clé publishable va dans le site.`)
    }
  }
}

/** Version affichée dans l'appli : package.json (source unique) + commit court. */
function readVersion() {
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      commit = 'local'
    }
  }
  return { version: pkg.version, commit }
}

/**
 * Service worker (pwa/sw.js) : copié dans le site au build avec un nom de cache
 * propre à chaque déploiement (version + commit). Chaque déploiement installe
 * donc un nouveau service worker, qui efface l'ancien cache (plus de vieux
 * fichiers qui s'accumulent sur les téléphones).
 */
function serviceWorker(cacheId: string): Plugin {
  return {
    name: 'courses-service-worker',
    apply: 'build',
    generateBundle() {
      const source = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
      if (!source.includes('__CACHE_ID__')) throw new Error('pwa/sw.js : marqueur __CACHE_ID__ introuvable')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: source.replaceAll('__CACHE_ID__', cacheId) })
    },
  }
}

/** Filet final : aucun fichier du site construit ne doit contenir de clé secrète. */
function scanBuildForSecrets(): Plugin {
  let outDir = 'dist'
  return {
    name: 'courses-scan-secrets',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((f) => {
          const p = join(dir, f)
          return statSync(p).isDirectory() ? walk(p) : [p]
        })
      for (const file of walk(outDir)) {
        if (!/\.(js|html|css|json|map|txt)$/.test(file)) continue
        const text = readFileSync(file, 'utf8')
        const jwts = text.match(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g) ?? []
        // Une vraie clé = « sb_secret_ » suivi de nombreux caractères ; le simple mot
        // « sb_secret_ » apparaît légitimement dans le garde-fou de supabase.ts.
        if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text) || jwts.some(isSecretKey)) {
          throw new Error(`Clé secrète trouvée dans ${file} : build refusé.`)
        }
      }
    },
  }
}

// base: './' = chemins relatifs. L'appli marche donc quelle que soit
// l'adresse GitHub Pages (https://<toi>.github.io/<nom-du-depot>/),
// sans avoir à écrire le nom du dépôt ici.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  assertNoSecretInPublicEnv(env)
  const { version, commit } = readVersion()
  return {
    base: './',
    plugins: [svelte(), serviceWorker(`${version}-${commit}`), scanBuildForSecrets()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_COMMIT__: JSON.stringify(commit),
    },
    test: {
      include: ['tests/**/*.test.ts'],
      testTimeout: 60_000,
      hookTimeout: 120_000,
    },
  }
})
