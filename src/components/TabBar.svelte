<script lang="ts">
  import { router, href, TAB_ROUTES, type TabRoute } from '../lib/router.svelte'

  const tabs: { route: TabRoute; label: string; icon: string }[] = [
    { route: 'accueil',     label: 'Accueil',     icon: 'home' },
    { route: 'recettes',    label: 'Recettes',    icon: 'book' },
    { route: 'semaine',     label: 'Semaine',     icon: 'calendar' },
    { route: 'courses',     label: 'Courses',     icon: 'cart' },
    { route: 'historique',  label: 'Historique',   icon: 'clock' },
  ]

  /** Index de l'onglet actif (-1 sur Mon compte, la connexion…) : place la pastille */
  const activeIndex = $derived(tabs.findIndex((t) => isActive(t.route)))

  function isActive(route: TabRoute): boolean {
    if (route === 'accueil') {
      return router.current === 'accueil' || router.current === 'frigo' // sous-page de l'accueil
    }
    if (route === 'recettes') {
      return ['recettes', 'recette', 'nouvelle-recette', 'editer-recette'].includes(router.current)
    }
    return router.current === route
  }
</script>

<nav class="tab-bar" aria-label="Navigation principale" style:--count={tabs.length}>
  <!-- Pastille qui glisse sous l'onglet actif (une seule, déplacée par transform) -->
  <span
    class="indicator"
    class:hidden={activeIndex < 0}
    style:--i={Math.max(activeIndex, 0)}
    aria-hidden="true"
  ></span>
  {#each tabs as tab (tab.route)}
    <a
      href={href(tab.route)}
      class="tab"
      class:active={isActive(tab.route)}
      aria-current={isActive(tab.route) ? 'page' : undefined}
    >
      <svg class="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        {#if tab.icon === 'home'}
          <path d="M3 10.5 12 3l9 7.5"/>
          <path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9"/>
        {:else if tab.icon === 'book'}
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
    view-transition-name: tab-bar; /* reste immobile pendant les transitions de page */
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

  /* Pastille : une « case » de la largeur d'un onglet, déplacée de i cases.
     Le rond visible est dessiné au centre de la case (::before). */
  .indicator {
    position: absolute;
    top: 5px;
    left: 8px;
    width: calc((100% - 16px) / var(--count));
    height: 30px;
    transform: translateX(calc(var(--i) * 100%));
    transition: transform 0.38s cubic-bezier(0.3, 1.35, 0.5, 1), opacity 0.2s;
    pointer-events: none;
  }

  .indicator::before {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 56px;
    height: 100%;
    margin-left: -28px;
    border-radius: 999px;
    background: var(--primary-light);
  }

  .indicator.hidden { opacity: 0; }

  .tab {
    position: relative; /* au-dessus de la pastille */
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

  /* Petit rebond de l'icône quand l'onglet devient actif */
  .tab.active .tab-icon {
    animation: tab-pop 0.4s cubic-bezier(0.3, 1.6, 0.5, 1);
  }

  @keyframes tab-pop {
    0% { transform: scale(0.8); }
    60% { transform: scale(1.12); }
    100% { transform: scale(1); }
  }

  .tab:active .tab-icon { transform: scale(0.88); }

  .tab {
    touch-action: manipulation;
  }

  .tab-label {
    font-size: 11px;
    font-weight: 500;
  }

  .tab.active .tab-label {
    font-weight: 600;
  }
</style>
