// Écran de bienvenue : montré une seule fois par personne et par téléphone.
// Clé à part (pas « courses:* ») : elle survit à la déconnexion, exprès.

const key = (userId: string) => `lichouz:bienvenue-vue:${userId}`

/** true si la personne a déjà vu (ou fermé) l'écran de bienvenue sur ce téléphone. */
export function welcomeSeen(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === '1'
  } catch {
    return true // stockage indisponible (navigation privée…) : on ne harcèle pas
  }
}

export function markWelcomeSeen(userId: string): void {
  try {
    localStorage.setItem(key(userId), '1')
  } catch {
    // stockage indisponible : tant pis, rien de grave
  }
}
