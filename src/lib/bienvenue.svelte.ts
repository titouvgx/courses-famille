// Écran de bienvenue plein écran : montré à chaque ouverture de l'appli (une fois
// connecté), jusqu'à ce que la personne choisisse « Ne plus afficher » sur ce téléphone.
// Clé à part (pas « courses:* ») : elle survit à la déconnexion, exprès.

const key = (userId: string) => `lichouz:bienvenue-vue:${userId}`

/** Fermé pour cette ouverture de l'appli (remis à zéro au prochain lancement). */
export const welcome = $state({ closedThisLaunch: false })

/** true si la personne a choisi « Ne plus afficher » sur ce téléphone. */
export function welcomeSeen(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return true // stockage indisponible (navigation privée…) : on ne harcèle pas
  }
}

/** « Ne plus afficher » : définitif pour cette personne sur ce téléphone. */
export function markWelcomeSeen(userId: string): void {
  try {
    localStorage.setItem(key(userId), '1')
  } catch {
    // stockage indisponible : fermé au moins pour cette ouverture
  }
  welcome.closedThisLaunch = true
}
