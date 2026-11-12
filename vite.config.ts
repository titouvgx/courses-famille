import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// base: './' = chemins relatifs. L'appli marche donc quelle que soit
// l'adresse GitHub Pages (https://<toi>.github.io/<nom-du-depot>/),
// sans avoir à écrire le nom du dépôt ici.
export default defineConfig({
  base: './',
  plugins: [svelte()],
})
