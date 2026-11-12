<script lang="ts">
  import { router, href, TAB_ROUTES, type TabRoute } from '../lib/router.svelte'

  const tabs: { route: TabRoute; label: string; icon: string }[] = [
    { route: 'recettes',    label: 'Recettes',    icon: 'book' },
    { route: 'semaine',     label: 'Semaine',     icon: 'calendar' },
    { route: 'courses',     label: 'Courses',     icon: 'cart' },
    { route: 'historique',  label: 'Historique',   icon: 'clock' },
  ]

  function isActive(route: TabRoute): boolean {
    if (route === 'recettes') {
      return router.current === 'recettes' || router.current === 'recette'
    }
    return router.current === route
  }
</script>

<nav class="tab-bar" aria-label="Navigation principale">
  {#each tabs as tab (tab.route)}
    <a
      href={href(tab.route)}
      class="tab"
      class:active={isActive(tab.route)}
      aria-current={isActive(tab.route) ? 'page' : undefined}
    >
      <svg class="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if tab.icon === 'book'}
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        {:else if tab.icon === 'calendar'}
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
        {:else if tab.icon === 'cart'}
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        {:else if tab.icon === 'clock'}
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        {/if}
      </svg>
      <span class="tab-label">{tab.label}</span>
    </a>
  {/each}
</nav>

<style>
  .tab-bar {
    position: fixed;
    inset: auto 0 0 0;
    display: flex;
    height: 56px;
    padding: 0 8px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--bg-raised);
    border-top: 1px solid var(--border);
    z-index: 100;
  }

  .tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--text-secondary);
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
  }

  .tab.active {
    color: var(--primary);
  }

  .tab-label {
    font-size: 11px;
    font-weight: 500;
  }

  .tab.active .tab-label {
    font-weight: 600;
  }
</style>
