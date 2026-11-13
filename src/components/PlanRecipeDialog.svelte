<script lang="ts">
  // Fenêtre centrée en 2 étapes pour une recette :
  //   1. « Quand ? »  : portions + choix du créneau (4 semaines, on fait défiler)
  //   2. « Les courses » : ajouter les ingrédients (cochés, quantités ajustées) à la liste
  // mode 'plan' → étapes 1 puis 2 ; mode 'cart' → directement l'étape 2 (sans planifier).
  import { onMount, onDestroy, untrack } from 'svelte'
  import Icon from './Icon.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { toast } from '../lib/toast.svelte'
  import {
    getMonday, toISODate, shiftWeek, fetchOrCreatePlan, setSlot, fetchSlotsForWeeks,
  } from '../lib/api/meals'
  import { addIngredientsToList, type IngredientToAdd } from '../lib/api/shopping'
  import { formatIngredient } from '../lib/quantities'
  import type { RecipeDetail, MealSlotWithRecipe } from '../lib/types'

  interface Props {
    recipe: RecipeDetail
    mode: 'plan' | 'cart'
    onclose: () => void
  }
  let { recipe, mode, onclose }: Props = $props()

  const WEEKS_SHOWN = 4
  const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const DAY_FULL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

  // ── État ──
  // La fenêtre est recréée à chaque ouverture : on lit volontairement les valeurs de départ.
  let step = $state<'plan' | 'cart'>(untrack(() => mode))
  let portions = $state(untrack(() => recipe.default_portions) || 4)
  let dialogEl: HTMLDivElement | undefined = $state()
  let saving = $state(false)
  /** Créneau choisi à l'étape 1 (affiché en haut de l'étape 2) */
  let planned = $state<{ label: string; replaced: string | null } | null>(null)

  // ── Semaines affichées ──
  interface DayRow { weekStart: string; dayIdx: number; date: Date; isToday: boolean }
  interface WeekGroup { weekStart: string; title: string; days: DayRow[] }

  const thisMonday = getMonday(new Date())
  const todayStr = toISODate(new Date())

  const weeks: WeekGroup[] = Array.from({ length: WEEKS_SHOWN }, (_, w) => {
    const monday = shiftWeek(thisMonday, w)
    const weekStart = toISODate(monday)
    const title = w === 0 ? 'Cette semaine'
      : w === 1 ? 'Semaine prochaine'
      : `Semaine du ${monday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
    const days: DayRow[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday)
      date.setDate(date.getDate() + d)
      const iso = toISODate(date)
      if (iso < todayStr) continue // jours passés : inutile de les proposer
      days.push({ weekStart, dayIdx: d, date, isToday: iso === todayStr })
    }
    return { weekStart, title, days }
  })

  // Créneaux déjà pris (chargés en arrière-plan, la liste s'affiche tout de suite)
  let taken = $state<Record<string, MealSlotWithRecipe[]>>({})
  function takenSlot(weekStart: string, dayIdx: number, meal: 'midi' | 'soir') {
    return taken[weekStart]?.find((s) => s.day_of_week === dayIdx && s.meal_type === meal)
  }

  onMount(() => {
    const familyId = profileState.profile?.family_id
    if (mode === 'plan' && familyId) {
      fetchSlotsForWeeks(familyId, weeks.map((w) => w.weekStart))
        .then((r) => (taken = r))
        .catch(() => {}) // non bloquant : on peut planifier sans cette info
    }
    // Empêche la page derrière de défiler pendant que la fenêtre est ouverte
    document.body.style.overflow = 'hidden'
    dialogEl?.focus()
  })
  onDestroy(() => {
    document.body.style.overflow = ''
  })

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }

  // ── Étape 1 : planifier ──
  async function choose(day: DayRow, meal: 'midi' | 'soir') {
    const familyId = profileState.profile?.family_id
    if (!familyId || saving) {
      if (!familyId) toast.error('Profil introuvable.')
      return
    }
    saving = true
    try {
      const previous = takenSlot(day.weekStart, day.dayIdx, meal)
      const plan = await fetchOrCreatePlan(familyId, day.weekStart)
      await setSlot(plan.id, day.dayIdx, meal, recipe.id, portions)
      const dateLabel = day.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      planned = {
        label: `${DAY_FULL[day.dayIdx]} ${dateLabel} à ${meal === 'midi' ? 'midi' : 'soir'}`,
        replaced: previous && previous.recipes.id !== recipe.id ? previous.recipes.title : null,
      }
      resetCart()
      if (recipe.recipe_ingredients.length === 0) {
        toast.success(`${recipe.title} ajoutée ${planned.label}`)
        onclose()
      } else {
        step = 'cart'
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      saving = false
    }
  }

  // ── Étape 2 : les courses ──
  let checked = $state<Record<string, boolean>>({})
  function resetCart() {
    checked = Object.fromEntries(recipe.recipe_ingredients.map((i) => [i.id, true]))
  }
  resetCart()

  const selectedCount = $derived(Object.values(checked).filter(Boolean).length)
  const allSelected = $derived(selectedCount === recipe.recipe_ingredients.length)

  function toggleAll() {
    const v = !allSelected
    for (const i of recipe.recipe_ingredients) checked[i.id] = v
  }

  /** Quantité ajustée aux portions, avec son unité : « 1 kg », « 2,5 » */
  function scaledQty(qty: number | null, unit: string | null): string {
    return formatIngredient(qty, unit, portions / (recipe.default_portions || 4))
  }

  async function addToCart() {
    const familyId = profileState.profile?.family_id
    if (!familyId || saving) return
    const selected: IngredientToAdd[] = recipe.recipe_ingredients
      .filter((i) => checked[i.id])
      .map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, shopping_category_id: i.shopping_category_id }))
    if (selected.length === 0) return
    saving = true
    try {
      // Recette non planifiée (« Juste les ingrédients ») → articles « ajoutés à la main »,
      // conservés si la liste est régénérée depuis le planning
      const n = await addIngredientsToList(familyId, selected, portions, recipe.default_portions, recipe.id, !planned)
      toast.success(
        planned
          ? `Planifiée et ${n} ingrédient${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} aux courses`
          : `${n} ingrédient${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} aux courses`,
      )
      onclose()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      saving = false
    }
  }

  function skipCart() {
    if (planned) toast.success(`${recipe.title} ajoutée ${planned.label}`)
    onclose()
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dlg-overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="dlg"
    bind:this={dialogEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dlg-title"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- En-tête -->
    <header class="dlg-header">
      <div class="dlg-titles">
        {#if mode === 'plan'}
          <span class="dlg-step">Étape {step === 'plan' ? 1 : 2} sur 2</span>
        {/if}
        <h2 id="dlg-title">
          {#if step === 'plan'}Quand la cuisiner ?{:else if planned}Et pour les courses ?{:else}Ajouter aux courses{/if}
        </h2>
        <p class="dlg-recipe">{recipe.title}</p>
      </div>
      <button class="dlg-close" onclick={onclose} aria-label="Fermer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </header>

    <!-- Portions (communes aux deux étapes) -->
    <div class="portions">
      <span class="portions-label"><Icon name="users" size={16} /> Portions</span>
      <div class="stepper">
        <button onclick={() => { if (portions > 1) portions-- }} aria-label="Moins de portions" disabled={portions <= 1}>−</button>
        <span class="stepper-val" aria-live="polite">{portions}</span>
        <button onclick={() => portions++} aria-label="Plus de portions">+</button>
      </div>
    </div>

    {#if step === 'plan'}
      <!-- ── Étape 1 : créneaux sur 4 semaines ── -->
      <div class="dlg-scroll">
        {#each weeks as week (week.weekStart)}
          {#if week.days.length > 0}
            <h3 class="week-title">{week.title}</h3>
            <div class="day-list">
              {#each week.days as day (day.weekStart + day.dayIdx)}
                <div class="day-row" class:is-today={day.isToday}>
                  <div class="day-badge">
                    <span class="day-short">{DAY_SHORT[day.dayIdx]}</span>
                    <span class="day-num">{day.date.getDate()}</span>
                  </div>
                  <div class="meal-btns">
                    {#each ['midi', 'soir'] as const as meal (meal)}
                      {@const t = takenSlot(day.weekStart, day.dayIdx, meal)}
                      <button
                        class="meal-btn"
                        class:taken={!!t}
                        disabled={saving}
                        onclick={() => choose(day, meal)}
                        aria-label="{DAY_FULL[day.dayIdx]} {day.date.getDate()} {meal}{t ? `, déjà prévu : ${t.recipes.title} (sera remplacé)` : ''}"
                      >
                        <span class="meal-name"><Icon name={meal === 'midi' ? 'sun' : 'moon'} size={14} /> {meal === 'midi' ? 'Midi' : 'Soir'}</span>
                        {#if t}<span class="meal-taken">{t.recipes.title}</span>{/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
      <p class="dlg-hint">Un créneau déjà pris sera remplacé.</p>
    {:else}
      <!-- ── Étape 2 : ingrédients ── -->
      {#if planned}
        <div class="planned-banner">
          <Icon name="check-circle" size={18} />
          <span>
            Prévue <strong>{planned.label}</strong>
            {#if planned.replaced}<span class="replaced">(remplace « {planned.replaced} »)</span>{/if}
          </span>
        </div>
      {/if}

      <div class="cart-toolbar">
        <button class="link-btn" onclick={toggleAll}>{allSelected ? 'Tout décocher' : 'Tout cocher'}</button>
        <span class="cart-count">{selectedCount}/{recipe.recipe_ingredients.length}</span>
      </div>

      <div class="dlg-scroll">
        <div class="ing-list">
          {#each recipe.recipe_ingredients as ing (ing.id)}
            <label class="ing" class:off={!checked[ing.id]}>
              <input type="checkbox" bind:checked={checked[ing.id]} />
              <span class="ing-qty">{scaledQty(ing.quantity, ing.unit)}</span>
              <span class="ing-name">{ing.name}</span>
            </label>
          {/each}
        </div>
      </div>

      <div class="dlg-actions">
        <button class="btn btn-primary" onclick={addToCart} disabled={saving || selectedCount === 0}>
          <Icon name="cart" />
          {saving ? 'Ajout…' : `Ajouter ${selectedCount} ingrédient${selectedCount > 1 ? 's' : ''} aux courses`}
        </button>
        {#if planned}
          <button class="skip-btn" onclick={skipCart} disabled={saving}>Pas maintenant</button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .dlg-overlay {
    position: fixed;
    inset: 0;
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    padding-top: max(16px, env(safe-area-inset-top, 0px));
    padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
    background: rgba(2, 8, 22, 0.66);
    animation: fade 0.2s ease-out;
  }

  .dlg {
    width: min(460px, 100%);
    max-height: min(88svh, 760px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 22px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.15);
    outline: none;
  }

  @keyframes fade { from { opacity: 0; } }
  @keyframes pop  { from { opacity: 0; transform: scale(0.92) translateY(12px); } }

  /* ── En-tête ── */
  .dlg-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 18px 12px;
  }

  .dlg-titles { min-width: 0; }

  .dlg-step {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--primary);
    margin-bottom: 4px;
  }

  .dlg-header h2 {
    font-size: 21px;
    color: var(--text);
  }

  .dlg-recipe {
    margin-top: 2px;
    font-size: 14px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dlg-close {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--surface);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }

  /* ── Portions ── */
  .portions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 18px 12px;
    padding: 8px 8px 8px 14px;
    border-radius: 14px;
    background: var(--surface);
  }

  .portions-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stepper button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-size: 18px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .stepper button:disabled { opacity: 0.35; cursor: default; }

  .stepper-val {
    min-width: 26px;
    text-align: center;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 800;
    color: var(--text);
  }

  /* ── Zone qui défile ── */
  .dlg-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 18px 8px;
  }

  .week-title {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 -18px;
    padding: 10px 18px 8px;
    background: var(--bg);
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .day-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  .day-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
    padding: 6px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid transparent;
  }

  .day-row.is-today { border-color: var(--primary); }

  .day-badge {
    width: 46px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.08);
    line-height: 1;
  }

  .is-today .day-badge { background: var(--primary); color: var(--on-primary); }

  .day-short {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.85;
  }

  .day-num {
    margin-top: 3px;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 800;
  }

  .meal-btns {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    min-width: 0;
  }

  .meal-btn {
    min-height: 48px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1px solid var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font-family: var(--font-body);
    text-align: left;
    cursor: pointer;
    min-width: 0;
    touch-action: manipulation;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
  }

  .meal-btn:active { transform: scale(0.97); background: var(--primary-light); border-color: var(--primary); }
  .meal-btn:disabled { opacity: 0.5; }

  .meal-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 700;
  }

  .meal-btn.taken {
    border-style: dashed;
    background: transparent;
  }

  .meal-btn.taken .meal-name { color: var(--text-secondary); }

  .meal-taken {
    max-width: 100%;
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dlg-hint {
    padding: 8px 18px 16px;
    font-size: 12px;
    color: var(--text-secondary);
    border-top: 1px solid var(--border);
  }

  /* ── Étape 2 ── */
  .planned-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0 18px 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--success-bg);
    color: var(--success);
    font-size: 14px;
  }

  .planned-banner span { color: var(--text); }
  .planned-banner > span::first-letter { text-transform: uppercase; }
  .replaced { display: block; font-size: 12px; color: var(--text-secondary); }

  .cart-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px 8px;
  }

  .link-btn {
    border: none;
    background: none;
    padding: 6px 0;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .cart-count { font-size: 13px; color: var(--text-secondary); }

  .ing-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ing {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--surface);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .ing.off { opacity: 0.45; }

  .ing input {
    width: 20px;
    height: 20px;
    accent-color: var(--primary);
    flex-shrink: 0;
  }

  .ing-qty {
    min-width: 56px;
    font-size: 14px;
    font-weight: 700;
    color: var(--primary);
  }

  .ing-name { font-size: 15px; color: var(--text); }

  .dlg-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 12px 18px 14px;
    border-top: 1px solid var(--border);
  }

  .dlg-actions .btn-primary {
    padding: 15px 12px;
    border-radius: 14px;
    font-size: 15px;
    white-space: nowrap;
  }

  .skip-btn {
    min-height: 44px;
    border: none;
    background: none;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  @media (hover: hover) and (pointer: fine) {
    .meal-btn:hover { background: var(--primary-light); border-color: var(--primary); }
    .dlg-close:hover { background: var(--surface-hover); }
    .skip-btn:hover { color: var(--text); }
  }
</style>
