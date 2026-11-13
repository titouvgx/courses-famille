<script lang="ts">
  // « Qui cuisine ? » : petite fenêtre centrée pour choisir le cuisinier d'un repas
  // parmi les membres du foyer (ou personne).
  import Icon from './Icon.svelte'
  import { onMount, onDestroy } from 'svelte'
  import type { FamilyMember } from '../lib/types'

  interface Props {
    /** Membres du foyer (déjà triés) */
    members: FamilyMember[]
    /** Cuisinier actuel (null = personne) */
    currentId: string | null
    /** Mon identifiant, pour afficher « moi » */
    meId?: string | null
    /** Sous-titre : jour, repas, recette */
    subtitle: string
    /** Membres en cours de chargement */
    loading?: boolean
    onselect: (cookId: string | null) => void
    onclose: () => void
  }
  let { members, currentId, meId = null, subtitle, loading = false, onselect, onclose }: Props = $props()

  let dialogEl: HTMLDivElement | undefined = $state()
  // Élément qui avait le focus avant l'ouverture (la pastille) : on le lui rend à la fermeture
  let opener: HTMLElement | null = null

  onMount(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    // Focus sur le choix actuel, sinon sur la fenêtre
    const current = dialogEl?.querySelector<HTMLElement>('[aria-pressed="true"]')
    ;(current ?? dialogEl)?.focus()
  })
  onDestroy(() => {
    document.body.style.overflow = ''
    if (opener?.isConnected) opener.focus()
  })

  function initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?'
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onclose()
      return
    }
    // Garde le focus dans la fenêtre (Tab / Maj+Tab)
    if (e.key === 'Tab' && dialogEl) {
      const items = [...dialogEl.querySelectorAll<HTMLElement>('button:not([disabled])')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialogEl)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onclose}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="cp"
    bind:this={dialogEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cp-title"
    aria-describedby="cp-sub"
    onclick={(e) => e.stopPropagation()}
  >
    <div class="cp-head">
      <span class="cp-head-icon" aria-hidden="true"><Icon name="chef" size={20} /></span>
      <div class="cp-head-text">
        <h2 id="cp-title">Qui cuisine ?</h2>
        <p id="cp-sub" class="cp-sub">{subtitle}</p>
      </div>
      <button class="cp-close" onclick={onclose} aria-label="Fermer">
        <Icon name="x" size={18} strokeWidth={2.5} />
      </button>
    </div>

    <div class="cp-list">
      {#if loading && members.length === 0}
        <div class="cp-loading"><div class="cp-spinner"></div></div>
      {:else}
        {#each members as m (m.id)}
          {@const selected = m.id === currentId}
          <button class="cp-item" class:selected aria-pressed={selected} onclick={() => onselect(m.id)}>
            <span class="cp-avatar" aria-hidden="true">{initial(m.display_name)}</span>
            <span class="cp-name">
              {m.display_name}
              {#if m.id === meId}<span class="cp-me">(moi)</span>{/if}
            </span>
            {#if selected}<span class="cp-check" aria-hidden="true"><Icon name="check" size={18} strokeWidth={2.5} /></span>{/if}
          </button>
        {/each}
        {#if members.length === 0}
          <p class="cp-empty">Aucun membre trouvé dans le foyer.</p>
        {/if}
      {/if}

      <button class="cp-item cp-nobody" class:selected={currentId === null} aria-pressed={currentId === null} onclick={() => onselect(null)}>
        <span class="cp-avatar cp-avatar-empty" aria-hidden="true"><Icon name="chef" size={16} /></span>
        <span class="cp-name">Personne</span>
        {#if currentId === null}<span class="cp-check" aria-hidden="true"><Icon name="check" size={18} strokeWidth={2.5} /></span>{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(2, 8, 22, 0.66);
    animation: cp-fade 0.18s ease-out;
  }

  .cp {
    width: min(360px, 100%);
    max-height: calc(100svh - 40px);
    overflow-y: auto;
    padding: 16px 14px 14px;
    border-radius: 22px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    outline: none;
    animation: cp-pop 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.15);
  }

  @keyframes cp-fade { from { opacity: 0; } }
  @keyframes cp-pop { from { opacity: 0; transform: scale(0.94) translateY(8px); } }

  .cp-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 2px 12px 4px;
  }

  .cp-head-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--primary-light);
    color: var(--primary);
    flex-shrink: 0;
  }

  .cp-head-text {
    flex: 1;
    min-width: 0;
  }

  h2 {
    font-size: 19px;
    color: var(--text);
    line-height: 1.2;
  }

  .cp-sub {
    margin-top: 2px;
    font-size: 13px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cp-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: -6px -4px -6px 0;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    touch-action: manipulation;
    flex-shrink: 0;
  }

  .cp-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cp-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 54px;
    padding: 8px 12px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 16px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
    transition: background 0.15s, border-color 0.15s, transform 0.12s;
  }

  .cp-item:active {
    transform: scale(0.98);
  }

  .cp-item.selected {
    border-color: var(--primary);
    background: var(--primary-light);
  }

  .cp-nobody {
    margin-top: 4px;
    color: var(--text-secondary);
  }

  .cp-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
    color: var(--on-primary);
    font-size: 15px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .cp-avatar-empty {
    background: transparent;
    border: 1.5px dashed var(--border-strong);
    color: var(--text-secondary);
  }

  .cp-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cp-me {
    margin-left: 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .cp-check {
    display: flex;
    color: var(--primary);
    flex-shrink: 0;
  }

  .cp-empty {
    padding: 8px 4px;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .cp-loading {
    display: flex;
    justify-content: center;
    padding: 16px;
  }

  .cp-spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: cp-spin 0.7s linear infinite;
  }

  @keyframes cp-spin { to { transform: rotate(360deg); } }

  .cp-item:focus-visible,
  .cp-close:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .cp-item:hover { border-color: var(--primary); }
    .cp-close:hover { background: var(--surface); color: var(--text); }
  }
</style>
