import { mount } from 'svelte'
// Polices hébergées avec le site (plus d'appel à Google Fonts : rien n'est envoyé
// à un tiers, et elles marchent hors connexion)
import '@fontsource-variable/outfit'
import '@fontsource-variable/dm-sans'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app

/** Pages où un rechargement automatique ferait perdre une saisie en cours. */
function isEditing(): boolean {
  return /^#\/(nouvelle-recette|editer-recette)/.test(window.location.hash)
}

// ── Service Worker (PWA) ──
// Seulement sur le site construit : en développement, il garderait de vieux fichiers en cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' }) // sw.js toujours relu sur le réseau
      .then((reg) => {
        // Au retour sur l'appli (PWA restée ouverte en arrière-plan), vérifier s'il y a une mise à jour
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch(() => {
        // Silencieux : le SW est un bonus, pas critique
      })

    // Nouvelle version déployée : le nouveau service worker prend la main.
    // On recharge une fois pour afficher le nouveau code, mais jamais au milieu
    // d'un formulaire de recette : on attend que l'utilisateur quitte la page.
    // Une première installation (aucun ancien SW) ne recharge pas.
    const hadController = !!navigator.serviceWorker.controller
    let reloaded = false
    const reload = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return
      if (!isEditing()) return reload()
      const waitForExit = () => {
        if (isEditing()) return
        window.removeEventListener('hashchange', waitForExit)
        reload()
      }
      window.addEventListener('hashchange', waitForExit)
    })
  })
}
