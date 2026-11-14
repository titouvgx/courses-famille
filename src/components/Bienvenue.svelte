<script lang="ts">
  // Bienvenue plein écran, à chaque ouverture de l'appli :
  //   « Découvrir l'appli » → aide (fermé pour cette fois)
  //   « Fermer »            → fermé pour cette fois, revient à la prochaine ouverture
  //   « Ne plus afficher »  → définitif sur ce téléphone
  import Icon from './Icon.svelte'
  import { navigate } from '../lib/router.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { welcome, markWelcomeSeen } from '../lib/bienvenue.svelte'

  let primary = $state<HTMLButtonElement | null>(null)
  $effect(() => {
    primary?.focus()
  })

  // Pas de défilement de la page derrière tant que l'écran est ouvert
  $effect(() => {
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = before
    }
  })

  function closeForNow() {
    welcome.closedThisLaunch = true
  }

  function discover() {
    closeForNow()
    navigate('aide')
  }

  function neverAgain() {
    const id = profileState.profile?.id
    if (id) markWelcomeSeen(id)
    else closeForNow()
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeForNow()
  }
</script>

<svelte:window {onkeydown} />

<div class="screen" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
  <div class="content">
    <div class="logo" aria-hidden="true"><Icon name="cart" size={34} /></div>
    <h1 id="welcome-title">Bienvenue sur Lichouz</h1>
    <p class="lead">Les repas et les courses de la maison, au même endroit et à jour pour tout le monde.</p>

    <ol class="steps">
      <li><span class="step-icon"><Icon name="book" size={20} /></span><span><strong>Choisis des recettes</strong> : les tiennes ou celles du catalogue.</span></li>
      <li><span class="step-icon"><Icon name="calendar" size={20} /></span><span><strong>Planifie la semaine</strong> : qui mange quoi, et qui cuisine.</span></li>
      <li><span class="step-icon"><Icon name="cart" size={20} /></span><span><strong>La liste de courses se fait toute seule</strong>, et chacun la voit cochée en direct.</span></li>
    </ol>

    <div class="actions">
      <button class="btn btn-primary" bind:this={primary} onclick={discover}>
        Découvrir l’appli <Icon name="arrow-right" size={18} />
      </button>
      <button class="btn btn-outline" onclick={closeForNow}>Fermer</button>
      <button class="never" onclick={neverAgain}>Ne plus afficher ce message</button>
    </div>
    <p class="hint">L’aide reste dans <strong>Mon compte</strong>.</p>
  </div>
</div>

<style>
  /* Plein écran, au-dessus de l'en-tête et de la barre d'onglets */
  .screen {
    position: fixed;
    inset: 0;
    z-index: 200;
    overflow-y: auto;
    overscroll-behavior: contain;
    background:
      radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%),
      #071531;
    display: flex;
    justify-content: center;
    padding: calc(24px + env(safe-area-inset-top, 0px)) 20px calc(24px + env(safe-area-inset-bottom, 0px));
    animation: fade 0.25s ease-out;
  }
  .content {
    width: 100%;
    max-width: 440px;
    margin: auto 0; /* centré verticalement s'il y a la place, sinon défile */
    display: grid;
    gap: 18px;
    animation: rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .logo {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    justify-self: center;
    color: #071531;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
  }
  h1 {
    font-family: var(--font-display);
    font-size: 30px;
    line-height: 1.15;
    text-align: center;
  }
  .lead {
    text-align: center;
    color: var(--text-secondary);
    font-size: 16px;
    line-height: 1.45;
  }
  .steps {
    list-style: none;
    margin: 4px 0 0;
    padding: 18px;
    display: grid;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
  }
  .steps li { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; line-height: 1.4; }
  .step-icon {
    width: 36px;
    height: 36px;
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--primary-light);
    color: var(--primary);
    flex-shrink: 0;
  }
  .actions { display: grid; gap: 10px; margin-top: 6px; }
  .actions .btn { min-height: 50px; width: 100%; justify-content: center; }
  .never {
    min-height: 44px;
    background: none;
    border: none;
    color: var(--text-secondary);
    font: inherit;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .never:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 8px; }
  .hint { text-align: center; font-size: 13px; color: var(--text-secondary); }

  @keyframes fade { from { opacity: 0; } }
  @keyframes rise { from { opacity: 0; transform: translateY(16px); } }
  @media (prefers-reduced-motion: reduce) {
    .screen, .content { animation: none; }
  }
</style>
