// Routeur « par # » : l'adresse ressemble à https://…/#/courses.
// Le serveur (GitHub Pages) ne voit jamais ce qui suit le #, il renvoie donc
// toujours index.html : aucune erreur 404 possible, même en rechargeant la page.

export type Route = 'recettes' | 'semaine' | 'courses' | 'plus' | 'introuvable'

const ROUTES: Route[] = ['recettes', 'semaine', 'courses', 'plus']
const DEFAULT_ROUTE: Route = 'semaine'

function readHash(): Route {
  // "#/courses" → "courses" ; adresse vide → page par défaut
  const path = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  if (path === '') return DEFAULT_ROUTE
  return (ROUTES as string[]).includes(path) ? (path as Route) : 'introuvable'
}

// $state = valeur réactive de Svelte 5 : tout composant qui lit router.current
// se met à jour tout seul quand elle change.
export const router = $state({ current: readHash() })

window.addEventListener('hashchange', () => {
  router.current = readHash()
})

export function href(route: Route): string {
  return `#/${route}`
}
