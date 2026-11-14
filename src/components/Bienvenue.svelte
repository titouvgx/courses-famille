<script lang="ts">
  // Écran de bienvenue (1er lancement) : le principe en 3 étapes et un lien vers l'aide.
  import Icon from './Icon.svelte'
  import { navigate } from '../lib/router.svelte'

  let { onclose }: { onclose: () => void } = $props()

  let primary = $state<HTMLButtonElement | null>(null)
  $effect(() => {
    primary?.focus()
  })

  function discover() {
    onclose()
    navigate('aide')
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window {onkeydown} />

<div class="overlay" role="presentation">
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <h2 id="welcome-title">Bienvenue sur Madéo</h2>
    <p class="lead">Les repas et les courses de la maison, au même endroit et à jour pour tout le monde.</p>
    <ol class="steps">
      <li><span class="step-icon"><Icon name="book" size={18} /></span><span><strong>Choisis des recettes</strong> : les tiennes ou celles du catalogue.</span></li>
      <li><span class="step-icon"><Icon name="calendar" size={18} /></span><span><strong>Planifie la semaine</strong> : qui mange quoi, et qui cuisine.</span></li>
      <li><span class="step-icon"><Icon name="cart" size={18} /></span><span><strong>La liste de courses se fait toute seule</strong>, et chacun la voit cochée en direct.</span></li>
    </ol>
    <div class="actions">
      <button class="btn btn-primary" bind:this={primary} onclick={discover}>
        Découvrir l’appli <Icon name="arrow-right" size={18} />
      </button>
      <button class="btn btn-outline" onclick={onclose}>Plus tard</button>
    </div>
    <p class="hint">L’aide reste dans <strong>Mon compte</strong>.</p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgba(3, 10, 24, 0.66);
    padding: 16px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
    animation: fade 0.2s ease-out;
  }
  .sheet {
    width: 100%;
    max-width: 440px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 22px 20px 16px;
    display: grid;
    gap: 14px;
    animation: rise 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  h2 {
    font-family: var(--font-display);
    font-size: 24px;
  }
  .lead { color: var(--text-secondary); font-size: 15px; line-height: 1.45; }
  .steps { list-style: none; display: grid; gap: 12px; padding: 0; margin: 0; }
  .steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.4; }
  .step-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--primary-light);
    color: var(--primary);
    flex-shrink: 0;
  }
  .actions { display: grid; gap: 10px; margin-top: 4px; }
  .actions .btn { min-height: 48px; width: 100%; justify-content: center; }
  .hint { text-align: center; font-size: 13px; color: var(--text-secondary); }

  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(24px); } }
  @media (prefers-reduced-motion: reduce) {
    .overlay, .sheet { animation: none; }
  }
</style>
