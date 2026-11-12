<script lang="ts">
  import { router, href } from '../lib/router.svelte'

  // Page fiche recette — détail d'une recette (étape 4)
</script>

<div class="page">
  <a href={href('recettes')} class="back">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
    Recettes
  </a>

  <h1>Recette</h1>
  <p class="placeholder">Détail de la recette <code>{router.recipeId}</code> — étape 4.</p>
</div>

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--primary);
    font-size: 15px;
    font-weight: 500;
    margin-bottom: 16px;
  }

  .placeholder {
    margin-top: 12px;
    color: var(--text-secondary);
    font-size: 15px;
  }

  code {
    background: var(--surface);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
