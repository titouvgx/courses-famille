import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app

// ── Service Worker (PWA) ──
if ('serviceWorker' in navigator) {
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

    // Quand un nouveau service worker prend la main (nouvelle version déployée),
    // on recharge une fois pour afficher tout de suite le nouveau code.
    let reloaded = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    })
  })
}
