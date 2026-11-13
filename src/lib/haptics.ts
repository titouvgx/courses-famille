// Retour tactile léger (vibration courte).
// Fonctionne sur Android (Chrome, Firefox). Safari sur iPhone ne permet pas
// aux sites web de faire vibrer : l'appel est alors simplement ignoré.
// Respecte « réduire les animations » du système.

export function tap(kind: 'light' | 'success' = 'light'): void {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(kind === 'success' ? [12, 60, 18] : 10)
  } catch {
    // jamais bloquant
  }
}
