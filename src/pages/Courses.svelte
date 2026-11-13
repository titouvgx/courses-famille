<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { onDestroy } from 'svelte'
  import { profileState } from '../lib/profile.svelte'
  import { auth } from '../lib/auth.svelte'
  import { supabase } from '../lib/supabase'
  import { fetchOrCreatePlan, fetchSlots, getMonday, toISODate } from '../lib/api/meals'
  import { fetchShoppingCategories } from '../lib/api/recipes'
  import {
    fetchActiveList,
    fetchListItems,
    generateListFromPlan,
    toggleItem,
    addExtraItem,
    removeItem,
    completeList,
    deleteList,
  } from '../lib/api/shopping'
  import type {
    ShoppingList,
    ShoppingListItemWithCategory,
    ShoppingCategory,
  } from '../lib/types'
  import type { RealtimeChannel } from '@supabase/supabase-js'
  import { toast } from '../lib/toast.svelte'

  // ── État principal ──
  let list: ShoppingList | null = $state(null)
  let items: ShoppingListItemWithCategory[] = $state([])
  let categories: ShoppingCategory[] = $state([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let generating = $state(false)

  // ── Ajout manuel ──
  let showAddForm = $state(false)
  let newItemName = $state('')
  let newItemQty = $state('')
  let newItemCat = $state('')
  let addingItem = $state(false)

  // ── Confirmation ──
  let showCompleteConfirm = $state(false)
  let completing = $state(false)

  // ── Chargement ──
  $effect(() => {
    if (profileState.loading) return
    const familyId = profileState.profile?.family_id
    if (!familyId) {
      loading = false
      error = 'Profil introuvable.'
      return
    }

    loading = true
    error = null

    Promise.all([
      fetchActiveList(familyId),
      fetchShoppingCategories(),
    ])
      .then(async ([activeList, cats]) => {
        categories = cats
        list = activeList
        if (activeList) {
          items = await fetchListItems(activeList.id)
        }
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  // ── Dérivés ──

  /** Articles groupés par rayon */
  const groupedItems = $derived.by(() => {
    const groups = new Map<string, {
      category: ShoppingCategory | null
      items: ShoppingListItemWithCategory[]
    }>()

    // Trier : non cochés d'abord, puis cochés
    const sorted = [...items].sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1
      return a.position - b.position
    })

    for (const item of sorted) {
      const catId = item.shopping_category_id || '__none__'
      if (!groups.has(catId)) {
        groups.set(catId, {
          category: item.shopping_categories,
          items: [],
        })
      }
      groups.get(catId)!.items.push(item)
    }

    // Trier les groupes par position de catégorie
    return Array.from(groups.values()).sort((a, b) => {
      const posA = a.category?.position ?? 999
      const posB = b.category?.position ?? 999
      return posA - posB
    })
  })

  const totalItems = $derived(items.length)
  const checkedItems = $derived(items.filter((i) => i.checked).length)
  const progressPct = $derived(totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0)
  const allDone = $derived(totalItems > 0 && checkedItems === totalItems)

  // Célébration quand tous les items sont cochés
  let celebrated = $state(false)
  $effect(() => {
    if (allDone && !celebrated) {
      celebrated = true
      toast.success('Tous les articles sont cochés !')
    }
    if (!allDone) {
      celebrated = false
    }
  })

  // ── Real-time : abonnement aux changements de la liste ──

  // Variable NON réactive (pas de $state) : elle n'est jamais affichée, et l'effet
  // qui s'abonne la lit puis la modifie. En $state, l'effet se relançait en boucle
  // (abonnement / désabonnement Supabase en rafale → « effect_update_depth_exceeded »).
  let realtimeChannel: RealtimeChannel | null = null

  /** S'abonne aux changements sur les items de la liste active. */
  function subscribeToList(listId: string) {
    unsubscribe()
    if (!supabase) return

    realtimeChannel = supabase
      .channel(`shopping-items-${listId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `shopping_list_id=eq.${listId}`,
        },
        (payload) => {
          const updated = payload.new as any
          items = items.map((i) =>
            i.id === updated.id
              ? { ...i, checked: updated.checked, checked_by: updated.checked_by, checked_at: updated.checked_at }
              : i
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shopping_list_items',
          filter: `shopping_list_id=eq.${listId}`,
        },
        async () => {
          // Recharger tous les items (l'INSERT ne renvoie pas la jointure shopping_categories)
          if (list) {
            items = await fetchListItems(list.id)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'shopping_list_items',
        },
        (payload) => {
          const deletedId = (payload.old as any).id
          if (deletedId) {
            items = items.filter((i) => i.id !== deletedId)
          }
        },
      )
      .subscribe()
  }

  function unsubscribe() {
    if (realtimeChannel) {
      supabase?.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  // S'abonner quand la liste change
  $effect(() => {
    if (list?.id) {
      subscribeToList(list.id)
    } else {
      unsubscribe()
    }
  })

  // Nettoyage à la destruction du composant
  onDestroy(() => {
    unsubscribe()
  })

  // ── Générer la liste ──

  async function handleGenerate() {
    const familyId = profileState.profile?.family_id
    if (!familyId || generating) return

    generating = true
    error = null

    try {
      const weekStart = toISODate(getMonday(new Date()))
      const plan = await fetchOrCreatePlan(familyId, weekStart)
      const slots = await fetchSlots(plan.id)

      if (slots.length === 0) {
        error = 'Le planning de cette semaine est vide. Va dans l\'onglet Semaine pour ajouter des recettes.'
        return
      }

      list = await generateListFromPlan(familyId, plan.id)
      items = await fetchListItems(list.id)
      toast.success(`Liste générée — ${items.length} articles`)
    } catch (e: any) {
      error = e.message
    } finally {
      generating = false
    }
  }

  // ── Toggle cochage ──

  async function handleToggle(itemId: string, checked: boolean) {
    const userId = auth.user?.id
    if (!userId) return

    // Optimistic update
    items = items.map((i) =>
      i.id === itemId ? { ...i, checked } : i
    )

    try {
      await toggleItem(itemId, checked, userId)
    } catch (e: any) {
      // Rollback
      items = items.map((i) =>
        i.id === itemId ? { ...i, checked: !checked } : i
      )
      error = e.message
    }
  }

  // ── Ajout manuel ──

  async function handleAddItem() {
    if (!list || !newItemName.trim() || addingItem) return
    addingItem = true

    try {
      await addExtraItem(
        list.id,
        newItemName,
        newItemQty || null,
        newItemCat || null,
      )
      items = await fetchListItems(list.id)
      newItemName = ''
      newItemQty = ''
      newItemCat = ''
      showAddForm = false
    } catch (e: any) {
      error = e.message
    } finally {
      addingItem = false
    }
  }

  // ── Supprimer un article ──

  async function handleRemoveItem(itemId: string) {
    if (!list) return
    try {
      await removeItem(itemId)
      items = items.filter((i) => i.id !== itemId)
    } catch (e: any) {
      error = e.message
    }
  }

  // ── Terminer / Régénérer ──

  async function handleComplete() {
    if (!list || completing) return
    completing = true
    try {
      await completeList(list.id)
      list = null
      items = []
      showCompleteConfirm = false
      toast.success('Courses terminées !')
    } catch (e: any) {
      error = e.message
    } finally {
      completing = false
    }
  }

  async function handleRegenerate() {
    if (!list) return
    try {
      await deleteList(list.id)
      list = null
      items = []
      await handleGenerate()
    } catch (e: any) {
      error = e.message
    }
  }
</script>

<div class="page">
  <header class="page-header">
    <h1>Courses</h1>
  </header>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error && !list}
    <div class="center-msg error-msg">{error}</div>
  {:else if !list}
    <!-- Pas de liste active : proposer d'en générer une -->
    <div class="empty-state">
      <span class="empty-icon"><Icon name="cart" size={44} strokeWidth={1.5} /></span>
      <p class="empty-title">Pas de liste en cours</p>
      <p class="empty-hint">Génère ta liste de courses à partir du planning de la semaine.</p>
      <button
        class="btn btn-primary generate-btn"
        onclick={handleGenerate}
        disabled={generating}
      >
        {#if generating}
          <span class="btn-spinner"></span>
          Génération…
        {:else}
          <Icon name="list" /> Générer la liste
        {/if}
      </button>
    </div>
  {:else}
    <!-- Liste active -->
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    <!-- Barre de progression -->
    <div class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" class:done={allDone} style="width: {progressPct}%"></div>
      </div>
      <span class="progress-text" class:done={allDone}>
        {#if allDone}
          <Icon name="check-circle" size={15} /> Tout est coché !
        {:else}
          {checkedItems}/{totalItems} articles
        {/if}
      </span>
    </div>

    <!-- Articles groupés par rayon -->
    {#if groupedItems.length === 0}
      <p class="empty-list">La liste est vide.</p>
    {:else}
      {#each groupedItems as group}
        <div class="category-group">
          <h2 class="category-title">
            <span class="cat-icon">{group.category?.icon || '🛒'}</span>
            {group.category?.name || 'Sans rayon'}
          </h2>
          <ul class="item-list">
            {#each group.items as item (item.id)}
              <li class="item-row" class:checked={item.checked}>
                <label class="item-check">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onchange={() => handleToggle(item.id, !item.checked)}
                  />
                  <span class="checkmark"></span>
                </label>
                <div class="item-info">
                  <span class="item-name">{item.name}</span>
                  {#if item.quantity}
                    <span class="item-qty">{item.quantity}</span>
                  {/if}
                </div>
                {#if item.is_extra}
                  <span class="extra-badge">ajouté</span>
                {/if}
                <button
                  class="item-remove"
                  onclick={() => handleRemoveItem(item.id)}
                  aria-label="Supprimer"
                >×</button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    {/if}

    <!-- Formulaire ajout manuel -->
    {#if showAddForm}
      <div class="add-form">
        <h3>Ajouter un article</h3>
        <div class="add-fields">
          <input
            type="text"
            class="input"
            placeholder="Nom de l'article"
            bind:value={newItemName}
          />
          <input
            type="text"
            class="input input-small"
            placeholder="Quantité (ex: 500g)"
            bind:value={newItemQty}
          />
          <select class="input" bind:value={newItemCat}>
            <option value="">Sans rayon</option>
            {#each categories as cat (cat.id)}
              <option value={cat.id}>{cat.icon} {cat.name}</option>
            {/each}
          </select>
        </div>
        <div class="add-actions">
          <button class="btn btn-outline" onclick={() => { showAddForm = false }}>
            Annuler
          </button>
          <button
            class="btn btn-primary"
            onclick={handleAddItem}
            disabled={!newItemName.trim() || addingItem}
          >
            {addingItem ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    {:else}
      <button class="add-item-btn" onclick={() => { showAddForm = true }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        Ajouter un article
      </button>
    {/if}

    <!-- Actions liste -->
    <div class="list-actions">
      <button class="btn btn-outline" onclick={handleRegenerate}>
        <Icon name="refresh" /> Régénérer
      </button>
      <button
        class="btn btn-primary"
        onclick={() => { showCompleteConfirm = true }}
      >
        <Icon name="check" /> Terminer les courses
      </button>
    </div>
  {/if}
</div>

<!-- Confirmation terminer -->
{#if showCompleteConfirm}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={() => { showCompleteConfirm = false }}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="confirm-dialog" onclick={(e) => e.stopPropagation()}>
      <p class="confirm-title">Terminer les courses ?</p>
      <p class="confirm-text">
        {checkedItems}/{totalItems} articles cochés.
        {#if checkedItems < totalItems}
          Il reste {totalItems - checkedItems} article{totalItems - checkedItems > 1 ? 's' : ''} non coché{totalItems - checkedItems > 1 ? 's' : ''}.
        {/if}
        La liste passera dans l'historique.
      </p>
      <div class="confirm-actions">
        <button class="btn btn-outline" onclick={() => { showCompleteConfirm = false }}>
          Annuler
        </button>
        <button class="btn btn-primary" disabled={completing} onclick={handleComplete}>
          {completing ? 'En cours…' : 'Terminer'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 600px;
  }

  .page-header {
    margin-bottom: 16px;
  }

  .page-header h1 {
    font-size: 28px;
  }

  /* ── État vide ── */
  .empty-state {
    text-align: center;
    padding: 48px 16px;
  }

  .empty-icon {
    display: block;
    margin-bottom: 12px;
    color: var(--text-secondary);
  }

  .empty-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 6px;
  }

  .empty-hint {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 24px;
    line-height: 1.4;
  }

  .generate-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 28px;
    font-size: 16px;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* ── Progression ── */
  .progress-section {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--primary);
    border-radius: 4px;
    transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s;
  }

  .progress-fill.done {
    background: var(--success);
  }

  .progress-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    white-space: nowrap;
    transition: color 0.3s;
  }

  .progress-text.done {
    color: var(--success);
  }

  /* ── Erreur ── */
  .error-banner {
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error);
    padding: 10px 14px;
    border-radius: var(--radius-md);
    font-size: 13px;
    margin-bottom: 16px;
  }

  .empty-list {
    text-align: center;
    color: var(--text-secondary);
    padding: 32px 0;
    font-size: 14px;
  }

  /* ── Groupe par rayon ── */
  .category-group {
    margin-bottom: 20px;
  }

  .category-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .cat-icon {
    font-size: 18px;
  }

  .item-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* ── Ligne article ── */
  .item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--surface);
    border-radius: var(--radius-sm);
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  .item-row.checked {
    opacity: 0.5;
  }

  .item-check {
    position: relative;
    flex-shrink: 0;
    cursor: pointer;
  }

  .item-check input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .checkmark {
    display: block;
    width: 22px;
    height: 22px;
    border: 2px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    transition: all 0.15s;
  }

  .item-check input:checked + .checkmark {
    background: var(--primary);
    border-color: var(--primary);
    animation: check-pop 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .item-check input:checked + .checkmark::after {
    content: '';
    display: block;
    width: 6px;
    height: 10px;
    border: solid var(--on-primary);
    border-width: 0 2.5px 2.5px 0;
    transform: translate(5.5px, 2px) rotate(45deg);
    animation: check-stroke 0.2s ease-out 0.05s;
  }

  @keyframes check-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.2); }
    100% { transform: scale(1); }
  }

  @keyframes check-stroke {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .item-info {
    flex: 1;
    min-width: 0;
  }

  .item-name {
    font-size: 15px;
    color: var(--text);
    display: block;
  }

  .checked .item-name {
    text-decoration: line-through;
    color: var(--text-secondary);
  }

  .item-qty {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .extra-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .item-remove {
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

  .item-remove:hover {
    background: var(--error);
    color: white;
  }

  /* ── Ajout article ── */
  .add-item-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: var(--font-body);
    transition: all 0.15s;
    margin-top: 12px;
  }

  .add-item-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, transparent);
  }

  .add-form {
    margin-top: 12px;
    padding: 16px;
    background: var(--surface);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
  }

  .add-form h3 {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--text);
  }

  .add-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
  }

  .add-fields .input {
    width: 100%;
    padding: 10px 12px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    font-family: var(--font-body);
  }

  .add-fields .input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .add-fields select.input {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 36px;
  }

  .add-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  /* ── Actions liste ── */
  .list-actions {
    display: flex;
    gap: 10px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .list-actions .btn {
    flex: 1;
  }

  /* ── Overlay / Confirmation ── */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
    padding: var(--gutter);
    animation: overlay-in 0.2s ease-out;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .confirm-dialog {
    background: var(--surface);
    border-radius: var(--radius-lg);
    padding: 24px;
    max-width: 360px;
    width: 100%;
    animation: dialog-in 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes dialog-in {
    from { opacity: 0; transform: scale(0.92) translateY(10px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  .confirm-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
  }

  .confirm-text {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 20px;
    line-height: 1.4;
  }

  .confirm-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
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
