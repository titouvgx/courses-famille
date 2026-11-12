<script lang="ts">
  import { router, navigate } from './lib/router.svelte'
  import { auth, initAuth, signOut } from './lib/auth.svelte'
  import { profileState, loadProfile, clearProfile } from './lib/profile.svelte'
  import { supabaseConfigured } from './lib/supabase'

  import TabBar from './components/TabBar.svelte'
  import AppHeader from './components/AppHeader.svelte'
  import ToastContainer from './components/ToastContainer.svelte'
  import Login from './pages/Login.svelte'
  import Recettes from './pages/Recettes.svelte'
  import RecetteDetail from './pages/RecetteDetail.svelte'
  import RecetteForm from './pages/RecetteForm.svelte'
  import Semaine from './pages/Semaine.svelte'
  import Courses from './pages/Courses.svelte'
  import Historique from './pages/Historique.svelte'
  import MonCompte from './pages/MonCompte.svelte'

  // Initialiser l'auth au montage
  initAuth()

  // Charger le profil quand l'user change
  $effect(() => {
    if (auth.user) {
      loadProfile(auth.user.id)
    } else {
      clearProfile()
    }
  })

  // Redirection : si pas connecté → login, si connecté et sur login → recettes
  $effect(() => {
    if (auth.loading) return

    if (!auth.user && router.current !== 'login') {
      navigate('login')
    } else if (auth.user && router.current === 'login') {
      navigate('recettes')
    }
  })

  function handleSignOut() {
    clearProfile()
    signOut()
  }
</script>

<ToastContainer />

{#if auth.loading}
  <div class="loading">
    <div class="spinner"></div>
  </div>
{:else if !auth.user}
  <!-- Non connecté : page de login -->
  <Login />
{:else}
  <!-- Connecté : app shell -->
  <AppHeader />
  <div class="app-shell">
    {#if router.current === 'recettes'}
      <Recettes />
    {:else if router.current === 'recette'}
      <RecetteDetail />
    {:else if router.current === 'nouvelle-recette'}
      <RecetteForm />
    {:else if router.current === 'editer-recette'}
      <RecetteForm editId={router.recipeId} />
    {:else if router.current === 'semaine'}
      <Semaine />
    {:else if router.current === 'courses'}
      <Courses />
    {:else if router.current === 'historique'}
      <Historique />
    {:else if router.current === 'compte'}
      <MonCompte />
    {:else}
      <div class="page-404">
        <h1>Page introuvable</h1>
        <p>Cette adresse n'existe pas.</p>
        <a href="#/recettes" class="btn btn-outline">Retour aux recettes</a>
      </div>
    {/if}
  </div>

  <TabBar />
{/if}

<style>
  .loading {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .app-shell {
    min-height: 100dvh;
    /* Place pour la tab bar + safe area bottom */
    padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  }

  .page-404 {
    padding: var(--gutter);
    padding-top: calc(60px + env(safe-area-inset-top, 0px));
    text-align: center;
  }

  .page-404 p {
    color: var(--text-secondary);
    margin: 8px 0 24px;
  }
</style>
