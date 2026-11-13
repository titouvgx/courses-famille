<script lang="ts">
  // Fiche recette « magazine » :
  //   grande photo bord à bord → titre + infos → ingrédients (portions ajustables, cochables)
  //   → étapes (touchables pour les marquer faites) → mode « En cuisine » plein écran.
  // Les actions principales (semaine / courses) sont dans une barre collée en bas, au pouce.
  import Icon from '../components/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import PlanRecipeDialog from '../components/PlanRecipeDialog.svelte'
  import CookMode from '../components/CookMode.svelte'
  import { router, href, navigate } from '../lib/router.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { fetchRecipe, deleteRecipe } from '../lib/api/recipes'
  import { formatIngredient } from '../lib/quantities'
  import { sizedImage } from '../lib/images'
  import { toast } from '../lib/toast.svelte'
  import type { RecipeDetail } from '../lib/types'

  const MIN_PORTIONS = 1
  const MAX_PORTIONS = 30

  let recipe = $state<RecipeDetail | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let deleting = $state(false)
  let showDeleteConfirm = $state(false)

  // ── Planifier / ajouter aux courses (fenêtre en 2 étapes) ──
  // 'plan' : choisir un créneau puis proposer les ingrédients ; 'cart' : seulement les ingrédients
  let dialogMode = $state<'plan' | 'cart' | null>(null)

  // ── État local de la fiche (rien n'est enregistré) ──
  let portions = $state(4)
  /** Ingrédients déjà sortis du placard (id → true) */
  let gotIng = $state<Record<string, boolean>>({})
  /** Étapes faites (id → true) */
  let doneStep = $state<Record<string, boolean>>({})
  let cookOpen = $state(false)

  $effect(() => {
    const id = router.recipeId
    if (!id) return

    loading = true
    error = null
    recipe = null
    gotIng = {}
    doneStep = {}
    // Changement de recette (lien, retour arrière…) : on referme tout ce qui était ouvert
    cookOpen = false
    dialogMode = null
    showDeleteConfirm = false

    fetchRecipe(id)
      .then((r) => {
        recipe = r
        if (!r) error = 'Recette introuvable.'
        else portions = r.default_portions || 4
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  const isAdmin = $derived(profileState.profile?.role === 'admin')

  const defaultPortions = $derived(recipe?.default_portions || 4)
  const scale = $derived(portions / defaultPortions)
  const catColor = $derived(recipe?.recipe_categories?.color ?? 'var(--primary)')

  const gotCount = $derived(recipe ? recipe.recipe_ingredients.filter((i) => gotIng[i.id]).length : 0)
  const doneCount = $derived(recipe ? recipe.recipe_steps.filter((s) => doneStep[s.id]).length : 0)
  /** Le mode cuisine reprend à la première étape pas encore faite */
  const cookStart = $derived.by(() => {
    if (!recipe) return 0
    const i = recipe.recipe_steps.findIndex((s) => !doneStep[s.id])
    return i === -1 ? 0 : i
  })

  // Photo à la bonne taille (calculée une fois : inutile de recharger au redimensionnement)
  const wide = typeof window !== 'undefined' && window.innerWidth >= 900
  const heroW = typeof window !== 'undefined' ? Math.min(window.innerWidth, 1080) : 400
  const heroH = Math.round(wide ? heroW / 3 : heroW * 0.75)
  const heroSrc = $derived(recipe?.image_url ? sizedImage(recipe.image_url, heroW, heroH) : null)

  function formatTime(min: number | null): string {
    if (!min) return ''
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
  }

  function setPortions(n: number) {
    portions = Math.min(MAX_PORTIONS, Math.max(MIN_PORTIONS, n))
  }

  async function handleDelete() {
    if (!recipe || deleting) return
    deleting = true
    try {
      await deleteRecipe(recipe.id)
      toast.success('Recette supprimée')
      navigate('recettes')
    } catch (e: any) {
      toast.error(e?.message ?? 'Suppression impossible')
      deleting = false
      showDeleteConfirm = false
    }
  }
</script>

<div class="page detail">
  {#if loading}
    <a href={href('recettes')} class="back-link"><Icon name="arrow-left" size={18} /> Recettes</a>
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error}
    <a href={href('recettes')} class="back-link"><Icon name="arrow-left" size={18} /> Recettes</a>
    <div class="center-msg error-msg">{error}</div>
  {:else if recipe}
    <!-- ── Photo (ou grande initiale) ── -->
    <header class="hero" class:no-photo={!heroSrc} style:--cat={catColor}>
      {#if heroSrc}
        <img
          src={heroSrc}
          alt=""
          class="hero-img"
          width={heroW}
          height={heroH}
          decoding="async"
          fetchpriority="high"
        />
      {:else}
        <span class="monogram" aria-hidden="true">{recipe.title.trim().charAt(0)}</span>
      {/if}
      <a href={href('recettes')} class="hero-btn back" aria-label="Retour aux recettes">
        <Icon name="arrow-left" size={22} />
      </a>
      <!-- Pas de bouton à droite : le coin haut-droit est occupé par l'avatar (AppHeader, fixe) -->
    </header>

    <div class="content">
      <!-- ── Titre + infos ── -->
      <div class="intro">
        <h1>{recipe.title}</h1>
        <ul class="chips" aria-label="Infos">
          {#if recipe.recipe_categories}
            <li class="chip cat" style:--cat={catColor}>
              <span class="dot" aria-hidden="true"></span>{recipe.recipe_categories.name}
            </li>
          {/if}
          {#if recipe.prep_time_min}
            <li class="chip"><Icon name="clock" size={16} /> {formatTime(recipe.prep_time_min)}</li>
          {/if}
          <li class="chip"><Icon name="users" size={16} /> {portions} portion{portions > 1 ? 's' : ''}</li>
        </ul>
        {#if recipe.recipe_steps.length > 0}
          <button class="cook-btn" onclick={() => (cookOpen = true)}>
            <Icon name="chef" size={20} />
            {doneCount > 0 && doneCount < recipe.recipe_steps.length ? 'Reprendre en cuisine' : 'En cuisine'}
            <span class="cook-hint">une étape à la fois</span>
          </button>
        {/if}
      </div>

      <div class="columns">
        <!-- ── Ingrédients ── -->
        {#if recipe.recipe_ingredients.length > 0}
          <section class="section ingredients" aria-labelledby="h-ing">
            <div class="section-head">
              <h2 id="h-ing">Ingrédients</h2>
              <div class="stepper" role="group" aria-label="Nombre de portions">
                <button
                  class="step-btn"
                  onclick={() => setPortions(portions - 1)}
                  disabled={portions <= MIN_PORTIONS}
                  aria-label="Une portion de moins"
                ><Icon name="minus" size={18} strokeWidth={2.4} /></button>
                <output class="step-val" aria-live="polite">
                  <strong>{portions}</strong>
                  <span>pers.</span>
                </output>
                <button
                  class="step-btn"
                  onclick={() => setPortions(portions + 1)}
                  disabled={portions >= MAX_PORTIONS}
                  aria-label="Une portion de plus"
                ><Icon name="plus" size={18} strokeWidth={2.4} /></button>
              </div>
            </div>

            <p class="hint">
              {#if portions !== defaultPortions}
                Quantités pour {portions} au lieu de {defaultPortions}.
                <button class="link-btn" onclick={() => (portions = defaultPortions)}>Revenir à {defaultPortions}</button>
              {:else if gotCount > 0}
                {gotCount} sur {recipe.recipe_ingredients.length} sortis du placard.
                <button class="link-btn" onclick={() => (gotIng = {})}>Tout décocher</button>
              {:else}
                Touchez un ingrédient une fois sorti du placard.
              {/if}
            </p>

            <ul class="ingredient-list">
              {#each recipe.recipe_ingredients as ing (ing.id)}
                {@const qty = formatIngredient(ing.quantity, ing.unit, scale)}
                <li>
                  <label class="ingredient" class:got={gotIng[ing.id]}>
                    <input
                      type="checkbox"
                      class="sr-only"
                      checked={!!gotIng[ing.id]}
                      onchange={(e) => (gotIng[ing.id] = e.currentTarget.checked)}
                    />
                    <span class="tick" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3} /></span>
                    <span class="ing-name">{ing.name}</span>
                    {#if qty}<span class="ing-qty">{qty}</span>{/if}
                  </label>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <!-- ── Étapes ── -->
        {#if recipe.recipe_steps.length > 0}
          <section class="section steps" aria-labelledby="h-steps">
            <div class="section-head">
              <h2 id="h-steps">Préparation</h2>
              <span class="count">{doneCount}/{recipe.recipe_steps.length}</span>
            </div>
            <p class="hint">
              {#if doneCount > 0}
                <button class="link-btn" onclick={() => (doneStep = {})}>Tout remettre à faire</button>
              {:else}
                Touchez une étape pour la marquer faite.
              {/if}
            </p>
            <ol class="step-list">
              {#each recipe.recipe_steps as step, i (step.id)}
                <li>
                  <button
                    class="step"
                    class:done={doneStep[step.id]}
                    aria-pressed={!!doneStep[step.id]}
                    onclick={() => (doneStep[step.id] = !doneStep[step.id])}
                  >
                    <span class="step-num" aria-hidden="true">
                      {#if doneStep[step.id]}<Icon name="check" size={20} strokeWidth={2.8} />{:else}{i + 1}{/if}
                    </span>
                    <span class="step-text"><span class="sr-only">Étape {i + 1} : </span>{step.instruction}</span>
                  </button>
                </li>
              {/each}
            </ol>
          </section>
        {/if}
      </div>

      {#if isAdmin}
        <div class="admin">
          <a href={href('editer-recette', recipe.id)} class="admin-btn">
            <Icon name="pencil" size={18} /> Modifier
          </a>
          <button class="admin-btn danger" onclick={() => (showDeleteConfirm = true)}>
            <Icon name="trash" size={18} /> Supprimer
          </button>
        </div>
      {/if}
    </div>

    <!-- ── Barre d'actions au pouce (collée au-dessus de la barre d'onglets) ── -->
    <div class="action-bar">
      <button class="act primary" onclick={() => (dialogMode = 'plan')}>
        <Icon name="calendar" size={19} /> Ajouter à ma semaine
      </button>
      <button class="act secondary" onclick={() => (dialogMode = 'cart')} aria-label="Juste les ingrédients">
        <Icon name="cart" size={20} /> <span>Ingrédients</span>
      </button>
    </div>

    {#if showDeleteConfirm}
      <ConfirmDialog
        title="Supprimer cette recette ?"
        confirmLabel="Supprimer"
        danger
        busy={deleting}
        onconfirm={handleDelete}
        oncancel={() => (showDeleteConfirm = false)}
      >
        « {recipe.title} » sera définitivement supprimée, avec ses photos.
      </ConfirmDialog>
    {/if}

    {#if dialogMode}
      <PlanRecipeDialog {recipe} mode={dialogMode} onclose={() => (dialogMode = null)} />
    {/if}

    {#if cookOpen}
      <CookMode {recipe} {portions} start={cookStart} onclose={() => (cookOpen = false)} />
    {/if}
  {/if}
</div>

<style>
  .detail {
    max-width: 1080px;
    margin: 0 auto;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    margin: calc(8px + env(safe-area-inset-top, 0px)) var(--gutter) 0;
    color: var(--primary);
    font-weight: 600;
    text-decoration: none;
  }

  /* ── Photo bord à bord ── */
  .hero {
    position: relative;
    aspect-ratio: 4 / 3;
    max-height: 62svh;
    width: 100%;
    overflow: hidden;
    border-radius: 0 0 28px 28px;
    background: color-mix(in srgb, var(--cat) 35%, var(--bg));
    container-type: inline-size;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
  }

  .hero.no-photo {
    aspect-ratio: 16 / 10;
  }

  .hero-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Voile haut (lisibilité des boutons sur une photo claire) + fondu bas */
  .hero::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(to bottom, rgba(6, 20, 40, 0.45) 0%, transparent 28%),
      linear-gradient(to top, rgba(6, 20, 40, 0.5) 0%, transparent 35%);
  }

  .monogram {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(120px, 42cqw, 260px);
    line-height: 1;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 8px 8px 0 rgba(0, 0, 0, 0.18);
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.08) 0 12px, transparent 12px 24px),
      linear-gradient(150deg, var(--cat), color-mix(in srgb, var(--cat) 55%, #000));
  }

  .hero-btn {
    position: absolute;
    z-index: 1;
    top: calc(12px + env(safe-area-inset-top, 0px));
    width: 46px;
    height: 46px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Fond opaque plutôt qu'un backdrop-filter (coûteux sur téléphone) */
    background: rgba(6, 20, 40, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: #fff;
    text-decoration: none;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.1s;
  }

  .hero-btn:active { transform: scale(0.94); }
  .hero-btn.back { left: calc(12px + env(safe-area-inset-left, 0px)); }

  /* ── Contenu ── */
  .content {
    padding: 22px var(--gutter) 8px;
  }

  .intro h1 {
    font-family: var(--font-display);
    font-size: clamp(30px, 8.4vw, 44px);
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.01em;
    overflow-wrap: break-word;
    hyphens: auto;
    text-wrap: balance;
  }

  .chips {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 13px;
    border-radius: 999px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .chip :global(.icon) { color: var(--primary); }

  .chip .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--cat);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--cat) 35%, transparent);
  }

  .cook-btn {
    margin-top: 18px;
    width: 100%;
    min-height: 54px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    border-radius: var(--radius-lg);
    border: none;
    background: var(--primary);
    color: var(--on-primary);
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.1s, opacity 0.15s;
  }

  .cook-btn:active { transform: scale(0.98); }

  .cook-hint {
    margin-left: auto;
    font-size: 13px;
    font-weight: 500;
    opacity: 0.75;
  }

  .columns {
    margin-top: 28px;
    display: flex;
    flex-direction: column;
    gap: 30px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-head h2 {
    font-family: var(--font-display);
    font-size: 23px;
    font-weight: 700;
  }

  .count {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 6px 0 12px;
    min-height: 20px;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .link-btn {
    background: none;
    border: none;
    padding: 6px 2px; /* zone de tap agrandie sans décaler le texte */
    margin: -6px 0;
    color: var(--primary);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    touch-action: manipulation;
  }

  /* ── Stepper portions ── */
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--bg-raised);
    border: 1px solid var(--border-strong);
  }

  .step-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.1s;
  }

  .step-btn:active:not(:disabled) { transform: scale(0.9); }
  .step-btn:disabled { opacity: 0.35; cursor: default; }

  .step-val {
    min-width: 46px;
    text-align: center;
    line-height: 1.05;
    display: flex;
    flex-direction: column;
  }

  .step-val strong {
    font-family: var(--font-display);
    font-size: 19px;
    font-variant-numeric: tabular-nums;
  }

  .step-val span {
    font-size: 11px;
    color: var(--text-secondary);
  }

  /* ── Ingrédients ── */
  .ingredient-list {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .ingredient-list li + li .ingredient {
    border-top: 1px solid var(--border);
  }

  .ingredient {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    padding: 10px 14px;
    font-size: 16px;
    line-height: 1.3;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .ingredient:focus-within {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  .tick {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: background-color 0.15s, border-color 0.15s;
  }

  .ing-name {
    flex: 1;
    min-width: 0;
    color: var(--text);
    overflow-wrap: break-word;
  }

  .ing-qty {
    flex-shrink: 0;
    font-weight: 700;
    color: var(--primary);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .ingredient.got .tick {
    background: var(--success);
    border-color: var(--success);
    color: var(--on-success);
    animation: check-pop 0.25s ease-out;
  }

  .ingredient.got .ing-name,
  .ingredient.got .ing-qty {
    opacity: 0.5;
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }

  @keyframes check-pop {
    0% { transform: scale(0.7); }
    60% { transform: scale(1.12); }
    100% { transform: scale(1); }
  }

  /* ── Étapes ── */
  .step-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .step {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 16px 16px 14px;
    border-radius: var(--radius-lg);
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: opacity 0.2s, transform 0.1s;
  }

  .step:active { transform: scale(0.99); }

  .step:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .step-num {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--on-primary);
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-text {
    flex: 1;
    min-width: 0;
    padding-top: 7px;
    font-size: 17px;
    line-height: 1.6;
    overflow-wrap: break-word;
  }

  .step.done { opacity: 0.55; }
  .step.done .step-num {
    background: var(--success);
    color: var(--on-success);
    animation: check-pop 0.25s ease-out;
  }

  /* ── Admin ── */
  .admin {
    display: flex;
    gap: 10px;
    margin-top: 32px;
    padding-top: 18px;
    border-top: 1px solid var(--border);
  }

  .admin-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    border-radius: var(--radius-lg);
    border: 1.5px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
  }

  .admin-btn.danger {
    color: #FF8A8D; /* rouge éclairci : lisible sur le fond bleu nuit */
    border-color: color-mix(in srgb, var(--error) 55%, transparent);
  }

  /* ── Barre d'actions collée en bas ── */
  .action-bar {
    position: sticky;
    z-index: 50; /* sous la barre d'onglets (100) et les fenêtres (200) */
    bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 10px);
    margin: 22px 12px 0;
    display: flex;
    gap: 6px;
    padding: 8px;
    border-radius: var(--radius-xl);
    background: rgba(9, 24, 50, 0.94);
    border: 1px solid var(--border-strong);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  }

  .act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 52px;
    border-radius: var(--radius-lg);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.1s, opacity 0.15s;
  }

  .act:active { transform: scale(0.97); }

  .act.primary {
    flex: 1;
    min-width: 0;
    border: none;
    background: var(--accent);
    color: #fff;
    box-shadow: 0 6px 16px var(--accent-shadow);
  }

  .act.secondary {
    flex: 0 0 auto;
    padding: 0 12px;
    font-size: 14px;
    background: transparent;
    color: var(--text);
    border: 1.5px solid var(--border-strong);
  }

  .act:focus-visible,
  .cook-btn:focus-visible,
  .hero-btn:focus-visible,
  .step-btn:focus-visible,
  .admin-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* Très petits écrans : le bouton secondaire passe en icône seule */
  @media (max-width: 359px) {
    .act.secondary span { display: none; }
    .act.primary { font-size: 14px; }
  }

  /* ── Grands écrans : photo en bandeau, ingrédients et étapes côte à côte ── */
  @media (min-width: 900px) {
    .hero {
      aspect-ratio: 3 / 1;
      max-height: 360px;
      margin-top: 20px;
      border-radius: 28px;
    }
    .hero.no-photo { aspect-ratio: 4 / 1; }
    .content { padding: 28px 8px 8px; }
    .intro {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      column-gap: 24px;
    }
    .intro h1 { flex: 1 1 100%; }
    .cook-btn {
      width: auto;
      margin-left: auto;
      margin-top: 14px;
    }
    .columns {
      display: grid;
      grid-template-columns: minmax(300px, 380px) 1fr;
      align-items: start;
      gap: 40px;
    }
    .ingredients {
      position: sticky;
      top: 20px;
    }
    .action-bar {
      margin-inline: auto 8px;
      width: min(480px, 100%);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .hero-btn:hover { background: rgba(6, 20, 40, 0.8); }
    .cook-btn:hover,
    .act.primary:hover { opacity: 0.92; }
    .act.secondary:hover,
    .admin-btn:hover,
    .step-btn:not(:disabled):hover { background: var(--surface); }
    .step:hover,
    .ingredient:hover { background: var(--surface-hover); }
  }

  .center-msg {
    display: flex;
    justify-content: center;
    padding: 48px 16px;
  }

  .error-msg {
    color: var(--error);
    font-size: 14px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
