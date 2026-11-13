<script lang="ts">
  // Fenêtre de confirmation centrée, commune à toute l'appli
  // (terminer les courses, mettre à jour la liste, supprimer…).
  import type { Snippet } from 'svelte'
  import { onMount, onDestroy } from 'svelte'

  interface Props {
    title: string
    confirmLabel: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
    onconfirm: () => void
    oncancel: () => void
    children?: Snippet
  }
  let {
    title, confirmLabel, cancelLabel = 'Annuler', danger = false, busy = false,
    onconfirm, oncancel, children,
  }: Props = $props()

  let el: HTMLDivElement | undefined = $state()
  onMount(() => {
    document.body.style.overflow = 'hidden'
    el?.focus()
  })
  onDestroy(() => {
    document.body.style.overflow = ''
  })
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !busy) oncancel() }} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cd-overlay" onclick={() => { if (!busy) oncancel() }}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="cd"
    bind:this={el}
    tabindex="-1"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="cd-title"
    onclick={(e) => e.stopPropagation()}
  >
    <h2 id="cd-title">{title}</h2>
    {#if children}<div class="cd-body">{@render children()}</div>{/if}
    <div class="cd-actions">
      <button class="btn btn-outline" onclick={oncancel} disabled={busy}>{cancelLabel}</button>
      <button class="btn cd-confirm" class:danger onclick={onconfirm} disabled={busy}>
        {busy ? 'Un instant…' : confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .cd-overlay {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(2, 8, 22, 0.66);
    animation: fade 0.18s ease-out;
  }

  .cd {
    width: min(380px, 100%);
    padding: 22px 20px 18px;
    border-radius: 22px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    outline: none;
    animation: pop 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.15);
  }

  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(0.94) translateY(8px); } }

  h2 {
    font-size: 20px;
    color: var(--text);
  }

  .cd-body {
    margin-top: 8px;
    font-size: 15px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  .cd-actions {
    display: flex;
    gap: 8px;
    margin-top: 20px;
  }

  .cd-actions .btn {
    flex: 1;
    min-height: 48px;
    border-radius: 14px;
    font-size: 15px;
    white-space: nowrap;
  }

  .cd-confirm {
    background: var(--accent);
    color: #FFFFFF;
  }

  .cd-confirm.danger {
    background: var(--error);
  }

  .cd-confirm:disabled,
  .cd-actions .btn:disabled {
    opacity: 0.55;
  }
</style>
