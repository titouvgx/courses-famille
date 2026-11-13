// Version de l'appli, affichée dans Mon compte et sur la page de connexion.
// Source unique : le champ "version" de package.json (voir CHANGELOG.md pour
// la règle de numérotation). Le commit court distingue deux déploiements
// d'une même version.

export const APP_VERSION: string = __APP_VERSION__
export const APP_COMMIT: string = __APP_COMMIT__

/** Ex. « v0.9.0 · a1b2c3d » */
export const VERSION_LABEL = `v${APP_VERSION} · ${APP_COMMIT}`
