<script lang="ts">
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import {
    getMonday,
    toISODate,
    shiftWeek,
    fetchOrCreatePlan,
    fetchSlots,
    setSlot,
    removeSlot,
    updateSlotPortions,
  } from '../lib/api/meals'
  import { fetchRecipes } from '../lib/api/recipes'
  import type { MealSlotWithRecipe, RecipeWithCategory } from '../lib/types'

  // ── État principal ──
  let weekMonday: Date = $state(getMonday(new Date()))
  let planId: string | null = $state(null)
  let slots: MealSlotWithRecipe[] = $state([])
  let loading = $state(true)
  let error = $state<string | null>(null)

  // ── Picker modal ──
  let pickerOpen = $state(false)
  let pickerDay = $state(0)
  let pickerMeal = $state<'midi' | 'soir'>('midi')
  let pickerSearch = $state('')
  let pickerRecipes: RecipeWithCategory[] = $state([])
  let pickerLoading = $state(false)
  let savingSlot = $state(false)

  // ── Portions editor ──
  let editingSlotId = $state<string | null>(null)
  let editingPortions = $state(4)

  // Jours de la semaine
  const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const DAY_NAMES_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

  // ── Charger le plan quand la semaine ou le profil change ──
  $effect(() => {
    if (profileState.loading) return
    const familyId = profileState.profile?.family_id
    if (!familyId) {
      loading = false
      error = 'Profil introuvable.'
      return
    }

    const weekStr = toISODate(weekMonday)

    loading = true
    error = null
    planId = null
    slots = []

    fetchOrCreatePlan(familyId, weekStr)
      .then(async (plan) => {
        planId = plan.id
        slots = await fetchSlots(plan.id)
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  // ── Helpers ──

  function getSlot(day: number, meal: 'midi' | 'soir'): MealSlotWithRecipe | undefined {
    return slots.find((s) => s.day_of_week === day && s.meal_type === meal)
  }

  function weekLabel(): string {
    const end = new Date(weekMonday)
    end.setDate(end.getDate() + 6)
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
    const startStr = weekMonday.toLocaleDateString('fr-FR', opts)
    const endStr = end.toLocaleDateString('fr-FR', opts)
    return `${startStr} – ${endStr}`
  }

  function dayDate(dayIndex: number): string {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + dayIndex)
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  function isToday(dayIndex: number): boolean {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + dayIndex)
    const now = new Date()
    return d.getFullYear() === now.getFullYear()
      && d.getMonth() === now.getMonth()
      && d.getDate() === now.getDate()
  }

  // ── Navigation semaines ──

  function prevWeek() {
    weekMonday = shiftWeek(weekMonday, -1)
  }

  function nextWeek() {
    weekMonday = shiftWeek(weekMonday, 1)
  }

  function goToday() {
    weekMonday = getMonday(new Date())
  }

  // ── Picker ──

  function openPicker(day: number, meal: 'midi' | 'soir') {
    pickerDay = day
    pickerMeal = meal
    pickerSearch = ''
    pickerOpen = true
    loadPickerRecipes()
  }

  function closePicker() {
    pickerOpen = false
  }

  async function loadPickerRecipes() {
    pickerLoading = true
    try {
      const page = await fetchRecipes(0, 200)
      pickerRecipes = page.recipes
    } catch (e: any) {
      console.error('Erreur chargement recettes:', e.message)
    } finally {
      pickerLoading = false
    }
  }

  const filteredPickerRecipes = $derived.by(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return pickerRecipes
    return pickerRecipes.filter((r) => r.title.toLowerCase().includes(q))
  })

  async function selectRecipe(recipeId: string, defaultPortions: number) {
    if (!planId || savingSlot) return
    savingSlot = true
    try {
      await setSlot(planId, pickerDay, pickerMeal, recipeId, defaultPortions)
      slots = await fetchSlots(planId)
      closePicker()
    } catch (e: any) {
      error = e.message
    } finally {
      savingSlot = false
    }
  }

  // ── Supprimer un slot ──

  async function handleRemoveSlot(slotId: string) {
    if (!planId) return
    try {
      await removeSlot(slotId)
      slots = await fetchSlots(planId)
    } catch (e: any) {
      error = e.message
    }
  }

  // ── Éditer les portions ──

  function startEditPortions(slot: MealSlotWithRecipe) {
    editingSlotId = slot.id
    editingPortions = slot.portions
  }

  async function savePortions() {
    if (!editingSlotId || !planId) return
    try {
      await updateSlotPortions(editingSlotId, editingPortions)
      slots = await fetchSlots(planId)
    } catch (e: any) {
      error = e.message
    } finally {
      editingSlotId = null
    }
  }

  function cancelEditPortions() {
    editingSlotId = null
  }
</script>

<div class="page">
  <!-- En-tête avec navigation semaine -->
  <header class="week-header">
    <h1>Semaine</h1>
    <div class="week-nav">
      <button class="nav-btn" onclick={prevWeek} aria-label="Semaine précédente">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <button class="week-label" onclick={goToday}>
        {weekLabel()}
      </button>
      <button class="nav-btn" onclick={nextWeek} aria-label="Semaine suivante">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>
    </div>
  </header>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error}
    <div class="center-msg error-msg">{error}</div>
  {:else}
    <!-- Grille des jours -->
    <div class="days-grid">
      {#each Array(7) as _, dayIdx}
        {@const today = isToday(dayIdx)}
        {@const midiSlot = getSlot(dayIdx, 'midi')}
        {@const soirSlot = getSlot(dayIdx, 'soir')}
        <div class="day-card" class:is-today={today}>
          <div class="day-header">
            <span class="day-name">{DAY_NAMES[dayIdx]}</span>
            <span class="day-date">{dayDate(dayIdx)}</span>
          </div>

          <!-- Midi -->
          <div class="meal-section">
            <span class="meal-label">☀️ Midi</span>
            {#if midiSlot}
              <div class="meal-card">
                {#if midiSlot.recipes.image_url}
                  <img
                    src={midiSlot.recipes.image_url}
                    alt={midiSlot.recipes.title}
                    class="meal-img"
                    loading="lazy"
                  />
                {/if}
                <div class="meal-info">
                  <a href={href('recette', midiSlot.recipes.id)} class="meal-title">
                    {midiSlot.recipes.title}
                  </a>
                  <div class="meal-meta">
                    {#if editingSlotId === midiSlot.id}
                      <div class="portions-edit">
                        <button class="portions-btn" onclick={() => { if (editingPortions > 1) editingPortions-- }}>−</button>
                        <span class="portions-val">{editingPortions}</span>
                        <button class="portions-btn" onclick={() => editingPortions++}>+</button>
                        <button class="portions-save" onclick={savePortions}>✓</button>
                        <button class="portions-cancel" onclick={cancelEditPortions}>✗</button>
                      </div>
                    {:else}
                      <button class="portions-display" onclick={() => startEditPortions(midiSlot)}>
                        🍽️ {midiSlot.portions}
                      </button>
                    {/if}
                  </div>
                </div>
                <button
                  class="remove-btn"
                  onclick={() => handleRemoveSlot(midiSlot.id)}
                  aria-label="Retirer"
                >×</button>
              </div>
            {:else}
              <button class="add-btn" onclick={() => openPicker(dayIdx, 'midi')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                Ajouter
              </button>
            {/if}
          </div>

          <!-- Soir -->
          <div class="meal-section">
            <span class="meal-label">🌙 Soir</span>
            {#if soirSlot}
              <div class="meal-card">
                {#if soirSlot.recipes.image_url}
                  <img
                    src={soirSlot.recipes.image_url}
                    alt={soirSlot.recipes.title}
                    class="meal-img"
                    loading="lazy"
                  />
                {/if}
                <div class="meal-info">
                  <a href={href('recette', soirSlot.recipes.id)} class="meal-title">
                    {soirSlot.recipes.title}
                  </a>
                  <div class="meal-meta">
                    {#if editingSlotId === soirSlot.id}
                      <div class="portions-edit">
                        <button class="portions-btn" onclick={() => { if (editingPortions > 1) editingPortions-- }}>−</button>
                        <span class="portions-val">{editingPortions}</span>
                        <button class="portions-btn" onclick={() => editingPortions++}>+</button>
                        <button class="portions-save" onclick={savePortions}>✓</button>
                        <button class="portions-cancel" onclick={cancelEditPortions}>✗</button>
                      </div>
                    {:else}
                      <button class="portions-display" onclick={() => startEditPortions(soirSlot)}>
                        🍽️ {soirSlot.portions}
                      </button>
                    {/if}
                  </div>
                </div>
                <button
                  class="remove-btn"
                  onclick={() => handleRemoveSlot(soirSlot.id)}
                  aria-label="Retirer"
                >×</button>
              </div>
            {:else}
              <button class="add-btn" onclick={() => openPicker(dayIdx, 'soir')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
                Ajouter
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Modal picker de recettes -->
{#if pickerOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={closePicker}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="picker" onclick={(e) => e.stopPropagation()}>
      <div class="picker-header">
        <h2>{DAY_NAMES_FULL[pickerDay]} · {pickerMeal === 'midi' ? '☀️ Midi' : '🌙 Soir'}</h2>
        <button class="picker-close" onclick={closePicker} aria-label="Fermer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="picker-search">
        <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="search"
          class="search-input"
          placeholder="Rechercher une recette…"
          bind:value={pickerSearch}
        />
      </div>

      <div class="picker-list">
        {#if pickerLoading}
          <div class="center-msg"><div class="spinner"></div></div>
        {:else if filteredPickerRecipes.length === 0}
          <p class="picker-empty">Aucune recette trouvée.</p>
        {:else}
          {#each filteredPickerRecipes as recipe (recipe.id)}
            <button
              class="picker-item"
              disabled={savingSlot}
              onclick={() => selectRecipe(recipe.id, recipe.default_portions)}
            >
              {#if recipe.image_url}
                <img src={recipe.image_url} alt="" class="picker-thumb" loading="lazy" />
              {:else}
                <span class="picker-emoji">🍽️</span>
              {/if}
              <div class="picker-item-info">
                <span class="picker-item-title">{recipe.title}</span>
                {#if recipe.recipe_categories}
                  <span
                    class="picker-item-cat"
                    style="color: {recipe.recipe_categories.color}"
                  >{recipe.recipe_categories.name}</span>
                {/if}
              </div>
              {#if recipe.prep_time_min}
                <span class="picker-item-time">⏱️ {recipe.prep_time_min} min</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
  }

  /* ── En-tête semaine ── */
  .week-header {
    margin-bottom: 16px;
  }

  .week-header h1 {
    font-size: 28px;
    margin-bottom: 12px;
  }

  .week-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .nav-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  .week-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    padding: 6px 16px;
    border-radius: 20px;
    border: 1.5px solid var(--border);
    background: var(--surface);
    cursor: pointer;
    transition: all 0.15s;
    font-family: var(--font-body);
    white-space: nowrap;
  }

  .week-label:hover {
    border-color: var(--primary);
    color: var(--primary);
  }

  /* ── Grille des jours ── */
  .days-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .day-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    transition: border-color 0.15s;
  }

  .day-card.is-today {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .day-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
  }

  .day-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }

  .is-today .day-name {
    color: var(--primary);
  }

  .day-date {
    font-size: 13px;
    color: var(--text-secondary);
  }

  /* ── Section repas (midi / soir) ── */
  .meal-section {
    margin-top: 6px;
  }

  .meal-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: block;
    margin-bottom: 4px;
  }

  /* ── Carte repas remplie ── */
  .meal-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: color-mix(in srgb, var(--primary) 5%, transparent);
    border-radius: var(--radius-md);
    position: relative;
  }

  .meal-img {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    flex-shrink: 0;
  }

  .meal-info {
    flex: 1;
    min-width: 0;
  }

  .meal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meal-title:hover {
    color: var(--primary);
  }

  .meal-meta {
    margin-top: 2px;
  }

  .portions-display {
    font-size: 12px;
    color: var(--text-secondary);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-body);
  }

  .portions-display:hover {
    color: var(--primary);
  }

  .portions-edit {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .portions-btn {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: var(--font-body);
    line-height: 1;
  }

  .portions-val {
    font-size: 13px;
    font-weight: 600;
    min-width: 20px;
    text-align: center;
    color: var(--text);
  }

  .portions-save,
  .portions-cancel {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: none;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: var(--font-body);
  }

  .portions-save {
    background: var(--primary);
    color: white;
  }

  .portions-cancel {
    background: var(--border);
    color: var(--text-secondary);
  }

  .remove-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    padding: 0;
    font-family: var(--font-body);
    line-height: 1;
  }

  .remove-btn:hover {
    background: var(--error);
    color: white;
  }

  /* ── Bouton ajouter ── */
  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 8px;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-body);
    transition: all 0.15s;
  }

  .add-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
  }

  /* ── Overlay / Modal ── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 100;
    padding: 0;
  }

  .picker {
    background: var(--bg);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    width: 100%;
    max-width: 500px;
    max-height: 80dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
    flex-shrink: 0;
  }

  .picker-header h2 {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }

  .picker-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--surface);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .picker-search {
    position: relative;
    padding: 0 16px 12px;
    flex-shrink: 0;
  }

  .picker-search .search-icon {
    position: absolute;
    left: 28px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-placeholder);
    pointer-events: none;
    margin-top: -6px;
  }

  .picker-search .search-input {
    width: 100%;
    padding: 10px 12px 10px 38px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font-size: 15px;
    font-family: var(--font-body);
  }

  .picker-search .search-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .picker-search .search-input::placeholder {
    color: var(--text-placeholder);
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 16px 16px;
  }

  .picker-empty {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .picker-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    text-align: left;
    cursor: pointer;
    font-family: var(--font-body);
    transition: all 0.15s;
    margin-bottom: 6px;
  }

  .picker-item:hover {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
  }

  .picker-item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .picker-thumb {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    object-fit: cover;
    flex-shrink: 0;
  }

  .picker-emoji {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 8%, transparent);
    border-radius: var(--radius-sm);
    font-size: 22px;
    flex-shrink: 0;
  }

  .picker-item-info {
    flex: 1;
    min-width: 0;
  }

  .picker-item-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-item-cat {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .picker-item-time {
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  /* ── Communs ── */
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
