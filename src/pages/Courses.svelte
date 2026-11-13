<script lang="ts">
  // Liste de courses active du foyer.
  //   - articles à prendre groupés par rayon, articles pris dans « Dans le chariot »
  //   - temps réel entre membres (cochage, ajout, suppression)
  //   - hors connexion : dernière liste gardée sur le téléphone, cochages en attente
  //   - « Mettre à jour depuis le planning » ne perd ni les cochages ni les ajouts à la main
  //   - achats habituels (fenêtre « Habituels ») et placard (« Sûrement déjà à la maison »),
  //     masqués sans erreur si les tables n'existent pas encore côté base
  import { onMount, onDestroy } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import StaplesDialog from '../components/StaplesDialog.svelte'
  import PantryDialog from '../components/PantryDialog.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { auth } from '../lib/auth.svelte'
  import { supabase } from '../lib/supabase'
  import { fetchOrCreatePlan, fetchSlots, getMonday, toISODate } from '../lib/api/meals'
  import { fetchShoppingCategories } from '../lib/api/recipes'
  import {
    fetchActiveList, fetchListItems, generateListFromPlan, regenerateList,
    toggleItem, addExtraItem, removeItem, completeList,
  } from '../lib/api/shopping'
  import {
    loadCachedList, saveCachedList, queueToggle, applyPending, flushPending,
    pendingToggles, isNetworkError,
    loadCachedHousehold, saveCachedHousehold, queueNeeded, applyPendingNeeded, flushPendingNeeded,
  } from '../lib/offline'
  import { fetchStaples, fetchPantry, isProbablyAtHome, setItemNeeded } from '../lib/api/household'
  import type {
    ShoppingList, ShoppingListItemWithCategory, ShoppingCategory, Staple, PantryItem,
  } from '../lib/types'
  import type { RealtimeChannel } from '@supabase/supabase-js'
  import { toast } from '../lib/toast.svelte'
  import { tap } from '../lib/haptics'
  import { fly } from 'svelte/transition'
  import { flip } from 'svelte/animate'

  // Animations de liste (transform/opacity uniquement) ; coupées si
  // « réduire les animations » est activé sur le téléphone.
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const d = (ms: number) => (reduceMotion ? 0 : ms)

  // ── État ──
  let list: ShoppingList | null = $state(null)
  let items: ShoppingListItemWithCategory[] = $state([])
  let categories: ShoppingCategory[] = $state([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let busy = $state(false)

  // Hors connexion
  let offline = $state(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  let cachedAt = $state<string | null>(null)
  let pendingCount = $state(pendingToggles().length)

  // Ajout manuel
  let showAddForm = $state(false)
  let newItemName = $state('')
  let newItemQty = $state('')
  let newItemCat = $state('')

  // Confirmations
  let confirm = $state<'complete' | 'regenerate' | null>(null)

  // « Dans le chariot » replié par défaut
  let cartOpen = $state(false)

  // Habituels et placard du foyer. null = indisponible (migration pas encore
  // passée, ou jamais chargé hors connexion) : les nouveautés restent masquées.
  let staples = $state<Staple[] | null>(null)
  let pantry = $state<PantryItem[] | null>(null)
  let dialog = $state<'staples' | 'pantry' | null>(null)
  // « Sûrement déjà à la maison » replié par défaut
  let homeOpen = $state(false)

  const familyId = $derived(profileState.profile?.family_id ?? null)

  // ── Chargement (cache d'abord, réseau ensuite) ──

  function persist() {
    if (familyId) saveCachedList(familyId, { list, items, categories })
  }

  /** Cochages et « il en manque » faits sans réseau, réappliqués à l'affichage */
  function withPending(list: ShoppingListItemWithCategory[]): ShoppingListItemWithCategory[] {
    return applyPendingNeeded(applyPending(list))
  }

  function persistHousehold() {
    if (familyId) saveCachedHousehold(familyId, { staples, pantry })
  }

  /**
   * Habituels + placard, à part : une erreur (table absente, réseau) ne doit
   * jamais gêner la liste. On garde la version du téléphone si le réseau manque.
   */
  async function loadHousehold(fid: string) {
    const [st, pa] = await Promise.allSettled([fetchStaples(fid), fetchPantry(fid)])
    const netDown = [st, pa].some((r) => r.status === 'rejected' && isNetworkError(r.reason))
    if (netDown) return // on reste sur le cache
    staples = st.status === 'fulfilled' ? st.value : null
    pantry = pa.status === 'fulfilled' ? pa.value : null
    persistHousehold()
  }

  async function load() {
    const fid = familyId
    if (!fid) return
    error = null

    const home = loadCachedHousehold(fid)
    if (home) {
      staples = home.staples
      pantry = home.pantry
    }

    const cache = loadCachedList(fid)
    if (cache) {
      list = cache.list
      items = withPending(cache.items)
      categories = cache.categories
      cachedAt = cache.savedAt
      loading = false // on affiche tout de suite la dernière version connue
    }

    try {
      await flushPending()
      await flushPendingNeeded().catch(() => 0)
      pendingCount = pendingToggles().length
      const [activeList, cats] = await Promise.all([
        fetchActiveList(fid),
        fetchShoppingCategories(),
        loadHousehold(fid).catch(() => {}),
      ])
      categories = cats
      list = activeList
      items = activeList ? withPending(await fetchListItems(activeList.id)) : []
      offline = false
      cachedAt = null
      persist()
    } catch (e: any) {
      if (isNetworkError(e) && cache) {
        offline = true // on reste sur la version du téléphone
      } else if (isNetworkError(e)) {
        offline = true
        error = 'Pas de réseau, et aucune liste enregistrée sur ce téléphone.'
      } else {
        error = e.message
      }
    } finally {
      loading = false
    }
  }

  $effect(() => {
    if (profileState.loading) return
    if (!familyId) {
      loading = false
      error = 'Profil introuvable.'
      return
    }
    load()
  })

  // Réseau qui revient / qui part
  function onOnline() {
    offline = false
    load().then(() => {
      if (pendingToggles().length === 0 && pendingCount === 0) return
    })
  }
  function onOffline() { offline = true }
  onMount(() => {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
  })
  onDestroy(() => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })

  // ── Dérivés ──

  /** Articles du planning qui sont au placard : mis à part, hors des rayons et du compteur */
  const atHome = $derived(
    pantry && pantry.length > 0
      ? items.filter((i) => isProbablyAtHome(i, pantry!)).sort((a, b) => a.position - b.position)
      : [],
  )
  const atHomeIds = $derived(new Set(atHome.map((i) => i.id)))
  const toBuy = $derived(items.filter((i) => !i.checked && !atHomeIds.has(i.id)))
  const inCart = $derived(items.filter((i) => i.checked).sort((a, b) => a.position - b.position))

  /** Articles à prendre, groupés par rayon (ordre des rayons du magasin) */
  const groups = $derived.by(() => {
    const map = new Map<string, { category: ShoppingCategory | null; items: ShoppingListItemWithCategory[] }>()
    for (const item of [...toBuy].sort((a, b) => a.position - b.position)) {
      const key = item.shopping_category_id || '__none__'
      if (!map.has(key)) map.set(key, { category: item.shopping_categories, items: [] })
      map.get(key)!.items.push(item)
    }
    return [...map.values()].sort((a, b) => (a.category?.position ?? 999) - (b.category?.position ?? 999))
  })

  // « Sûrement déjà à la maison » ne compte pas : ni dans « N à prendre », ni dans la barre
  const total = $derived(items.length - atHome.length)
  const done = $derived(inCart.length)
  const allDone = $derived(total > 0 && done === total)

  let celebrated = false
  $effect(() => {
    if (allDone && !celebrated) {
      celebrated = true
      tap('success')
      toast.success('Tout est dans le chariot !')
    }
    if (!allDone) celebrated = false
  })

  // ── Temps réel ──
  // Variable NON réactive : l'effet qui s'abonne la lit puis la modifie.
  let channel: RealtimeChannel | null = null

  function unsubscribe() {
    if (channel) {
      supabase?.removeChannel(channel)
      channel = null
    }
  }

  function subscribe(listId: string) {
    unsubscribe()
    if (!supabase) return
    channel = supabase
      .channel(`shopping-items-${listId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shopping_list_items', filter: `shopping_list_id=eq.${listId}` },
        (payload) => {
          const u = payload.new as any
          items = items.map((i) => (i.id === u.id
            ? { ...i, checked: u.checked, checked_by: u.checked_by, checked_at: u.checked_at, quantity: u.quantity,
                needed: u.needed ?? i.needed }
            : i))
          persist()
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_list_items', filter: `shopping_list_id=eq.${listId}` },
        async () => {
          // l'insertion ne renvoie pas le rayon joint : on recharge
          if (list) { items = withPending(await fetchListItems(list.id)); persist() }
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_list_items' },
        (payload) => {
          const id = (payload.old as any)?.id
          if (id) { items = items.filter((i) => i.id !== id); persist() }
        })
      .subscribe()
  }

  $effect(() => {
    const id = list?.id
    if (id && !offline) subscribe(id)
    else unsubscribe()
  })
  onDestroy(unsubscribe)

  // ── Cochage (fonctionne aussi sans réseau) ──

  async function toggle(item: ShoppingListItemWithCategory) {
    const userId = auth.user?.id
    if (!userId) return
    const checked = !item.checked
    tap()
    items = items.map((i) => (i.id === item.id ? { ...i, checked } : i))
    persist()
    try {
      await toggleItem(item.id, checked, userId)
    } catch (e) {
      if (isNetworkError(e)) {
        queueToggle({ itemId: item.id, checked, userId })
        pendingCount = pendingToggles().length
        offline = true
      } else {
        items = items.map((i) => (i.id === item.id ? { ...i, checked: !checked } : i))
        persist()
        toast.error((e as any)?.message ?? 'Erreur')
      }
    }
  }

  // ── « Il en manque » : l'article du placard repasse dans son rayon (pour tout le foyer) ──

  async function markNeeded(item: ShoppingListItemWithCategory) {
    tap()
    items = items.map((i) => (i.id === item.id ? { ...i, needed: true } : i))
    persist()
    try {
      await setItemNeeded(item.id, true)
    } catch (e) {
      if (isNetworkError(e)) {
        queueNeeded({ itemId: item.id, needed: true })
        offline = true
      } else {
        items = items.map((i) => (i.id === item.id ? { ...i, needed: false } : i))
        persist()
        toast.error((e as any)?.message ?? 'Erreur')
      }
    }
  }

  // ── Habituels / placard ──

  async function reloadItems() {
    if (!list) return
    items = withPending(await fetchListItems(list.id))
    persist()
  }

  function openDialog(which: 'staples' | 'pantry') {
    if (needNetwork()) return
    dialog = which
  }

  function needNetwork(): boolean {
    if (offline) toast.error('Pas de réseau : cette action attendra le retour de la connexion.')
    return offline
  }

  async function remove(item: ShoppingListItemWithCategory) {
    if (needNetwork()) return
    const before = items
    items = items.filter((i) => i.id !== item.id)
    try {
      await removeItem(item.id)
      persist()
    } catch (e: any) {
      items = before
      toast.error(e.message)
    }
  }

  async function addItem() {
    if (!list || !newItemName.trim() || busy || needNetwork()) return
    busy = true
    try {
      await addExtraItem(list.id, newItemName, newItemQty || null, newItemCat || null)
      items = withPending(await fetchListItems(list.id))
      persist()
      newItemName = ''
      newItemQty = ''
      showAddForm = false
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      busy = false
    }
  }

  // ── Générer / mettre à jour / terminer ──

  async function currentPlanWithSlots() {
    const plan = await fetchOrCreatePlan(familyId!, toISODate(getMonday(new Date())))
    const slots = await fetchSlots(plan.id)
    return { plan, empty: slots.length === 0 }
  }

  async function generate() {
    if (!familyId || busy || needNetwork()) return
    busy = true
    error = null
    try {
      const { plan, empty } = await currentPlanWithSlots()
      if (empty) {
        error = 'Le planning de cette semaine est vide. Ajoute des recettes dans l’onglet Semaine.'
        return
      }
      list = await generateListFromPlan(familyId, plan.id)
      items = await fetchListItems(list.id)
      persist()
      toast.success(`Liste prête : ${items.length} articles`)
    } catch (e: any) {
      error = e.message
    } finally {
      busy = false
    }
  }

  async function regenerate() {
    if (!list || !familyId || busy || needNetwork()) return
    busy = true
    try {
      const { plan, empty } = await currentPlanWithSlots()
      if (empty) {
        toast.error('Le planning de cette semaine est vide.')
        return
      }
      await regenerateList(list.id, plan.id)
      items = withPending(await fetchListItems(list.id))
      persist()
      toast.success('Liste mise à jour (cochés et ajouts conservés)')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      busy = false
      confirm = null
    }
  }

  async function complete() {
    if (!list || busy || needNetwork()) return
    busy = true
    try {
      await completeList(list.id)
      list = null
      items = []
      persist()
      toast.success('Courses terminées, liste rangée dans l’historique')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      busy = false
      confirm = null
    }
  }

  function timeLabel(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }
</script>

<div class="page">
  <header class="head">
    <h1>Courses</h1>
    {#if list && total > 0}
      <p class="head-sub">
        {#if allDone}Tout est dans le chariot{:else}<strong>{total - done}</strong> article{total - done > 1 ? 's' : ''} à prendre{/if}
      </p>
      <div class="progress" aria-hidden="true">
        <div class="progress-fill" class:done={allDone} style:width="{(done / total) * 100}%"></div>
      </div>
    {/if}
  </header>

  {#if offline}
    <div class="offline-banner" role="status">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.17-2.8M19 13a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 10.7 5M12 20h.01"/></svg>
      <span>
        Hors connexion{#if cachedAt}{' · '}liste du {timeLabel(cachedAt)}{/if}.
        {#if pendingCount > 0}<strong>{pendingCount} cochage{pendingCount > 1 ? 's' : ''}</strong> en attente, envoyé{pendingCount > 1 ? 's' : ''} au retour du réseau.{:else}Tu peux cocher, ce sera envoyé au retour du réseau.{/if}
      </span>
    </div>
  {/if}

  {#if loading}
    <div class="center"><div class="spinner"></div></div>
  {:else if error && !list}
    <div class="card empty">
      <p class="error-text">{error}</p>
      {#if !offline}<button class="btn btn-outline" onclick={load}>Réessayer</button>{/if}
    </div>
  {:else if !list}
    <!-- Pas de liste : la générer depuis le planning -->
    <div class="card empty">
      <span class="empty-icon"><Icon name="cart" size={44} strokeWidth={1.5} /></span>
      <h2>Pas de liste en cours</h2>
      <p>Elle se remplit toute seule à partir des repas prévus cette semaine.</p>
      <button class="btn btn-primary empty-cta" onclick={generate} disabled={busy}>
        <Icon name="list" /> {busy ? 'Préparation…' : 'Créer la liste depuis le planning'}
      </button>
    </div>
  {:else}
    {#if groups.length === 0 && inCart.length === 0 && atHome.length === 0}
      <div class="card empty"><p>La liste est vide.</p></div>
    {/if}

    <!-- À prendre, par rayon -->
    {#each groups as group (group.category?.id ?? 'none')}
      <section class="card rayon">
        <h2 class="rayon-title">
          <span class="rayon-icon" aria-hidden="true">{group.category?.icon || '🛒'}</span>
          {group.category?.name || 'Sans rayon'}
          <span class="rayon-count">{group.items.length}</span>
        </h2>
        <ul class="rows">
          {#each group.items as item (item.id)}
            <li class="row" animate:flip={{ duration: d(220) }} out:fly={{ x: 60, duration: d(180) }}>
              <button class="row-main" onclick={() => toggle(item)} aria-label="Mettre {item.name} dans le chariot">
                <span class="box" aria-hidden="true"></span>
                <span class="row-name">{item.name}</span>
                {#if item.is_extra}<span class="badge">ajouté</span>{/if}
                {#if item.quantity}<span class="row-qty">{item.quantity}</span>{/if}
              </button>
              <button class="row-remove" onclick={() => remove(item)} aria-label="Retirer {item.name} de la liste">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    {#if allDone}
      <div class="card all-done">
        <Icon name="check-circle" size={22} />
        <span>Tout est pris ! Tu peux terminer les courses.</span>
      </div>
    {/if}

    <!-- Ajouter un article -->
    {#if showAddForm}
      <section class="card add-form">
        <h2 class="add-title">Ajouter un article</h2>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" placeholder="Nom (ex : papier toilette)" bind:value={newItemName} autofocus
          onkeydown={(e) => { if (e.key === 'Enter') addItem() }} />
        <div class="add-row">
          <input class="input" placeholder="Quantité" bind:value={newItemQty} />
          <select class="input" bind:value={newItemCat} aria-label="Rayon">
            <option value="">Sans rayon</option>
            {#each categories as cat (cat.id)}
              <option value={cat.id}>{cat.icon} {cat.name}</option>
            {/each}
          </select>
        </div>
        <div class="add-actions">
          <button class="btn btn-outline" onclick={() => (showAddForm = false)}>Annuler</button>
          <button class="btn btn-primary" onclick={addItem} disabled={!newItemName.trim() || busy}>Ajouter</button>
        </div>
      </section>
    {:else}
      <div class="tools" class:single={!staples && !pantry}>
        <button class="add-btn" onclick={() => (showAddForm = true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          Ajouter un article
        </button>
        {#if staples}
          <button class="tool-btn" onclick={() => openDialog('staples')} disabled={offline}>
            <Icon name="star" size={18} />
            Habituels
            {#if staples.length > 0}<span class="tool-count">{staples.length}</span>{/if}
          </button>
        {/if}
        {#if pantry}
          <button class="tool-btn" onclick={() => openDialog('pantry')} disabled={offline}>
            <Icon name="archive" size={18} />
            Mon placard
            {#if pantry.length > 0}<span class="tool-count">{pantry.length}</span>{/if}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Sûrement déjà à la maison (produits du placard) -->
    {#if atHome.length > 0}
      <section class="card cart home">
        <button class="cart-head" onclick={() => (homeOpen = !homeOpen)} aria-expanded={homeOpen}>
          <Icon name="home" />
          <span>Sûrement déjà à la maison</span>
          <span class="rayon-count">{atHome.length}</span>
          <svg class="chevron" class:open={homeOpen} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        {#if homeOpen}
          <p class="home-hint">
            Ils sont dans ton placard.
            <button class="inline-link" onclick={() => openDialog('pantry')} disabled={offline}>Gérer mon placard</button>
          </p>
          <ul class="rows">
            {#each atHome as item (item.id)}
              <li class="row is-home" animate:flip={{ duration: d(220) }} out:fly={{ y: -16, duration: d(180) }}>
                <button class="row-main" onclick={() => toggle(item)} aria-label="Mettre {item.name} dans le chariot">
                  <span class="box" aria-hidden="true"></span>
                  <span class="row-name">{item.name}</span>
                  {#if item.quantity}<span class="row-qty">{item.quantity}</span>{/if}
                </button>
                <button class="need-btn" onclick={() => markNeeded(item)} aria-label="Il manque {item.name} : le remettre dans la liste">
                  Il en manque
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- Dans le chariot -->
    {#if inCart.length > 0}
      <section class="card cart">
        <button class="cart-head" onclick={() => (cartOpen = !cartOpen)} aria-expanded={cartOpen}>
          <Icon name="cart" />
          <span>Dans le chariot</span>
          <span class="rayon-count">{inCart.length}</span>
          <svg class="chevron" class:open={cartOpen} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        {#if cartOpen}
          <ul class="rows">
            {#each inCart as item (item.id)}
              <li class="row is-done" animate:flip={{ duration: d(220) }} in:fly={{ x: -40, duration: d(200) }}>
                <button class="row-main" onclick={() => toggle(item)} aria-label="Remettre {item.name} dans la liste">
                  <span class="box checked" aria-hidden="true"><Icon name="check" size={14} strokeWidth={3} /></span>
                  <span class="row-name">{item.name}</span>
                  {#if item.quantity}<span class="row-qty">{item.quantity}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    <!-- Actions -->
    <div class="actions">
      <button class="btn btn-primary" onclick={() => (confirm = 'complete')} disabled={busy}>
        <Icon name="check" /> Terminer les courses
      </button>
      <button class="btn btn-outline" onclick={() => (confirm = 'regenerate')} disabled={busy}>
        <Icon name="refresh" /> Mettre à jour depuis le planning
      </button>
    </div>
  {/if}
</div>

{#if dialog === 'staples' && staples && list && familyId}
  <StaplesDialog
    {familyId}
    listId={list.id}
    {staples}
    {categories}
    listItems={items}
    onchange={(next) => { staples = next; persistHousehold() }}
    onadded={reloadItems}
    onclose={() => (dialog = null)}
  />
{/if}

{#if dialog === 'pantry' && pantry && familyId}
  <PantryDialog
    {familyId}
    {pantry}
    {categories}
    listItems={items}
    onchange={(next) => { pantry = next; persistHousehold() }}
    onclose={() => (dialog = null)}
  />
{/if}

{#if confirm === 'complete'}
  <ConfirmDialog title="Terminer les courses ?" confirmLabel="Terminer" {busy}
    onconfirm={complete} oncancel={() => (confirm = null)}>
    {#if done < total}
      Il reste <strong>{total - done} article{total - done > 1 ? 's' : ''}</strong> non pris.
    {:else}
      Tout est pris.
    {/if}
    La liste sera rangée dans l’historique.
  </ConfirmDialog>
{/if}

{#if confirm === 'regenerate'}
  <ConfirmDialog title="Mettre à jour la liste ?" confirmLabel="Mettre à jour" {busy}
    onconfirm={regenerate} oncancel={() => (confirm = null)}>
    Les ingrédients sont recalculés à partir des repas prévus cette semaine.
    <strong>Les articles déjà cochés et ceux ajoutés à la main sont conservés.</strong>
  </ConfirmDialog>
{/if}

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── En-tête ── */
  .head h1 {
    font-size: 28px;
    padding-right: 48px;
  }

  .head-sub {
    margin-top: 4px;
    font-size: 15px;
    color: var(--text-secondary);
  }

  .head-sub strong { color: var(--text); font-size: 17px; }

  .progress {
    margin-top: 10px;
    height: 6px;
    border-radius: 999px;
    background: var(--surface);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 60%, white));
    transition: width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .progress-fill.done { background: var(--success); }

  /* ── Bandeau hors connexion ── */
  .offline-banner {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(255, 196, 0, 0.14);
    border: 1px solid rgba(255, 196, 0, 0.35);
    color: #FFE08A;
    font-size: 14px;
    line-height: 1.4;
  }

  .offline-banner svg { flex-shrink: 0; margin-top: 1px; }
  .offline-banner span { color: var(--text); }

  /* ── Cartes ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 14px;
  }

  .empty {
    text-align: center;
    padding: 32px 20px;
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .empty h2 { font-size: 20px; color: var(--text); }
  .empty-icon { color: var(--text-secondary); }
  .empty-cta { margin-top: 12px; width: auto; padding: 14px 20px; }
  .error-text { color: var(--error); }

  /* ── Rayons ── */
  .rayon { padding: 12px 8px 6px; }

  .rayon-title {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px 8px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .rayon-icon { font-size: 18px; }

  .rayon-count {
    margin-left: auto;
    min-width: 24px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 12px;
    text-align: center;
    color: var(--text);
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .row {
    display: flex;
    align-items: center;
    border-radius: 12px;
    animation: fade-up 0.25s ease-out backwards;
  }

  .row + .row { border-top: 1px solid var(--border); }

  /* Toute la ligne se touche pour cocher (pas seulement la case) */
  .row-main {
    flex: 1;
    min-width: 0;
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border: none;
    background: none;
    color: var(--text);
    font-family: var(--font-body);
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    border-radius: 12px;
  }

  .row-main:active { background: var(--primary-light); }

  .box {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border-radius: 7px;
    border: 2px solid var(--border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .box.checked {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
    animation: check-pop 0.25s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @keyframes check-pop {
    0% { transform: scale(0.7); }
    60% { transform: scale(1.12); }
    100% { transform: scale(1); }
  }

  .row-name {
    flex: 1;
    min-width: 0;
    font-size: 16px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .row-qty {
    flex-shrink: 0;
    max-width: 45%;
    font-size: 14px;
    font-weight: 600;
    color: var(--primary);
    text-align: right;
  }

  .badge {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-secondary);
  }

  .row-remove {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: none;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }

  .row-remove:active { background: var(--error-bg); color: var(--error); }

  .is-done .row-name { text-decoration: line-through; color: var(--text-secondary); }
  .is-done .row-qty { color: var(--text-secondary); }

  .all-done {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--success-bg);
    border-color: color-mix(in srgb, var(--success) 40%, transparent);
    color: var(--success);
    font-weight: 600;
  }

  .all-done span { color: var(--text); }

  /* ── Dans le chariot ── */
  .cart { padding: 4px 8px; }

  .cart-head {
    width: 100%;
    min-height: 52px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    border: none;
    background: none;
    color: var(--text);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }

  .cart-head .rayon-count { margin-left: auto; }
  .chevron { transition: transform 0.2s; color: var(--text-secondary); }
  .chevron.open { transform: rotate(180deg); }
  .cart .rows { padding-bottom: 6px; }

  /* ── Ajout ── */
  .add-btn {
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--radius-xl);
    border: 1.5px dashed var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .add-btn:active { background: var(--primary-light); border-color: var(--primary); }

  /* Ajouter / Habituels / Mon placard */
  .tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .tools .add-btn { grid-column: 1 / -1; }
  /* Un seul bouton secondaire disponible : il prend toute la largeur */
  .tools .tool-btn:last-child:nth-child(2) { grid-column: 1 / -1; }

  .tool-btn {
    min-height: 48px;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 12px;
    border-radius: 14px;
    border: 1px solid var(--border-strong);
    background: rgba(9, 24, 50, 0.6);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    touch-action: manipulation;
  }

  .tool-btn :global(svg) { color: var(--primary); flex-shrink: 0; }
  .tool-btn:active { background: var(--primary-light); border-color: var(--primary); }
  .tool-btn:disabled { opacity: 0.45; cursor: default; }

  .tool-count {
    min-width: 22px;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  /* ── Sûrement déjà à la maison ── */
  .home-hint {
    padding: 0 8px 6px;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .inline-link {
    min-height: 44px;
    padding: 0 4px;
    border: none;
    background: none;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .inline-link:disabled { opacity: 0.5; }

  .is-home .row-name, .is-home .row-qty { color: var(--text-secondary); }
  .is-home .box { border-style: dashed; }

  .need-btn {
    flex-shrink: 0;
    min-height: 40px;
    margin-left: 2px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: #FFB596;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    touch-action: manipulation;
    position: relative;
  }

  /* Zone de tap portée à 48 px sans grossir le bouton */
  .need-btn::before { content: ''; position: absolute; inset: -4px -2px; }
  .need-btn:active { transform: scale(0.96); background: color-mix(in srgb, var(--accent) 26%, transparent); }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .add-title { font-size: 17px; }

  .add-row {
    display: grid;
    grid-template-columns: 1fr 1.3fr;
    gap: 8px;
  }

  .add-form .input { background: var(--bg); }

  .add-actions {
    display: flex;
    gap: 8px;
  }

  .add-actions .btn { flex: 1; min-height: 46px; border-radius: 14px; }

  /* ── Actions ── */
  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }

  .actions .btn { min-height: 50px; border-radius: 14px; }
  .actions .btn-outline { background: rgba(9, 24, 50, 0.6); color: var(--text); }

  /* ── Divers ── */
  .center { display: flex; justify-content: center; padding: 48px 0; }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (hover: hover) and (pointer: fine) {
    .row-main:hover { background: rgba(255, 255, 255, 0.06); }
    .row-remove:hover { background: var(--error-bg); color: var(--error); }
    .add-btn:hover { border-color: var(--primary); }
    .tool-btn:not(:disabled):hover { border-color: var(--primary); }
    .need-btn:hover { background: color-mix(in srgb, var(--accent) 24%, transparent); }
    .inline-link:hover { text-decoration: underline; }
  }
</style>
