<script lang="ts">
  import Icon from '../components/Icon.svelte'
  // Page d'accueil : 5 recettes tirées au hasard chaque jour, qui flottent à l'écran.
  // - Le tirage dépend de la date → même sélection pour toute la famille, change à minuit.
  // - Le placement est calculé (lib/floatLayout.ts) pour tenir dans l'écran sans chevauchement.
  import { onDestroy } from 'svelte'
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { fetchDailyRecipes, todayKey, DAILY_RECIPES_COUNT } from '../lib/api/recipes'
  import { computeFloatLayout, MIN_ZONE_HEIGHT } from '../lib/floatLayout'
  import FloatingRecipeCard from '../components/FloatingRecipeCard.svelte'
  import PlanRecipeDialog from '../components/PlanRecipeDialog.svelte'
  import { fetchRecipe } from '../lib/api/recipes'
  import { toast } from '../lib/toast.svelte'
  import type { RecipeDetail } from '../lib/types'
  import type { RecipeWithCategory } from '../lib/types'

  // ────────── Données ──────────

  let recipes: RecipeWithCategory[] = $state([])
  let loading = $state(true)
  let error = $state<string | null>(null)

  /** Date du jour (AAAA-MM-JJ). Quand elle change, l'effet ci-dessous refait le tirage. */
  let dateKey = $state(todayKey())
  let now = $state(new Date())

  $effect(() => {
    if (profileState.loading) return
    const key = dateKey
    let cancelled = false // évite qu'une vieille requête écrase une plus récente

    loading = true
    error = null
    fetchDailyRecipes(key)
      .then((r) => { if (!cancelled) recipes = r })
      .catch((e) => { if (!cancelled) error = e?.message ?? 'Erreur de chargement' })
      .finally(() => { if (!cancelled) loading = false })

    return () => { cancelled = true }
  })

  // Horloge : compte à rebours + détection de minuit (aussi au retour sur l'app)
  function tick() {
    now = new Date()
    const k = todayKey(now)
    if (k !== dateKey) dateKey = k
  }
  const clock = setInterval(tick, 30_000)
  const onVisible = () => { if (document.visibilityState === 'visible') tick() }
  document.addEventListener('visibilitychange', onVisible)
  onDestroy(() => {
    clearInterval(clock)
    document.removeEventListener('visibilitychange', onVisible)
  })

  // ────────── Textes ──────────

  const firstName = $derived(profileState.profile?.display_name?.trim().split(/\s+/)[0] ?? '')
  const greeting = $derived(now.getHours() >= 18 ? 'Bonsoir' : 'Bonjour')
  const dateLabel = $derived(
    now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  )
  const countdown = $derived.by(() => {
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    const mins = Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 60000))
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
  })

  // ────────── Placement ──────────

  let zoneW = $state(0)
  let zoneH = $state(0)

  const cardCount = $derived(loading ? DAILY_RECIPES_COUNT : recipes.length)
  const layout = $derived(computeFloatLayout(zoneW, zoneH, cardCount, `layout:${dateKey}`))

  // ────────── Planifier directement depuis une carte ──────────
  // La fenêtre a besoin des ingrédients : on charge la recette complète au clic.
  let planRecipe = $state<RecipeDetail | null>(null)
  let opening = false

  async function openPlan(recipeId: string) {
    if (opening) return
    opening = true
    try {
      planRecipe = await fetchRecipe(recipeId)
    } catch (e: any) {
      toast.error(e?.message ?? 'Recette introuvable')
    } finally {
      opening = false
    }
  }

  // ────────── Parallaxe (souris uniquement) ──────────
  // Au doigt, pointermove se déclenche pendant le défilement : les cartes
  // sauteraient. On la réserve donc à la souris / au trackpad.

  let px = $state(0)
  let py = $state(0)
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0

  function onPointerMove(e: PointerEvent) {
    if (reduceMotion || e.pointerType !== 'mouse') return
    const el = e.currentTarget as HTMLElement
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      px = ((e.clientX - r.left) / r.width - 0.5) * 2 // −1 → 1
      py = ((e.clientY - r.top) / r.height - 0.5) * 2
    })
  }

  function resetParallax() {
    cancelAnimationFrame(frame)
    px = 0
    py = 0
  }

  onDestroy(() => cancelAnimationFrame(frame))
</script>

