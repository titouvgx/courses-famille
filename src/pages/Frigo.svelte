<script lang="ts" module>
  // Gardés en mémoire pendant la session (variables de module) : en revenant
  // sur la page, on retrouve ses ingrédients sans tout retaper.
  let savedFridge: string[] = []
</script>

<script lang="ts">
  // « Qu'est-ce qu'on mange ? » : on dit ce qu'il y a dans le frigo,
  // l'appli propose les recettes où il manque le moins de choses.
  // Tout le calcul se fait sur le téléphone (index des ingrédients chargé une fois).
  import { tick } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import PlanRecipeDialog from '../components/PlanRecipeDialog.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { toast } from '../lib/toast.svelte'
  import { sizedImage } from '../lib/images'
  import { normalizeText, matchKey, sameProduct } from '../lib/quantities'
  import {
    fetchRecipeIndex, fetchRecipesByIds, fetchRecipe, fetchKnownIngredients,
    type RecipeIndexEntry,
  } from '../lib/api/recipes'
  import {
    fetchAllRecipeIngredients, fetchPantry, rankByFridge,
    type RecipeIngredientRef, type FridgeMatch,
  } from '../lib/api/household'
  import type { RecipeDetail, RecipeWithCategory } from '../lib/types'

  const PAGE = 20
  const SUGGESTION_COUNT = 10
  /** Jamais proposés comme « produits fréquents » : on les a presque toujours. */
  const BASICS = ['sel', 'poivre', 'eau', 'huile', 'sucre', 'farine']

  // ────────── Données ──────────

  let ingredients = $state<RecipeIngredientRef[]>([])
  let index = $state<RecipeIndexEntry[]>([])
  let pantry = $state<string[]>([])
  let known = $state<string[]>([]) // noms pour l'autocomplétion
  let loading = $state(true)
  let error = $state<string | null>(null)
  let reloadKey = $state(0)

  let loadedFor: string | null = null

  $effect(() => {
    void reloadKey
    if (profileState.loading) return
    const familyId = profileState.profile?.family_id ?? null
    const key = `${familyId}#${reloadKey}`
    if (loadedFor === key) return
    loadedFor = key

    let cancelled = false
    loading = true
    error = null

    Promise.all([fetchAllRecipeIngredients(), fetchRecipeIndex()])
      .then(([ings, idx]) => {
        if (cancelled) return
        ingredients = ings
        index = idx
      })
      .catch((e) => { if (!cancelled) error = e?.message ?? 'Erreur de chargement' })
      .finally(() => { if (!cancelled) loading = false })

    // Placard : facultatif (la migration peut manquer) → placard vide
    if (familyId) {
      fetchPantry(familyId)
        .then((p) => { if (!cancelled) pantry = p.map((x) => x.name) })
        .catch(() => { if (!cancelled) pantry = [] })

      // Autocomplétion : facultative aussi
      fetchKnownIngredients(familyId)
        .then((k) => { if (!cancelled) known = k.map((x) => x.name) })
        .catch(() => {})
    }

    return () => { cancelled = true }
  })

  /** Noms proposés : ingrédients connus + tous ceux des recettes, sans doublon. */
  const vocabulary = $derived.by(() => {
    const seen = new Map<string, string>()
    for (const n of [...known, ...ingredients.map((i) => i.name)]) {
      const k = normalizeText(n)
      if (k && !seen.has(k)) seen.set(k, n.trim())
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'))
  })

  /** Produits les plus utilisés dans les recettes (hors placard et basiques). */
  const frequent = $derived.by(() => {
    const counts = new Map<string, { name: string; recipes: Set<string> }>()
    for (const ing of ingredients) {
      const k = matchKey(ing.name)
      if (!k) continue
      const entry = counts.get(k) ?? { name: ing.name.trim(), recipes: new Set<string>() }
      entry.recipes.add(ing.recipe_id)
      counts.set(k, entry)
    }
    return [...counts.values()]
      .filter((e) => !BASICS.some((b) => sameProduct(e.name, b)))
      .filter((e) => !pantry.some((p) => sameProduct(e.name, p)))
      .filter((e) => !fridge.some((f) => sameProduct(e.name, f)))
      .sort((a, b) => b.recipes.size - a.recipes.size || a.name.localeCompare(b.name, 'fr'))
      .slice(0, SUGGESTION_COUNT)
      .map((e) => e.name)
  })

  // ────────── Frigo (puces) ──────────

  let fridge = $state<string[]>([...savedFridge])
  let text = $state('')
  let inputEl: HTMLInputElement | undefined = $state()

  $effect(() => {
    savedFridge = [...fridge]
  })

  function addToFridge(raw: string) {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (!name) return
    const k = matchKey(name)
    if (fridge.some((f) => matchKey(f) === k)) return // déjà là
    // Le nom connu (« Courgettes ») plutôt que la saisie (« courgettes »)
    const exact = vocabulary.find((v) => normalizeText(v) === normalizeText(name))
    fridge = [...fridge, exact ?? name]
    shownCount = PAGE
  }

  function removeFromFridge(name: string) {
    fridge = fridge.filter((f) => f !== name)
    shownCount = PAGE
    inputEl?.focus()
  }

  function clearFridge() {
    fridge = []
    shownCount = PAGE
    inputEl?.focus()
  }

  // ────────── Autocomplétion ──────────

  let acOpen = $state(false)
  let acIndex = $state(-1)

  const acResults = $derived.by(() => {
    const query = normalizeText(text)
    if (!query) return []
    const starts: string[] = []
    const contains: string[] = []
    for (const v of vocabulary) {
      if (fridge.some((f) => normalizeText(f) === normalizeText(v))) continue
      const n = normalizeText(v)
      if (n.startsWith(query)) starts.push(v)
      else if (n.includes(query)) contains.push(v)
    }
    return [...starts, ...contains].slice(0, 6)
  })

  function onInput() {
    acIndex = -1
    // « courgettes, œufs, » : chaque morceau terminé par une virgule devient une puce
    if (text.includes(',')) {
      const parts = text.split(',')
      const rest = parts.pop() ?? ''
      for (const p of parts) addToFridge(p)
      text = rest.trimStart()
    }
    acOpen = text.trim().length > 0
  }

  function pick(name: string) {
    addToFridge(name)
    text = ''
    acOpen = false
    acIndex = -1
    inputEl?.focus()
  }

  function onKeydown(e: KeyboardEvent) {
    const n = acResults.length
    if (acOpen && n > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      acIndex = e.key === 'ArrowDown' ? (acIndex + 1) % n : (acIndex - 1 + n) % n
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (acOpen && acIndex >= 0 && acResults[acIndex]) pick(acResults[acIndex])
      else if (text.trim()) pick(text)
      return
    }
    if (e.key === 'Escape') {
      acOpen = false
      acIndex = -1
      return
    }
    // Retour arrière dans un champ vide : retire la dernière puce
    if (e.key === 'Backspace' && !text && fridge.length > 0) {
      fridge = fridge.slice(0, -1)
    }
  }

  function onBlur() {
    // Laisser le temps au clic sur une suggestion (pointerdown l'a déjà traitée)
    setTimeout(() => { acOpen = false; acIndex = -1 }, 120)
  }

  // ────────── Résultats ──────────

  const titles = $derived(new Map(index.map((r) => [r.id, r.title])))
  const matches: FridgeMatch[] = $derived(
    fridge.length === 0 || loading ? [] : rankByFridge(ingredients, fridge, pantry).filter((m) => titles.has(m.recipeId)),
  )
  const readyCount = $derived(matches.filter((m) => m.missing.length === 0).length)

  let shownCount = $state(PAGE)
  const shown = $derived(matches.slice(0, shownCount))

  // Photos / catégories : chargées seulement pour les cartes affichées
  let details = $state<Record<string, RecipeWithCategory>>({})
  const requested = new Set<string>()

  $effect(() => {
    const missingIds = shown.map((m) => m.recipeId).filter((id) => !requested.has(id))
    if (missingIds.length === 0) return
    for (const id of missingIds) requested.add(id)
    fetchRecipesByIds(missingIds)
      .then((rows) => {
        const next = { ...details }
        for (const r of rows) next[r.id] = r
        details = next
      })
      .catch(() => { for (const id of missingIds) requested.delete(id) }) // réessaiera
  })

  let openDetail = $state<string | null>(null)

  function statusText(m: FridgeMatch): string {
    const n = m.missing.length
    if (n === 0) return 'Tout y est'
    if (n === 1) return `Il manque 1 ingrédient : ${m.missing[0].toLowerCase()}`
    return `Il manque ${n} ingrédients`
  }

  function listText(names: string[]): string {
    return names.map((n, i) => (i === 0 ? n : n.toLowerCase())).join(', ')
  }

  // ────────── Ajouter à ma semaine ──────────

  let planRecipe = $state<RecipeDetail | null>(null)
  let opening = $state<string | null>(null)

  async function openPlan(recipeId: string) {
    if (opening) return
    opening = recipeId
    try {
      planRecipe = await fetchRecipe(recipeId)
    } catch (e: any) {
      toast.error(e?.message ?? 'Recette introuvable')
    } finally {
      opening = null
    }
  }

  async function showMore() {
    shownCount += PAGE
    await tick()
  }

  const pantryHint = $derived(
    pantry.length === 0
      ? ''
      : `Ton placard (${pantry.slice(0, 2).map((p) => p.toLowerCase()).join(', ')}…) est compté comme disponible`,
  )
</script>

{#if planRecipe}
  <PlanRecipeDialog recipe={planRecipe} mode="plan" onclose={() => (planRecipe = null)} />
{/if}

<div class="page frigo">
  <a href={href('accueil')} class="back-link"><Icon name="arrow-left" size={18} /> Accueil</a>

  <header class="head">
    <h1>Qu'est-ce qu'on mange&nbsp;?</h1>
    <p class="head-sub">Dis ce qu'il te reste, on te trouve une recette.</p>
  </header>

  <!-- ── Saisie du frigo ── -->
  <div class="fridge-box">
    <label class="field-label" for="frigo-input">Ce qu'il y a dans le frigo</label>
    <div class="input-wrap">
      <input
        id="frigo-input"
        bind:this={inputEl}
        bind:value={text}
        oninput={onInput}
        onkeydown={onKeydown}
        onfocus={() => (acOpen = text.trim().length > 0)}
        onblur={onBlur}
        class="fridge-input"
        type="text"
        placeholder="Courgettes, œufs, lardons…"
        autocomplete="off"
        autocapitalize="off"
        enterkeyhint="done"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={acOpen && acResults.length > 0}
        aria-controls="frigo-ac"
        aria-activedescendant={acIndex >= 0 ? `frigo-ac-${acIndex}` : undefined}
      />
      {#if text.trim()}
        <button class="add-btn" type="button" onclick={() => pick(text)} aria-label="Ajouter « {text.trim()} »">
          <Icon name="plus" size={20} />
        </button>
      {/if}

      {#if acOpen && acResults.length > 0}
        <ul class="autocomplete" id="frigo-ac" role="listbox" aria-label="Suggestions">
          {#each acResults as s, i (s)}
            <li
              id="frigo-ac-{i}"
              role="option"
              aria-selected={i === acIndex}
              class="ac-item"
              class:active={i === acIndex}
              onpointerdown={(e) => { e.preventDefault(); pick(s) }}
            >{s}</li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if fridge.length > 0}
      <ul class="chips" aria-label="Dans le frigo">
        {#each fridge as f (f)}
          <li class="chip">
            <span class="chip-name">{f}</span>
            <button class="chip-remove" type="button" onclick={() => removeFromFridge(f)} aria-label="Retirer {f}">
              <Icon name="x" size={15} strokeWidth={2.5} />
            </button>
          </li>
        {/each}
        {#if fridge.length >= 2}
          <li><button class="clear-btn" type="button" onclick={clearFridge}>Tout effacer</button></li>
        {/if}
      </ul>
    {/if}

    {#if pantryHint}
      <p class="pantry-hint"><Icon name="check" size={14} /> {pantryHint}</p>
    {/if}
  </div>

  <!-- ── Résultats ── -->
  {#if loading}
    <div class="results" aria-busy="true" aria-label="Chargement">
      {#each Array(4) as _, i (i)}
        <div class="card skeleton" style:animation-delay="{i * 90}ms">
          <div class="thumb"></div>
          <div class="sk-body"><span class="sk-line"></span><span class="sk-line sk-short"></span></div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="state">
      <p class="state-title">Impossible de charger les recettes</p>
      <p class="state-text">{error}</p>
      <button class="btn btn-outline" onclick={() => reloadKey++}><Icon name="refresh" /> Réessayer</button>
    </div>
  {:else if fridge.length === 0}
    {#if frequent.length > 0}
      <section class="suggest" aria-labelledby="frigo-suggest-title">
        <h2 id="frigo-suggest-title" class="section-title">Souvent dans les recettes</h2>
        <p class="section-sub">Touche ce que tu as pour commencer.</p>
        <div class="suggest-chips">
          {#each frequent as name (name)}
            <button class="suggest-chip" type="button" onclick={() => addToFridge(name)}>
              <Icon name="plus" size={15} strokeWidth={2.5} /> {name}
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <div class="state">
        <span class="state-icon"><Icon name="book" size={40} strokeWidth={1.5} /></span>
        <p class="state-title">Aucune recette pour le moment</p>
        <p class="state-text">Ajoute des recettes : on pourra ensuite te proposer quoi cuisiner.</p>
      </div>
    {/if}
  {:else if matches.length === 0}
    <div class="state">
      <span class="state-icon"><Icon name="plate" size={40} strokeWidth={1.5} /></span>
      <p class="state-title">Aucune recette avec {fridge.length > 1 ? 'ces ingrédients' : 'cet ingrédient'}</p>
      <p class="state-text">
        Vérifie l'orthographe ou ajoute d'autres produits du frigo
        {#if frequent.length > 0}— par exemple :{/if}
      </p>
      {#if frequent.length > 0}
        <div class="suggest-chips center">
          {#each frequent.slice(0, 5) as name (name)}
            <button class="suggest-chip" type="button" onclick={() => addToFridge(name)}>
              <Icon name="plus" size={15} strokeWidth={2.5} /> {name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p class="results-count" aria-live="polite">
      {matches.length} recette{matches.length > 1 ? 's' : ''}
      {#if readyCount > 0}· <strong>{readyCount}</strong> faisable{readyCount > 1 ? 's' : ''} tout de suite{/if}
    </p>

    <ul class="results">
      {#each shown as m (m.recipeId)}
        {@const r = details[m.recipeId]}
        {@const title = titles.get(m.recipeId) ?? ''}
        {@const open = openDetail === m.recipeId}
        <li class="card" class:ready={m.missing.length === 0}>
          <a href={href('recette', m.recipeId)} class="card-main">
            <div class="thumb">
              {#if sizedImage(r?.image_url, 84, 84)}
                <img src={sizedImage(r?.image_url, 84, 84)} alt="" loading="lazy" decoding="async" />
              {:else}
                <span class="initial" aria-hidden="true">{title.trim().charAt(0)}</span>
              {/if}
            </div>
            <div class="card-text">
              <h2 class="card-title">{title}</h2>
              <p class="status" class:ok={m.missing.length === 0} class:one={m.missing.length === 1}>
                {#if m.missing.length === 0}<Icon name="check-circle" size={15} />{/if}
                <span>{statusText(m)}</span>
              </p>
            </div>
            <span class="chev" aria-hidden="true"><Icon name="chevron-right" size={18} /></span>
          </a>

          <div class="card-actions">
            <button
              class="detail-btn"
              type="button"
              aria-expanded={open}
              aria-controls="frigo-detail-{m.recipeId}"
              onclick={() => (openDetail = open ? null : m.recipeId)}
            >
              Détail <span class="rot" class:open><Icon name="chevron-down" size={16} /></span>
            </button>
            <button
              class="plan-btn"
              type="button"
              onclick={() => openPlan(m.recipeId)}
              disabled={opening === m.recipeId}
            >
              <Icon name="calendar" size={16} />
              {opening === m.recipeId ? 'Ouverture…' : 'Ajouter à ma semaine'}
            </button>
          </div>

          {#if open}
            <div class="detail" id="frigo-detail-{m.recipeId}">
              <p><span class="detail-label have">Tu as</span> {listText(m.have)}</p>
              {#if m.missing.length > 0}
                <p><span class="detail-label miss">Il manque</span> {listText(m.missing)}</p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if matches.length > shown.length}
      <div class="more-wrap">
        <button class="btn btn-outline" onclick={showMore}>Voir plus ({matches.length - shown.length})</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .frigo {
    padding: 0 var(--gutter) calc(var(--gutter) + 8px);
    max-width: 880px;
    margin: 0 auto;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    margin-top: calc(8px + env(safe-area-inset-top, 0px));
    color: var(--primary);
    font-weight: 600;
    text-decoration: none;
    touch-action: manipulation;
  }

  .head { margin: 2px 0 16px; }
  .head h1 {
    font-size: clamp(26px, 7.4vw, 34px);
    line-height: 1.12;
    padding-right: 48px; /* avatar */
  }
  .head-sub {
    margin-top: 6px;
    color: var(--text-secondary);
    font-size: 15px;
  }

  /* ── Saisie ── */
  .fridge-box {
    padding: 14px;
    border-radius: var(--radius-xl);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    margin-bottom: 18px;
  }

  .field-label {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .input-wrap { position: relative; }

  .fridge-input {
    width: 100%;
    min-height: 48px;
    padding: 12px 52px 12px 14px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--border-strong);
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 16px; /* pas de zoom auto sur iOS */
    outline: none;
    transition: border-color 0.15s;
  }
  .fridge-input::placeholder { color: var(--text-placeholder); }
  .fridge-input:focus { border-color: var(--primary); }

  .add-btn {
    position: absolute;
    right: 2px;
    top: 2px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-md);
    background: none;
    color: var(--primary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .autocomplete {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 4px);
    z-index: 20;
    list-style: none;
    margin: 0;
    padding: 4px;
    border-radius: var(--radius-md);
    background: var(--bg);
    border: 1px solid var(--border-strong);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4);
  }

  .ac-item {
    min-height: 44px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    touch-action: manipulation;
  }
  .ac-item.active,
  .ac-item:active { background: var(--primary-light); }

  /* Puces du frigo */
  .chips {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding-left: 14px;
    border-radius: 999px;
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 600;
    font-size: 15px;
    animation: chip-in 0.18s ease-out;
  }

  @keyframes chip-in {
    from { opacity: 0; transform: scale(0.9); }
    to   { opacity: 1; transform: scale(1); }
  }

  .chip-remove {
    width: 40px;
    height: 44px;
    margin: -2px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    color: var(--on-primary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .clear-btn {
    min-height: 40px;
    padding: 0 10px;
    border: none;
    background: none;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .pantry-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-secondary);
  }
  .pantry-hint :global(svg) { flex-shrink: 0; color: var(--success); }

  /* ── Suggestions ── */
  .section-title { font-size: 18px; }
  .section-sub {
    margin: 2px 0 12px;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .suggest-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .suggest-chips.center { justify-content: center; margin-top: 12px; }

  .suggest-chip {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px 0 11px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--bg-raised);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }
  .suggest-chip :global(svg) { color: var(--primary); }
  .suggest-chip:active { transform: scale(0.96); }

  /* ── Résultats ── */
  .results-count {
    margin-bottom: 10px;
    font-size: 14px;
    color: var(--text-secondary);
  }
  .results-count strong { color: var(--success); }

  .results {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  @media (min-width: 760px) {
    .results { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
  }

  .card {
    border-radius: var(--radius-xl);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    overflow: hidden;
    animation: fade-up 0.25s ease-out both;
  }
  .card.ready { border-color: color-mix(in srgb, var(--success) 45%, transparent); }

  .card-main {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 8px 6px 10px;
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
  }
  .card-main:active .card-title { color: var(--primary); }

  .thumb {
    flex-shrink: 0;
    width: 72px;
    height: 72px;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--primary) 14%, rgba(9, 24, 50, 0.6));
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .initial {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 36px;
    line-height: 1;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--primary) 75%, white);
  }

  .card-text { flex: 1; min-width: 0; }

  .card-title {
    font-size: 16px;
    font-weight: 700;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .status {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin-top: 5px;
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-secondary);
  }
  .status :global(svg) { flex-shrink: 0; margin-top: 1px; }
  .status.ok { color: var(--success); }
  .status.one { color: #FFC59E; } /* corail clair : lisible sur le bleu nuit */

  .chev { color: var(--text-secondary); flex-shrink: 0; }

  .card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px 8px 4px;
  }

  .detail-btn,
  .plan-btn {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
  }

  .detail-btn {
    padding: 0 8px;
    background: none;
    color: var(--text-secondary);
  }

  .rot { display: inline-flex; transition: transform 0.2s; }
  .rot.open { transform: rotate(180deg); }

  .plan-btn {
    padding: 0 14px;
    border-radius: 999px;
    background: var(--primary-light);
    color: var(--primary);
  }
  .plan-btn:active { transform: scale(0.96); }
  .plan-btn:disabled { opacity: 0.6; }

  .detail {
    margin: 0 12px 12px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.06);
    font-size: 14px;
    line-height: 1.45;
    color: var(--text);
    animation: fade-up 0.18s ease-out;
  }
  .detail p + p { margin-top: 6px; }

  .detail-label {
    display: inline-block;
    margin-right: 4px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .detail-label.have { color: var(--success); }
  .detail-label.miss { color: #FFC59E; }

  .more-wrap {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }
  .more-wrap .btn { min-height: 44px; touch-action: manipulation; }

  /* ── Squelettes ── */
  .skeleton {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    height: 92px;
  }
  .skeleton .thumb { background: rgba(255, 255, 255, 0.08); }
  .sk-body { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .sk-line {
    height: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    animation: sk-pulse 1.2s ease-in-out infinite;
  }
  .sk-short { width: 55%; }

  @keyframes sk-pulse {
    50% { opacity: 0.45; }
  }

  /* ── États ── */
  .state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 28px 18px;
    text-align: center;
    border-radius: var(--radius-xl);
    background: var(--bg-raised);
    border: 1px solid var(--border);
  }
  .state-icon { color: var(--text-secondary); margin-bottom: 4px; }
  .state-title { font-weight: 700; font-size: 16px; }
  .state-text { color: var(--text-secondary); font-size: 14px; }
  .state .btn { margin-top: 10px; min-height: 44px; }

  @media (hover: hover) and (pointer: fine) {
    .ac-item:hover { background: var(--primary-light); }
    .card-main:hover .card-title { color: var(--primary); }
    .suggest-chip:hover { border-color: var(--primary); }
    .plan-btn:hover { background: color-mix(in srgb, var(--primary) 24%, transparent); }
    .detail-btn:hover { color: var(--text); }
    .chip-remove:hover { opacity: 0.7; }
  }
</style>
