<script lang="ts">
  // Mode « En cuisine » : une étape à la fois, en très gros, plein écran.
  // - Précédent / Suivant (boutons larges, flèches du clavier, balayage au doigt)
  // - Rappel des ingrédients (panneau qui se déplie, quantités à l'échelle des portions choisies)
  // - Écran gardé allumé (Screen Wake Lock) tant que le mode est ouvert, si le navigateur le permet
  import { onMount, onDestroy, untrack } from 'svelte'
  import Icon from './Icon.svelte'
  import { formatIngredient } from '../lib/quantities'
  import type { RecipeDetail } from '../lib/types'

  interface Props {
    recipe: RecipeDetail
    /** Portions choisies sur la fiche (les quantités du rappel suivent) */
    portions: number
    /** Étape affichée à l'ouverture (index à partir de 0) */
    start?: number
    onclose: () => void
  }
  let { recipe, portions, start = 0, onclose }: Props = $props()

  const steps = $derived(recipe.recipe_steps)
  const scale = $derived(portions / (recipe.default_portions || portions || 1))

  // La vue est recréée à chaque ouverture : on lit volontairement la valeur de départ.
  let index = $state(untrack(() => Math.min(Math.max(start, 0), Math.max(recipe.recipe_steps.length - 1, 0))))
  /** Sens du dernier changement d'étape (pour l'animation d'entrée) */
  let dir = $state<1 | -1>(1)
  let showIngredients = $state(false)
  let dialogEl: HTMLDivElement | undefined = $state()

  const isFirst = $derived(index === 0)
  const isLast = $derived(index >= steps.length - 1)

  function go(delta: 1 | -1) {
    const next = index + delta
    if (next < 0 || next >= steps.length) return
    dir = delta
    index = next
  }

  // ── Garder l'écran allumé ──
  // Volontairement PAS en $state : simple poignée, lue et écrite hors du rendu.
  let wakeLock: WakeLockSentinel | null = null
  let closed = false

  async function acquireWakeLock() {
    if (closed || wakeLock || document.visibilityState !== 'visible') return
    if (!('wakeLock' in navigator)) return // repli silencieux (navigateur trop ancien)
    try {
      const lock = await navigator.wakeLock.request('screen')
      if (closed) { lock.release().catch(() => {}); return }
      wakeLock = lock
      // Le navigateur relâche le verrou tout seul quand l'onglet passe en arrière-plan
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null })
    } catch {
      // Refusé (économie d'énergie, iframe, contexte non sécurisé…) : on ne dit rien
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') acquireWakeLock()
  }

  // ── Balayage gauche / droite ──
  let swipe: { id: number; x: number; y: number } | null = null
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return // à la souris, on a les boutons et le clavier
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY }
  }
  function onPointerUp(e: PointerEvent) {
    if (!swipe || swipe.id !== e.pointerId) return
    const dx = e.clientX - swipe.x
    const dy = e.clientY - swipe.y
    swipe = null
    // Geste franchement horizontal uniquement (sinon c'est un défilement vertical)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showIngredients) showIngredients = false
      else onclose()
    } else if (e.key === 'ArrowRight') {
      go(1)
    } else if (e.key === 'ArrowLeft') {
      go(-1)
    }
  }

  let previousFocus: HTMLElement | null = null
  onMount(() => {
    previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden' // la page derrière ne défile plus
    document.addEventListener('visibilitychange', onVisibility)
    acquireWakeLock()
    dialogEl?.focus()
  })
  onDestroy(() => {
    closed = true
    document.body.style.overflow = ''
    document.removeEventListener('visibilitychange', onVisibility)
    wakeLock?.release().catch(() => {})
    wakeLock = null
    previousFocus?.focus?.()
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="cook"
  bind:this={dialogEl}
  role="dialog"
  aria-modal="true"
  aria-labelledby="cook-title"
  tabindex="-1"
>
  <header class="cook-top">
    <button class="round" onclick={onclose} aria-label="Fermer le mode cuisine">
      <Icon name="x" size={22} />
    </button>
    <div class="cook-heading">
      <span class="cook-kicker"><Icon name="chef" size={14} /> En cuisine</span>
      <h2 id="cook-title" class="cook-title">{recipe.title}</h2>
    </div>
    {#if recipe.recipe_ingredients.length > 0}
      <button
        class="pill"
        class:on={showIngredients}
        onclick={() => (showIngredients = !showIngredients)}
        aria-expanded={showIngredients}
        aria-controls="cook-ingredients"
      >
        <Icon name="list" size={18} /> Ingrédients
      </button>
    {/if}
  </header>

  {#if steps.length > 0}
    <!-- Barre de progression : un segment par étape -->
    <div class="progress" aria-hidden="true">
      {#each steps as s, i (s.id)}
        <span class="seg" class:done={i < index} class:current={i === index}></span>
      {/each}
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="stage"
      onpointerdown={onPointerDown}
      onpointerup={onPointerUp}
      onpointercancel={() => (swipe = null)}
    >
      {#key index}
        <div class="step" class:back={dir === -1} aria-live="polite">
          <p class="step-count">Étape {index + 1} sur {steps.length}</p>
          <p class="step-text">{steps[index].instruction}</p>
        </div>
      {/key}
    </div>

    <nav class="cook-nav" aria-label="Étapes">
      <button class="nav-btn prev" onclick={() => go(-1)} disabled={isFirst}>
        <Icon name="arrow-left" size={22} /> Précédent
      </button>
      {#if isLast}
        <button class="nav-btn next finish" onclick={onclose}>
          <Icon name="check" size={22} /> Terminé
        </button>
      {:else}
        <button class="nav-btn next" onclick={() => go(1)}>
          Suivant <Icon name="arrow-right" size={22} />
        </button>
      {/if}
    </nav>
  {:else}
    <div class="stage empty"><p>Cette recette n'a pas encore d'étapes.</p></div>
  {/if}

  {#if showIngredients}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="sheet-backdrop" onclick={() => (showIngredients = false)}></div>
    <section id="cook-ingredients" class="sheet" aria-label="Ingrédients pour {portions} portions">
      <div class="sheet-head">
        <h3>Ingrédients <span class="sheet-sub">· {portions} portion{portions > 1 ? 's' : ''}</span></h3>
        <button class="round small" onclick={() => (showIngredients = false)} aria-label="Masquer les ingrédients">
          <Icon name="chevron-down" size={20} />
        </button>
      </div>
      <ul class="sheet-list">
        {#each recipe.recipe_ingredients as ing (ing.id)}
          {@const qty = formatIngredient(ing.quantity, ing.unit, scale)}
          <li>
            <span class="sheet-qty">{qty}</span>
            <span class="sheet-name">{ing.name}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .cook {
    position: fixed;
    inset: 0;
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
    display: flex;
    flex-direction: column;
    /* Opaque : on cuisine, la photo de fond n'apporte rien et gêne la lecture */
    background: var(--bg);
    color: var(--text);
    padding:
      calc(12px + env(safe-area-inset-top, 0px))
      calc(16px + env(safe-area-inset-right, 0px))
      calc(16px + env(safe-area-inset-bottom, 0px))
      calc(16px + env(safe-area-inset-left, 0px));
    outline: none;
    animation: cook-in 0.22s ease-out;
    overscroll-behavior: contain;
  }

  @keyframes cook-in {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: none; }
  }

  /* ── En-tête ── */
  .cook-top {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .round {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .round.small {
    width: 44px;
    height: 44px;
  }

  .cook-heading {
    flex: 1;
    min-width: 0;
  }

  .cook-kicker {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--primary);
  }

  .cook-title {
    font-family: var(--font-display);
    font-size: 17px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .pill.on {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }

  /* ── Progression ── */
  .progress {
    display: flex;
    gap: 4px;
    margin: 16px 0 0;
  }

  .seg {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
    transition: background-color 0.2s;
  }

  .seg.done { background: color-mix(in srgb, var(--primary) 55%, transparent); }
  .seg.current { background: var(--primary); }

  /* ── Étape ── */
  .stage {
    flex: 1;
    min-height: 0;
    overflow-y: auto; /* les très longues étapes défilent */
    display: flex;
    touch-action: pan-y; /* le balayage horizontal est pour nous */
    -webkit-overflow-scrolling: touch;
  }

  .stage.empty {
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .step {
    margin: auto 0; /* centré verticalement, mais défile proprement si trop long */
    width: 100%;
    max-width: 760px;
    margin-inline: auto;
    padding: 24px 4px;
    animation: step-in 0.22s ease-out;
  }

  .step.back { animation-name: step-in-back; }

  @keyframes step-in {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: none; }
  }

  @keyframes step-in-back {
    from { opacity: 0; transform: translateX(-24px); }
    to   { opacity: 1; transform: none; }
  }

  .step-count {
    font-size: 15px;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: 0.02em;
    margin-bottom: 14px;
  }

  .step-text {
    font-family: var(--font-display);
    font-size: clamp(26px, 7.2vw, 40px);
    font-weight: 500;
    line-height: 1.38;
    color: var(--text);
    overflow-wrap: break-word; /* pas de césure : un mot coupé se lit mal d'un coup d'œil */
  }

  /* ── Navigation ── */
  .cook-nav {
    display: flex;
    gap: 12px;
    max-width: 760px;
    width: 100%;
    margin: 0 auto;
  }

  .nav-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 60px;
    border-radius: var(--radius-xl);
    font-family: var(--font-body);
    font-size: 17px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.15s, transform 0.1s;
  }

  .nav-btn:active:not(:disabled) { transform: scale(0.97); }

  .prev {
    flex: 0 1 42%;
    background: transparent;
    color: var(--text);
    border: 1.5px solid var(--border-strong);
  }

  .prev:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .next {
    background: var(--primary);
    color: var(--on-primary);
    border: none;
  }

  .next.finish {
    background: var(--success);
    color: var(--on-success);
  }

  .round:focus-visible,
  .pill:focus-visible,
  .nav-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* ── Rappel des ingrédients (panneau du bas) ── */
  .sheet-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    animation: fade 0.18s ease-out;
  }

  @keyframes fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .sheet {
    position: absolute;
    inset: auto 0 0 0;
    max-height: 70svh;
    display: flex;
    flex-direction: column;
    background: #0B1D3B; /* un ton plus profond que --bg, pour détacher le panneau */
    border-top: 1px solid var(--border-strong);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.35);
    animation: sheet-in 0.22s ease-out;
  }

  @keyframes sheet-in {
    from { transform: translateY(40px); opacity: 0; }
    to   { transform: none; opacity: 1; }
  }

  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }

  .sheet-head h3 {
    font-family: var(--font-display);
    font-size: 20px;
  }

  .sheet-sub {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .sheet-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    max-width: 760px;
    width: 100%;
    margin-inline: auto;
  }

  .sheet-list li {
    display: flex;
    gap: 14px;
    align-items: baseline;
    padding: 12px 2px;
    border-bottom: 1px solid var(--border);
    font-size: 18px;
    line-height: 1.35;
  }

  .sheet-list li:last-child { border-bottom: none; }

  .sheet-qty {
    flex-shrink: 0;
    min-width: 76px;
    font-weight: 700;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
  }

  .sheet-name { color: var(--text); }

  @media (hover: hover) and (pointer: fine) {
    .round:hover,
    .pill:not(.on):hover {
      background: var(--surface-hover);
    }
    .prev:not(:disabled):hover {
      background: var(--surface);
    }
    .next:hover { opacity: 0.92; }
  }
</style>
