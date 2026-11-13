<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { onDestroy } from 'svelte'
  import { profileState } from '../lib/profile.svelte'
  import { supabase } from '../lib/supabase'
  import type { RealtimeChannel } from '@supabase/supabase-js'
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
  import { sizedImage } from '../lib/images'
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

  // ── Temps réel : le planning est partagé entre les membres du foyer ──
  // Quand quelqu'un ajoute / retire / modifie un repas, on recharge la semaine.
  // (Variable NON réactive : l'effet qui s'abonne la lit puis la modifie.)
  let channel: RealtimeChannel | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | undefined

  function unsubscribe() {
    if (channel) {
      supabase?.removeChannel(channel)
      channel = null
    }
  }

  $effect(() => {
    const id = planId
    unsubscribe()
    if (!id || !supabase) return
    channel = supabase
      .channel(`meal-slots-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meal_slots', filter: `meal_plan_id=eq.${id}` },
        () => {
          // Plusieurs événements arrivent souvent ensemble (remplacement = suppression + ajout)
          clearTimeout(refreshTimer)
          refreshTimer = setTimeout(async () => {
            if (planId === id) slots = await fetchSlots(id)
          }, 250)
        },
      )
      .subscribe()
  })

  onDestroy(() => {
    clearTimeout(refreshTimer)
    unsubscribe()
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

  // ── Affichage ──

  const MEALS: { key: 'midi' | 'soir'; label: string; icon: 'sun' | 'moon' }[] = [
    { key: 'midi', label: 'Midi', icon: 'sun' },
    { key: 'soir', label: 'Soir', icon: 'moon' },
  ]

  /** Nombre de repas déjà prévus sur les 14 de la semaine. */
  const plannedCount = $derived(slots.length)

  const isCurrentWeek = $derived(toISODate(weekMonday) === toISODate(getMonday(new Date())))

  /** Jour déjà passé (uniquement dans la semaine en cours) : affiché en retrait. */
  function isPast(dayIndex: number): boolean {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + dayIndex)
    d.setHours(23, 59, 59, 999)
    return d.getTime() < Date.now()
  }

  function dayNumber(dayIndex: number): number {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + dayIndex)
    return d.getDate()
  }
</script>

<div class="page">
  <!-- En-tête : titre + navigation semaine -->
  <header class="week-header">
    <div class="title-row">
      <h1>Semaine</h1>
      <div class="week-nav">
        <button class="nav-btn" onclick={prevWeek} aria-label="Semaine précédente">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <span class="week-label">{isCurrentWeek ? 'Cette semaine' : weekLabel()}</span>
        <button class="nav-btn" onclick={nextWeek} aria-label="Semaine suivante">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
    </div>

    <div class="summary">
      <span class="summary-text">
        <strong>{plannedCount}</strong>/14 repas prévus
        {#if isCurrentWeek}<span class="summary-range">· {weekLabel()}</span>{/if}
      </span>
      {#if !isCurrentWeek}
        <button class="today-btn" onclick={goToday}>Revenir à cette semaine</button>
      {/if}
    </div>
    <div class="summary-bar" aria-hidden="true">
      <div class="summary-fill" style:width="{(plannedCount / 14) * 100}%"></div>
    </div>
  </header>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error}
    <div class="center-msg error-msg">{error}</div>
  {:else}
    <div class="days-grid">
      {#each Array(7) as _, dayIdx}
        {@const today = isToday(dayIdx)}
        {@const past = isCurrentWeek && !today && isPast(dayIdx)}
        <section class="day-card" class:is-today={today} class:is-past={past} aria-label={DAY_NAMES_FULL[dayIdx]}>
          <div class="day-header">
            <div class="day-badge">
              <span class="day-name">{DAY_NAMES[dayIdx]}</span>
              <span class="day-num">{dayNumber(dayIdx)}</span>
            </div>
            <span class="day-full">{DAY_NAMES_FULL[dayIdx]} {dayDate(dayIdx)}</span>
            {#if today}<span class="today-chip">Aujourd'hui</span>{/if}
          </div>

          <div class="slots">
            {#each MEALS as meal (meal.key)}
              {@const slot = getSlot(dayIdx, meal.key)}
              {@render slotTile(dayIdx, meal, slot)}
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<!-- Une tuile repas (remplie ou vide) -->
{#snippet slotTile(dayIdx: number, meal: (typeof MEALS)[number], slot: MealSlotWithRecipe | undefined)}
  {#if slot}
    <div class="slot filled">
      <a href={href('recette', slot.recipes.id)} class="slot-visual" aria-label={slot.recipes.title}>
        {#if slot.recipes.image_url}
          <img src={sizedImage(slot.recipes.image_url, 260, 110)} alt="" loading="lazy" />
        {:else}
          <span class="slot-monogram" aria-hidden="true">{slot.recipes.title.trim().charAt(0)}</span>
        {/if}
        <span class="meal-chip"><Icon name={meal.icon} size={12} /> {meal.label}</span>
      </a>
      <div class="slot-body">
        <a href={href('recette', slot.recipes.id)} class="slot-title">{slot.recipes.title}</a>
        <div class="slot-actions">
          {#if editingSlotId === slot.id}
            <div class="portions-edit">
              <button class="portions-btn" onclick={() => { if (editingPortions > 1) editingPortions-- }} aria-label="Moins">−</button>
              <span class="portions-val">{editingPortions}</span>
              <button class="portions-btn" onclick={() => editingPortions++} aria-label="Plus">+</button>
              <button class="portions-save" onclick={savePortions} aria-label="Valider"><Icon name="check" size={14} strokeWidth={2.5} /></button>
            </div>
          {:else}
            <button class="portions-display" onclick={() => startEditPortions(slot)} aria-label="Modifier les portions">
              <Icon name="users" size={14} /> {slot.portions}
            </button>
            <button class="remove-btn" onclick={() => handleRemoveSlot(slot.id)} aria-label="Retirer {slot.recipes.title}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <button class="slot empty" onclick={() => openPicker(dayIdx, meal.key)} aria-label="Ajouter un repas : {DAY_NAMES_FULL[dayIdx]} {meal.label}">
      <span class="empty-meal"><Icon name={meal.icon} size={14} /> {meal.label}</span>
      <span class="empty-plus">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </span>
    </button>
  {/if}
{/snippet}

<!-- Modal picker de recettes -->
{#if pickerOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={closePicker}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="picker" onclick={(e) => e.stopPropagation()}>
      <div class="picker-header">
        <h2>{DAY_NAMES_FULL[pickerDay]} · {pickerMeal === 'midi' ? 'Midi' : 'Soir'}</h2>
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
                <span class="picker-emoji" aria-hidden="true">{recipe.title.trim().charAt(0)}</span>
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
                <span class="picker-item-time"><Icon name="clock" size={13} /> {recipe.prep_time_min} min</span>
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
    max-width: 1600px;
    margin: 0 auto;
  }

  /* ── En-tête ── */
  .week-header {
    margin-bottom: 16px;
  }

  /* Téléphone : titre, puis navigation sur toute la largeur (évite l'avatar) */
  .title-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    margin-bottom: 14px;
  }

  .title-row h1 {
    padding-right: 48px; /* avatar en haut à droite */
  }

  @media (min-width: 640px) {
    .title-row {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      padding-right: 52px;
    }
  }

  .title-row h1 {
    font-size: 28px;
  }

  .week-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    touch-action: manipulation;
    transition: background 0.15s;
  }

  .nav-btn:active {
    background: var(--surface-hover);
  }

  .week-label {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    padding: 0 6px;
    white-space: nowrap;
    min-width: 140px;
    text-align: center;
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .summary strong {
    color: var(--text);
    font-size: 16px;
  }

  .summary-range {
    margin-left: 2px;
  }

  .today-btn {
    border: none;
    background: none;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 6px 0;
  }

  .summary-bar {
    height: 6px;
    border-radius: 999px;
    background: var(--surface);
    overflow: hidden;
  }

  .summary-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 60%, white));
    transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* ── Grille des jours ──
     Téléphone : une carte par ligne, Midi et Soir côte à côte
     Tablette  : 2 colonnes de jours
     Ordinateur: les 7 jours en colonnes (Midi au-dessus de Soir) */
  .days-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  @media (min-width: 640px) {
    .days-grid { grid-template-columns: repeat(2, 1fr); }
  }

  @media (min-width: 1100px) {
    .days-grid { grid-template-columns: repeat(7, 1fr); gap: 10px; }
  }

  .day-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: fade-up 0.35s ease-out backwards;
  }

  .day-card.is-today {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary), 0 8px 24px -12px var(--primary);
  }

  /* Jour passé : seule la date passe en retrait (la carte reste lisible) */
  .is-past .day-badge,
  .is-past .day-full {
    opacity: 0.5;
  }

  .day-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .day-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    line-height: 1;
    flex-shrink: 0;
  }

  .is-today .day-badge {
    background: var(--primary);
    color: var(--on-primary);
  }

  .day-name {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.8;
  }

  .day-num {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 800;
    margin-top: 2px;
  }

  .day-full {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    text-transform: capitalize;
  }

  .today-chip {
    margin-left: auto;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--primary-light);
    color: var(--primary);
  }

  /* Midi / Soir : côte à côte sur téléphone et tablette, l'un sous l'autre en 7 colonnes */
  .slots {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    flex: 1;
  }

  @media (min-width: 1100px) {
    .slots { grid-template-columns: 1fr; grid-auto-rows: 1fr; }
    .day-full { display: none; }
    .today-chip { margin-left: 0; }
    /* sélecteurs plus précis : ces règles passent devant celles de base, écrites plus bas */
    .slots .slot-visual { height: 120px; }
    .slots .slot { min-height: 150px; }
    .slots .slot.empty { flex-direction: column; justify-content: center; gap: 10px; }
  }

  .slot {
    border-radius: var(--radius-lg);
    min-height: 64px;
  }

  /* ── Tuile remplie ── */
  .slot.filled {
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .slot-visual {
    position: relative;
    display: block;
    height: 76px;
    background: linear-gradient(150deg, color-mix(in srgb, var(--primary) 45%, #0B1D3A), #0B1D3A);
    overflow: hidden;
  }

  .slot-visual img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .slot-monogram {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 40px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.9);
  }

  .meal-chip {
    position: absolute;
    top: 6px;
    left: 6px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 999px;
    background: rgba(6, 20, 45, 0.78);
    color: #FFFFFF;
    font-size: 11px;
    font-weight: 700;
  }

  .slot-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px 8px;
    flex: 1;
  }

  .slot-title {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .slot-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
  }

  .portions-display {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 32px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .remove-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    touch-action: manipulation;
    transition: background 0.15s, color 0.15s;
  }

  .remove-btn:active {
    background: var(--error-bg);
    color: var(--error);
  }

  .portions-edit {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .portions-btn,
  .portions-save {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: var(--font-body);
    line-height: 1;
    touch-action: manipulation;
  }

  .portions-save {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }

  .portions-val {
    font-size: 14px;
    font-weight: 700;
    min-width: 18px;
    text-align: center;
    color: var(--text);
  }

  /* ── Tuile vide ── */
  .slot.empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 12px;
    border: 1.5px dashed var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .slot.empty:active {
    background: var(--primary-light);
    border-color: var(--primary);
    color: var(--primary);
  }

  .empty-meal {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }

  .empty-plus {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text);
  }

  @media (hover: hover) and (pointer: fine) {
    .nav-btn:hover { background: var(--surface-hover); }
    .slot.empty:hover { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
    .slot.filled:hover { border-color: var(--border-strong); }
    .slot-title:hover { color: var(--primary); }
    .portions-display:hover { color: var(--primary); border-color: var(--primary); }
    .remove-btn:hover { background: var(--error-bg); color: var(--error); }
  }

  /* ── Overlay / Modal ── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
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
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 20px;
    text-transform: uppercase;
    color: var(--primary);
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
