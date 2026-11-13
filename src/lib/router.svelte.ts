import { tick } from 'svelte'

// Routeur « par # » : l'adresse ressemble à https://…/#/courses.
// Le serveur (GitHub Pages) ne voit jamais ce qui suit le #, il renvoie donc
// toujours index.html : aucune erreur 404 possible, même en rechargeant la page.

export type Route =
  | 'login'
  | 'accueil'          // page d'accueil : 5 recettes du jour
  | 'recettes'
  | 'recette'          // détail : #/recette/<id>
  | 'nouvelle-recette' // création : #/nouvelle-recette
  | 'editer-recette'   // édition : #/editer-recette/<id>
  | 'semaine'
  | 'courses'
  | 'historique'
  | 'compte'           // page profil / mon compte
  | 'introuvable'

/** Les 5 onglets de la tab bar. */
export const TAB_ROUTES = ['accueil', 'recettes', 'semaine', 'courses', 'historique'] as const
export type TabRoute = (typeof TAB_ROUTES)[number]

const STATIC_ROUTES: string[] = ['login', 'accueil', 'recettes', 'nouvelle-recette', 'semaine', 'courses', 'historique', 'compte']
const DEFAULT_ROUTE: Route = 'accueil'

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

// ── Transitions entre pages (API View Transitions) ──
// On avance (onglet plus à droite, ouverture d'une fiche) → la page glisse vers la gauche.
// On recule → elle glisse vers la droite. Seul .app-shell (le contenu) bouge :
// le fond photo, la barre d'onglets et l'avatar restent immobiles (voir app.css).
// Navigateurs sans cette API (ou « réduire les animations ») : changement direct,
// l'animation CSS « page-in » prend le relais.

/** Position de chaque écran : onglets de gauche à droite, sous-pages juste après leur onglet. */
const ORDER: Record<Route, number> = {
  login: -10,
  accueil: 0,
  recettes: 10, recette: 11, 'nouvelle-recette': 11, 'editer-recette': 12,
  semaine: 20,
  courses: 30,
  historique: 40,
  compte: 50,
  introuvable: 60,
}

const supportsViewTransitions =
  typeof document !== 'undefined' && 'startViewTransition' in document

if (supportsViewTransitions) document.documentElement.classList.add('vt')

function applyRoute(next: RouterState) {
  router.current = next.current
  router.recipeId = next.recipeId
  window.scrollTo(0, 0) // chaque nouvel écran commence en haut
}

window.addEventListener('hashchange', () => {
  const next = readHash()
  if (next.current === router.current && next.recipeId === router.recipeId) return

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!supportsViewTransitions || reduce) {
    applyRoute(next)
    return
  }

  const root = document.documentElement
  root.dataset.nav =
    next.current === 'login' || router.current === 'login'
      ? 'fade'
      : ORDER[next.current] >= ORDER[router.current] ? 'forward' : 'back'

  const transition = (document as any).startViewTransition(async () => {
    applyRoute(next)
    await tick() // attendre que Svelte ait mis la nouvelle page dans le DOM
  })
  transition.finished.finally(() => {
    delete root.dataset.nav
  })
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
