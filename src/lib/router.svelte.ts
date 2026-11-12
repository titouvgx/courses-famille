// Routeur « par # » : l'adresse ressemble à https://…/#/courses.
// Le serveur (GitHub Pages) ne voit jamais ce qui suit le #, il renvoie donc
// toujours index.html : aucune erreur 404 possible, même en rechargeant la page.

export type Route =
  | 'login'
  | 'recettes'
  | 'recette'          // détail : #/recette/<id>
  | 'nouvelle-recette' // création : #/nouvelle-recette
  | 'editer-recette'   // édition : #/editer-recette/<id>
  | 'semaine'
  | 'courses'
  | 'historique'
  | 'compte'           // page profil / mon compte
  | 'introuvable'

/** Les 4 onglets de la tab bar. */
export const TAB_ROUTES = ['recettes', 'semaine', 'courses', 'historique'] as const
export type TabRoute = (typeof TAB_ROUTES)[number]

const STATIC_ROUTES: string[] = ['login', 'recettes', 'nouvelle-recette', 'semaine', 'courses', 'historique', 'compte']
const DEFAULT_ROUTE: Route = 'recettes'

interface RouterState {
  current: Route
  /** ID de la recette quand current === 'recette'. */
  recipeId: string | null
}

function readHash(): RouterState {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/')

  if (raw === '') return { current: DEFAULT_ROUTE, recipeId: null }

  // Routes dynamiques
  if (parts[0] === 'recette' && parts[1]) {
    return { current: 'recette', recipeId: parts[1] }
  }
  if (parts[0] === 'editer-recette' && parts[1]) {
    return { current: 'editer-recette', recipeId: parts[1] }
  }

  // Routes statiques
  if (STATIC_ROUTES.includes(parts[0])) {
    return { current: parts[0] as Route, recipeId: null }
  }

  return { current: 'introuvable', recipeId: null }
}

// $state = valeur réactive de Svelte 5
export const router: RouterState = $state(readHash())

window.addEventListener('hashchange', () => {
  const next = readHash()
  router.current = next.current
  router.recipeId = next.recipeId
})

export function href(route: Route | string, id?: string): string {
  if (route === 'recette' && id) return `#/recette/${id}`
  if (route === 'editer-recette' && id) return `#/editer-recette/${id}`
  return `#/${route}`
}

/** Navigation programmatique. */
export function navigate(route: Route | string, id?: string): void {
  window.location.hash = href(route, id).slice(1) // enlève le #
}
