<script lang="ts">
  import { toast } from '../lib/toast.svelte'
</script>

{#if toast.items.length > 0}
  <div class="toast-container" aria-live="polite">
    {#each toast.items as t (t.id)}
      <div class="toast toast-{t.type}" role="status">
        <span class="toast-icon">
          {#if t.type === 'success'}✓{:else if t.type === 'error'}!{:else}ℹ{/if}
        </span>
        <span class="toast-msg">{t.message}</span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: calc(100% - 32px);
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    font-family: var(--font-body);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    animation: toast-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1);
    pointer-events: auto;
  }

  .toast-success {
    background: color-mix(in srgb, var(--success) 15%, var(--bg-raised));
    color: var(--success);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
  }

  .toast-error {
    background: color-mix(in srgb, var(--error) 15%, var(--bg-raised));
    color: var(--error);
    border: 1px solid color-mix(in srgb, var(--error) 25%, transparent);
  }

  .toast-info {
    background: color-mix(in srgb, var(--primary) 15%, var(--bg-raised));
    color: var(--primary);
    border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent);
  }

  .toast-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 800;
    flex-shrink: 0;
  }

  .toast-success .toast-icon {
    background: var(--success);
    color: white;
  }

  .toast-error .toast-icon {
    background: var(--error);
    color: white;
  }

  .toast-info .toast-icon {
    background: var(--primary);
    color: white;
  }

  .toast-msg {
    color: var(--text);
    flex: 1;
    min-width: 0;
  }

  @keyframes toast-in {
    0% {
      opacity: 0;
      transform: translateY(-12px) scale(0.95);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
