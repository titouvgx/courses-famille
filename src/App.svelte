<script lang="ts">
  import { router, href, type Route } from './lib/router.svelte'
  import { supabaseConfigured } from './lib/supabase'

  const tabs: { route: Route; label: string }[] = [
    { route: 'recettes', label: 'Recettes' },
    { route: 'semaine', label: 'Semaine' },
    { route: 'courses', label: 'Courses' },
    { route: 'plus', label: 'Plus' },
  ]

  const titles: Record<Route, string> = {
    recettes: 'Recettes',
    semaine: 'Cette semaine',
    courses: 'Courses',
    plus: 'Plus',
    introuvable: 'Page introuvable',
  }
</script>

<main>
  <header>
    <p class="kicker">Courses en famille</p>
    <h1>{titles[router.current]}</h1>
  </header>

  {#if router.current === 'introuvable'}
    <p class="muted">Cette adresse n'existe pas. <a href={href('semaine')}>Retour à la semaine</a>.</p>
  {:else}
    <!-- Étape 0 : simple vérification que tout est branché. Remplacé dès l'étape 3. -->
    <section class="check">
      <h2>Étape 0</h2>
      <ul>
        <li>Déploiement GitHub Pages : <strong>OK</strong> (tu lis cette page)</li>
        <li>
          Configuration Supabase :
          {#if supabaseConfigured}
            <strong>OK</strong>
          {:else}
            <strong class="warn">manquante</strong> — voir le README
          {/if}
        </li>
        <li>Navigation : <strong>OK</strong> si les onglets changent le titre</li>
      </ul>
    </section>
  {/if}
</main>

<nav aria-label="Navigation principale">
  {#each tabs as tab (tab.route)}
    <a href={href(tab.route)} aria-current={router.current === tab.route ? 'page' : undefined}>
      {tab.label}
    </a>
  {/each}
</nav>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    /* place pour la barre d'onglets + la zone du geste iPhone */
    padding: calc(24px + env(safe-area-inset-top)) 16px calc(96px + env(safe-area-inset-bottom));
  }
  header { margin-bottom: 24px; }
  .kicker {
    margin: 0 0 4px;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  h1 { font-size: 34px; }
  h2 { font-size: 20px; margin-bottom: 8px; }
  .muted { color: var(--ink-soft); }
  .check {
    border-top: 1px solid var(--ink);
    border-bottom: 1px dashed var(--rule);
    padding: 16px 0;
  }
  .check ul { margin: 0; padding-left: 18px; }
  .check li { margin: 6px 0; }
  .warn { color: var(--accent); }

  nav {
    position: fixed;
    inset: auto 0 0 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--paper-raised);
    border-top: 1px solid var(--rule);
  }
  nav a {
    min-height: var(--tap);
    display: grid;
    place-items: center;
    font-size: 14px;
    text-decoration: none;
    color: var(--ink-soft);
  }
  nav a[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
    box-shadow: inset 0 2px 0 var(--accent);
  }
</style>
