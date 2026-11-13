<script module lang="ts">
  import type { KnownIngredient } from '../lib/api/recipes'
  // Ingrédients connus (autocomplétion), gardés entre deux ouvertures de la fenêtre
  let knownCache: KnownIngredient[] | null = null
</script>

<script lang="ts">
  // Fenêtre « Mon placard » : produits toujours à la maison (sel, huile…).
  // Les articles de la liste qui y correspondent sont rangés dans
  // « Sûrement déjà à la maison » au lieu des rayons.
  import { onMount, onDestroy, untrack } from 'svelte'
  import Icon from './Icon.svelte'
  import { toast } from '../lib/toast.svelte'
  import { fetchKnownIngredients } from '../lib/api/recipes'
  import { addPantryItem, removePantryItem, isInPantry } from '../lib/api/household'
  import { ingredientKey, normalizeText } from '../lib/quantities'
  import type { PantryItem, ShoppingCategory, ShoppingListItem } from '../lib/types'

  interface Props {
    familyId: string
    pantry: PantryItem[]
    categories: ShoppingCategory[]
    listItems: ShoppingListItem[]
    onchange: (pantry: PantryItem[]) => void
    onclose: () => void
  }
  let { familyId, pantry, categories, listItems, onchange, onclose }: Props = $props()

  const STARTERS = ['Sel', 'Poivre', 'Huile d’olive', 'Sucre', 'Farine', 'Pâtes', 'Riz', 'Vinaigre', 'Moutarde', 'Ail']

  // ── État ──
  let list = $state<PantryItem[]>(untrack(() => [...pantry]))
  let saving = $state(false)
  let dialogEl: HTMLDivElement | undefined = $state()
  let newName = $state('')
  let nameEl: HTMLInputElement | undefined = $state()

  let known = $state<KnownIngredient[]>(knownCache ?? [])
  let acResults = $state<KnownIngredient[]>([])
  let acIndex = $state(-1)

  onMount(() => {
    document.body.style.overflow = 'hidden'
    dialogEl?.focus()
    if (!knownCache) {
      fetchKnownIngredients(familyId)
        .then((data) => { knownCache = data; known = data })
        .catch(() => { /* silencieux : pas d'autocomplétion */ })
    }
  })
  onDestroy(() => { document.body.style.overflow = '' })

  // ── Dérivés ──
  const sorted = $derived([...list].sort((a, b) => a.name.localeCompare(b.name, 'fr')))

  /** Articles de la liste (issus du planning, pas encore pris) qu'on pourrait ranger au placard */
  const fromList = $derived.by(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const i of [...listItems].sort((a, b) => a.position - b.position)) {
      if (i.is_extra || i.checked) continue
      const k = ingredientKey(i.name)
      if (seen.has(k) || isInPantry(i.name, list)) continue
      seen.add(k)
      out.push(i.name)
    }
    return out
  })

  const starters = $derived(list.length === 0 ? STARTERS.filter((s) => !isInPantry(s, list)) : [])

  function cat(id: string | null): ShoppingCategory | undefined {
    return id ? categories.find((c) => c.id === id) : undefined
  }

  // ── Autocomplétion (même logique que le formulaire de recette) ──
  function onNameInput() {
    const query = normalizeText(newName)
    acIndex = -1
    if (!query) { acResults = []; return }
    const starts: KnownIngredient[] = []
    const contains: KnownIngredient[] = []
    for (const ki of known) {
      const n = normalizeText(ki.name)
      if (n === query) continue
      if (n.startsWith(query)) starts.push(ki)
      else if (n.includes(query)) contains.push(ki)
    }
    acResults = [...starts, ...contains].slice(0, 5)
  }

  function onNameKey(e: KeyboardEvent) {
    if (acResults.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const n = acResults.length
      acIndex = e.key === 'ArrowDown' ? (acIndex + 1) % n : (acIndex - 1 + n) % n
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (acIndex >= 0 && acResults[acIndex]) add(acResults[acIndex].name, true)
      else add(newName, true)
    } else if (e.key === 'Escape' && acResults.length > 0) {
      e.stopPropagation()
      acResults = []
    }
  }

  // ── Actions ──
  async function add(raw: string, fromInput = false) {
    const name = raw.trim()
    if (!name || saving) return
    if (list.some((p) => ingredientKey(p.name) === ingredientKey(name))) {
      toast.info(`${name} est déjà dans ton placard`)
      return
    }
    saving = true
    try {
      const item = await addPantryItem(familyId, name)
      if (item) {
        list = [...list, item]
        onchange(list)
      } else {
        toast.info(`${name} est déjà dans ton placard`)
      }
      if (fromInput) {
        newName = ''
        acResults = []
        acIndex = -1
        nameEl?.focus()
      }
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      saving = false
    }
  }

  async function remove(p: PantryItem) {
    const before = list
    list = list.filter((x) => x.id !== p.id)
    onchange(list)
    try {
      await removePantryItem(p.id)
    } catch (e: any) {
      list = before
      onchange(list)
      toast.error(e.message)
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && !saving) onclose()
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="hd-overlay" onclick={() => { if (!saving) onclose() }}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="hd"
    bind:this={dialogEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="pd-title"
    onclick={(e) => e.stopPropagation()}
  >
    <header class="hd-header">
      <div class="hd-titles">
        <h2 id="pd-title">Mon placard</h2>
        <p class="hd-sub">Ce qu’on a presque toujours à la maison. Ces produits sont mis à part dans la liste.</p>
      </div>
      <button class="hd-close" onclick={onclose} aria-label="Fermer">
        <Icon name="x" size={18} strokeWidth={2.5} />
      </button>
    </header>

    <div class="hd-scroll">
      <div class="add-box">
        <div class="add-line">
          <input
            class="input"
            placeholder="Ajouter (ex : sel, huile…)"
            aria-label="Produit à ajouter au placard"
            autocomplete="off"
            enterkeyhint="done"
            bind:this={nameEl}
            bind:value={newName}
            oninput={onNameInput}
            onkeydown={onNameKey}
            role="combobox"
            aria-expanded={acResults.length > 0}
            aria-controls="pd-ac"
            aria-activedescendant={acIndex >= 0 ? `pd-ac-${acIndex}` : undefined}
          />
          <button class="add-submit" onclick={() => add(newName, true)} disabled={!newName.trim() || saving} aria-label="Ajouter au placard">
            <Icon name="plus" size={20} strokeWidth={2.5} />
          </button>
        </div>
        {#if acResults.length > 0}
          <ul class="ac" id="pd-ac" role="listbox" aria-label="Suggestions">
            {#each acResults as ki, k (ki.name)}
              {@const c = cat(ki.shopping_category_id)}
              <!-- Clavier géré par le champ (flèches + Entrée) -->
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <li
                id="pd-ac-{k}"
                role="option"
                aria-selected={k === acIndex}
                class="ac-item"
                class:active={k === acIndex}
                onpointerdown={(e) => e.preventDefault()}
                onclick={() => add(ki.name, true)}
              >
                <span class="ac-emoji" aria-hidden="true">{c?.icon ?? '🛒'}</span>
                <span class="ac-name">{ki.name}</span>
                {#if isInPantry(ki.name, list)}<span class="ac-cat">déjà au placard</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <h3 class="hd-section">
        Au placard
        {#if list.length > 0}<span class="count">{list.length}</span>{/if}
      </h3>
      {#if sorted.length === 0}
        <p class="hd-hint">Rien pour l’instant. Ajoute le sel, l’huile, les épices… : ils ne t’encombreront plus dans les rayons.</p>
      {:else}
        <ul class="pantry">
          {#each sorted as p (p.id)}
            <li class="p-chip">
              <span class="p-name">{p.name}</span>
              <button class="p-remove" onclick={() => remove(p)} aria-label="Retirer {p.name} du placard">
                <Icon name="x" size={15} strokeWidth={2.5} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if fromList.length > 0}
        <h3 class="hd-section">Dans ta liste actuelle</h3>
        <p class="hd-hint">Un appui pour dire « on en a toujours ».</p>
        <div class="chips">
          {#each fromList as name (name)}
            <button class="chip" onclick={() => add(name)} disabled={saving}>
              <Icon name="plus" size={14} strokeWidth={2.5} /> {name}
            </button>
          {/each}
        </div>
      {/if}

      {#if starters.length > 0}
        <h3 class="hd-section">Pour commencer</h3>
        <div class="chips">
          {#each starters as name (name)}
            <button class="chip" onclick={() => add(name)} disabled={saving}>
              <Icon name="plus" size={14} strokeWidth={2.5} /> {name}
            </button>
          {/each}
        </div>
      {/if}

    </div>

    <div class="hd-actions">
      <button class="btn btn-outline done-btn" onclick={onclose}><Icon name="check" /> Terminé</button>
    </div>
  </div>
</div>

<style>
  .hd-overlay {
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

  .hd {
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
  @keyframes pop { from { opacity: 0; transform: scale(0.92) translateY(12px); } }

  .hd-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 18px 12px;
  }

  .hd-titles { min-width: 0; }
  .hd-header h2 { font-size: 21px; color: var(--text); }
  .hd-sub { margin-top: 4px; font-size: 14px; line-height: 1.4; color: var(--text-secondary); }

  .hd-close {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    margin: -6px -6px 0 0;
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

  .hd-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 18px 14px;
  }

  .add-box { display: flex; flex-direction: column; gap: 8px; }
  .add-line { display: flex; gap: 8px; }
  .add-line .input { flex: 1; min-width: 0; }

  .add-submit {
    flex-shrink: 0;
    width: 52px;
    border-radius: 12px;
    border: none;
    background: var(--primary);
    color: var(--on-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }

  .add-submit:disabled { opacity: 0.4; cursor: default; }

  .ac {
    list-style: none;
    margin: 0;
    padding: 4px;
    border-radius: 12px;
    border: 1px solid var(--border-strong);
    background: rgba(255, 255, 255, 0.06);
  }

  .ac-item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 9px;
    cursor: pointer;
    touch-action: manipulation;
    color: var(--text);
  }

  .ac-item.active, .ac-item:active { background: var(--primary-light); }
  .ac-emoji { font-size: 17px; }
  .ac-name { flex: 1; min-width: 0; font-weight: 600; }
  .ac-cat { font-size: 12px; color: var(--text-secondary); white-space: nowrap; }

  .hd-section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 18px 0 8px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .count {
    padding: 1px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 12px;
    letter-spacing: 0;
    color: var(--text);
  }

  .hd-hint {
    margin: -2px 0 10px;
    font-size: 14px;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px dashed var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .chip :global(svg) { color: var(--primary); }
  .chip:active { background: var(--primary-light); border-color: var(--primary); }
  .chip:disabled { opacity: 0.5; }

  /* Placard : puces pleines avec une croix */
  .pantry {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .p-chip {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding-left: 14px;
    border-radius: 999px;
    background: var(--primary-light);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
    animation: chip-in 0.2s ease-out;
  }

  @keyframes chip-in { from { opacity: 0; transform: scale(0.9); } }

  .p-name { font-size: 14px; font-weight: 600; color: var(--text); }

  .p-remove {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }

  .p-remove:active { color: var(--error); }

  .hd-actions {
    padding: 12px 18px 16px;
    border-top: 1px solid var(--border);
  }

  .done-btn { width: 100%; min-height: 50px; color: var(--text); }

  @media (hover: hover) and (pointer: fine) {
    .ac-item:hover { background: rgba(255, 255, 255, 0.06); }
    .chip:hover { border-color: var(--primary); }
    .p-remove:hover { color: var(--error); }
  }
</style>
