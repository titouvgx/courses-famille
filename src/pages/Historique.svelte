<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import { profileState } from '../lib/profile.svelte'
  import {
    fetchCompletedLists,
    fetchListItems,
    deleteList,
  } from '../lib/api/shopping'
  import type {
    ShoppingList,
    ShoppingListItemWithCategory,
  } from '../lib/types'

  // ── État ──
  let lists: ShoppingList[] = $state([])
  let loading = $state(true)
  let error = $state<string | null>(null)

  // ── Détail ouvert ──
  let openListId = $state<string | null>(null)
  let detailItems: ShoppingListItemWithCategory[] = $state([])
  let detailLoading = $state(false)

  // ── Suppression ──
  let deleteConfirmId = $state<string | null>(null)
  let deleting = $state(false)

  // ── Chargement initial ──
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

    fetchCompletedLists(familyId)
      .then((data) => {
        lists = data
      })
      .catch((e) => {
        error = e.message
      })
      .finally(() => {
        loading = false
      })
  })

  // ── Helpers ──

  function formatDate(iso: string | null): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  function formatTime(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }

  /** Temps relatif simple (il y a X jours / heures) */
  function timeAgo(iso: string | null): string {
    if (!iso) return ''
    const now = Date.now()
    const then = new Date(iso).getTime()
    const diffMs = now - then
    const minutes = Math.floor(diffMs / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `il y a ${days} j`
    if (hours > 0) return `il y a ${hours} h`
    if (minutes > 0) return `il y a ${minutes} min`
    return 'à l\'instant'
  }

  // ── Ouvrir/fermer le détail ──

  async function toggleDetail(listId: string) {
    if (openListId === listId) {
      openListId = null
      detailItems = []
      return
    }

    openListId = listId
    detailLoading = true
    try {
      detailItems = await fetchListItems(listId)
    } catch (e: any) {
      error = e.message
      detailItems = []
    } finally {
      detailLoading = false
    }
  }

  // ── Supprimer une liste ──

  async function handleDelete(listId: string) {
    deleting = true
    try {
      await deleteList(listId)
      lists = lists.filter((l) => l.id !== listId)
      if (openListId === listId) {
        openListId = null
        detailItems = []
      }
      deleteConfirmId = null
    } catch (e: any) {
      error = e.message
    } finally {
      deleting = false
    }
  }

  // ── Groupement des items du détail par rayon ──
  const groupedDetailItems = $derived.by(() => {
    const groups = new Map<string, {
      icon: string
      name: string
      items: ShoppingListItemWithCategory[]
    }>()

    for (const item of detailItems) {
      const catId = item.shopping_category_id || '__none__'
      if (!groups.has(catId)) {
        groups.set(catId, {
          icon: item.shopping_categories?.icon || '🛒',
          name: item.shopping_categories?.name || 'Autre',
          items: [],
        })
      }
      groups.get(catId)!.items.push(item)
    }

    return Array.from(groups.values()).sort((a, b) => {
      // "Autre" en dernier
      if (a.name === 'Autre') return 1
      if (b.name === 'Autre') return -1
      return a.name.localeCompare(b.name, 'fr')
    })
  })
</script>

<div class="page">
  <header class="page-header">
    <h1>Historique</h1>
  </header>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if error && lists.length === 0}
    <div class="center-msg error-msg">{error}</div>
  {:else if lists.length === 0}
    <div class="empty-state">
      <span class="empty-icon"><Icon name="archive" size={44} strokeWidth={1.5} /></span>
      <p class="empty-title">Aucun historique</p>
      <p class="empty-hint">Les listes de courses terminées apparaîtront ici.</p>
    </div>
  {:else}
    {#if error}
      <div class="error-banner">{error}</div>
    {/if}

    <p class="list-count">{lists.length} liste{lists.length > 1 ? 's' : ''} terminée{lists.length > 1 ? 's' : ''}</p>

    <div class="history-list">
      {#each lists as list (list.id)}
        {@const isOpen = openListId === list.id}
        <div class="history-card" class:is-open={isOpen}>
          <!-- En-tête cliquable -->
          <button
            class="card-header"
            onclick={() => toggleDetail(list.id)}
          >
            <div class="card-info">
              <span class="card-date">{formatDate(list.completed_at)}</span>
              <span class="card-time">{formatTime(list.completed_at)} · {timeAgo(list.completed_at)}</span>
            </div>
            <span class="chevron" class:open={isOpen}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
          </button>

          <!-- Détail des articles -->
          {#if isOpen}
            <div class="card-detail">
              {#if detailLoading}
                <div class="detail-loading"><div class="spinner-sm"></div></div>
              {:else if detailItems.length === 0}
                <p class="detail-empty">Liste vide.</p>
              {:else}
                <div class="detail-summary">
                  {detailItems.length} article{detailItems.length > 1 ? 's' : ''}
                  · {detailItems.filter(i => i.checked).length} coché{detailItems.filter(i => i.checked).length > 1 ? 's' : ''}
                </div>

                {#each groupedDetailItems as group}
                  <div class="detail-group">
                    <h3 class="detail-group-title">{group.icon} {group.name}</h3>
                    <ul class="detail-items">
                      {#each group.items as item (item.id)}
                        <li class="detail-item" class:was-checked={item.checked}>
                          <span class="check-icon">{item.checked ? '✓' : '○'}</span>
                          <span class="detail-item-name">{item.name}</span>
                          {#if item.quantity}
                            <span class="detail-item-qty">{item.quantity}</span>
                          {/if}
                          {#if item.is_extra}
                            <span class="extra-badge">ajouté</span>
                          {/if}
                        </li>
                      {/each}
                    </ul>
                  </div>
                {/each}
              {/if}

              <!-- Actions -->
              <div class="detail-actions">
                {#if deleteConfirmId === list.id}
                  <div class="delete-confirm">
                    <span class="delete-msg">Supprimer définitivement ?</span>
                    <button
                      class="btn btn-sm btn-outline"
                      onclick={() => { deleteConfirmId = null }}
                    >
                      Annuler
                    </button>
                    <button
                      class="btn btn-sm btn-danger"
                      onclick={() => handleDelete(list.id)}
                      disabled={deleting}
                    >
                      {deleting ? '…' : 'Supprimer'}
                    </button>
                  </div>
                {:else}
                  <button
                    class="btn btn-sm btn-outline btn-delete-trigger"
                    onclick={() => { deleteConfirmId = list.id }}
                  >
                    <Icon name="trash" size={15} /> Supprimer
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

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
    line-height: 1.4;
  }

  .list-count {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  .error-banner {
    background: color-mix(in srgb, var(--error) 10%, transparent);
    color: var(--error);
    padding: 10px 14px;
    border-radius: var(--radius-md);
    font-size: 13px;
    margin-bottom: 16px;
  }

  /* ── Liste historique ── */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .history-card {
    background: var(--surface);
    border-radius: var(--radius-lg);
    border: 1.5px solid var(--border);
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .history-card.is-open {
    border-color: var(--primary);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-body);
    text-align: left;
    color: var(--text);
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .card-date {
    font-size: 15px;
    font-weight: 600;
  }

  .card-time {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .chevron {
    color: var(--text-secondary);
    transition: transform 0.2s;
    display: flex;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  /* ── Détail ── */
  .card-detail {
    padding: 0 16px 16px;
    border-top: 1px solid var(--border);
  }

  .detail-loading {
    display: flex;
    justify-content: center;
    padding: 16px;
  }

  .detail-empty {
    color: var(--text-secondary);
    font-size: 13px;
    text-align: center;
    padding: 12px 0;
  }

  .detail-summary {
    font-size: 13px;
    color: var(--text-secondary);
    padding: 12px 0 8px;
    font-weight: 500;
  }

  .detail-group {
    margin-bottom: 12px;
  }

  .detail-group-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text-secondary);
    margin-bottom: 4px;
  }

  .detail-items {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 14px;
  }

  .detail-item.was-checked {
    opacity: 0.55;
  }

  .check-icon {
    font-size: 14px;
    width: 18px;
    text-align: center;
    flex-shrink: 0;
    color: var(--primary);
  }

  .was-checked .check-icon {
    color: var(--text-secondary);
  }

  .detail-item-name {
    flex: 1;
    min-width: 0;
    color: var(--text);
  }

  .was-checked .detail-item-name {
    text-decoration: line-through;
    color: var(--text-secondary);
  }

  .detail-item-qty {
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .extra-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  /* ── Actions détail ── */
  .detail-actions {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }

  .delete-confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .delete-msg {
    font-size: 13px;
    color: var(--error);
    font-weight: 500;
    flex: 1;
  }

  .btn-sm {
    font-size: 13px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
  }

  .btn-danger {
    background: var(--error);
    color: white;
    border: none;
    cursor: pointer;
    font-family: var(--font-body);
    font-weight: 600;
    border-radius: var(--radius-sm);
  }

  .btn-danger:disabled {
    opacity: 0.6;
  }

  .btn-delete-trigger {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .btn-delete-trigger:hover {
    color: var(--error);
    border-color: var(--error);
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

  .spinner-sm {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