{#if planRecipe}
  <PlanRecipeDialog recipe={planRecipe} mode="plan" onclose={() => (planRecipe = null)} />
{/if}

<div class="page accueil">

  <header class="hero">
    <span class="date-chip">{dateLabel}</span>
    <h1>
      {greeting}{firstName ? ` ${firstName}` : ''}
    </h1>
    <p class="subtitle">
      Tes <strong>{DAILY_RECIPES_COUNT} idées</strong> du jour
    </p>
  </header>

  {#if error}
    <div class="state error-msg" role="alert">
      <p>Impossible de charger les recettes du jour.</p>
      <p class="state-detail">{error}</p>
    </div>
  {:else if !loading && recipes.length === 0}
    <div class="state">
      <p class="state-icon"><Icon name="book" size={48} strokeWidth={1.5} /></p>
      <p>Aucune recette pour le moment.</p>
      <a href="#/nouvelle-recette" class="btn btn-primary state-cta">Créer la première recette</a>
    </div>
  {:else}
    <section
      class="float-zone"
      aria-label="Recettes du jour"
      aria-busy={loading}
      bind:clientWidth={zoneW}
      bind:clientHeight={zoneH}
      style:min-height="{MIN_ZONE_HEIGHT}px"
      style:--px={px}
      style:--py={py}
      onpointermove={onPointerMove}
      onpointerleave={resetParallax}
    >
      {#each layout.slots as slot, i (i)}
        <FloatingRecipeCard
          {slot}
          index={i}
          recipe={loading ? null : (recipes[i] ?? null)}
          featured={i === 0}
          onplan={openPlan}
        />
      {/each}
    </section>

    <footer class="accueil-footer">
      <p class="countdown">
        <span class="dot" aria-hidden="true"></span>
        <span>Nouvelles idées dans <strong>{countdown}</strong></span>
      </p>
      <a href={href('recettes')} class="see-all">Toutes les recettes →</a>
    </footer>
  {/if}
</div>

<style>
  .accueil {
    position: relative;
    display: flex;
    flex-direction: column;
    /* svh = hauteur stable : ne bouge pas quand la barre d'adresse se replie,
       sinon les cartes seraient recalculées pendant le défilement */
    min-height: calc(100vh - 76px - env(safe-area-inset-bottom, 0px));
    min-height: calc(100svh - 76px - env(safe-area-inset-bottom, 0px));
    padding: var(--gutter);
    padding-top: calc(14px + env(safe-area-inset-top, 0px));
    padding-bottom: 8px;
    overflow: hidden;
    isolation: isolate;
  }

  /* ── En-tête ────────────────────────────────── */
  .hero {
    padding-right: 48px; /* place pour l'avatar en haut à droite */
  }

  /* Le fond est une photo sombre (clair comme sombre) : textes de l'en-tête en blanc */
  .date-chip {
    display: inline-block;
    padding: 3px 11px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.16);
    color: #FFFFFF;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .date-chip::first-letter {
    text-transform: uppercase;
  }

  .hero h1 {
    font-size: clamp(28px, 8vw, 44px);
    font-weight: 800;
    color: #FFFFFF;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  }



  .subtitle {
    margin-top: 4px;
    color: rgba(255, 255, 255, 0.82);
    font-size: 15px;
  }

  .subtitle strong {
    color: var(--accent);
  }

  /* ── Zone flottante ─────────────────────────── */
  .float-zone {
    position: relative;
    flex: 1;
    /* bord à bord : on récupère les marges latérales pour des cartes plus grandes */
    margin: 4px calc(var(--gutter) * -1) 0;
  }

  /* ── Pied de page ───────────────────────────── */
  .accueil-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 6px;
  }

  .countdown {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 12px 6px 10px;
    border-radius: 14px;
    /* pastille opaque : lisible sur le motif, sans flou (coûteux sur mobile) */
    background: color-mix(in srgb, var(--bg-raised) 88%, transparent);
    font-size: 13px;
    line-height: 1.3;
    color: var(--text-secondary);
  }

  .countdown strong {
    white-space: nowrap; /* « 15 h 39 » ne doit jamais être coupé */
    color: var(--text);
  }

  .dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    animation: ping 2s ease-out infinite;
  }

  @keyframes ping {
    0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 60%, transparent); }
    100% { box-shadow: 0 0 0 9px transparent; }
  }

  .see-all {
    flex-shrink: 0;
    min-height: 44px; /* zone de tap confortable */
    display: inline-flex;
    align-items: center;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--bg-raised);
    border: 1.5px solid var(--border-strong);
    color: var(--primary);
    font-size: 14px;
    font-weight: 700;
    touch-action: manipulation;
  }

  .see-all:active {
    transform: scale(0.96);
  }

  /* ── États ──────────────────────────────────── */
  .state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    text-align: center;
    padding: 32px 16px;
    color: var(--text-secondary);
  }

  .state-icon {
    color: var(--text-secondary);
  }

  .state-detail {
    font-size: 12px;
    opacity: 0.8;
  }

  .error-msg {
    color: var(--error);
  }

  .state-cta {
    margin-top: 16px;
    width: auto;
    padding: 14px 24px;
  }

  /* Très petits écrans (iPhone SE, vieux Android) */
  @media (max-width: 359px) {
    .countdown { font-size: 12px; }
    .see-all { padding: 0 10px; font-size: 13px; }
  }
</style>
