<script lang="ts">
  // #/mot-de-passe-oublie : demande d'e-mail de réinitialisation (sans être connecté).
  // Même message que le compte existe ou non (on ne révèle pas les adresses inscrites).
  import { onMount, tick } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import { href } from '../lib/router.svelte'
  import { VERSION_LABEL } from '../lib/version'
  import { requestPasswordReset } from '../lib/api/famille'

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const OFFLINE_MSG = 'Pas de connexion internet. Vérifie ton réseau, puis réessaie.'

  let email = $state('')
  let submitting = $state(false)
  let sent = $state(false)
  let fieldError = $state<string | null>(null)
  let apiError = $state<string | null>(null)

  let emailInput: HTMLInputElement | undefined = $state()
  let titleEl: HTMLHeadingElement | undefined = $state()

  onMount(() => {
    // Au clavier/souris seulement : sur téléphone, le clavier masquerait la page
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) emailInput?.focus()
  })

  function clearErrors() {
    fieldError = null
    apiError = null
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting) return
    apiError = null

    const mail = email.trim()
    if (!mail) {
      fieldError = 'Indique ton adresse e-mail.'
      emailInput?.focus()
      return
    }
    if (!EMAIL_RE.test(mail)) {
      fieldError = 'Cette adresse e-mail ne semble pas complète (ex. prenom@exemple.fr).'
      emailInput?.focus()
      return
    }
    if (!navigator.onLine) {
      apiError = OFFLINE_MSG
      return
    }

    fieldError = null
    submitting = true
    try {
      await requestPasswordReset(mail)
      sent = true
      await tick()
      titleEl?.focus()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      apiError = message.startsWith('Trop de demandes')
        ? message
        : 'La demande n’a pas abouti. Réessaie dans un instant.'
    }
    submitting = false
  }

  async function sendAnother() {
    sent = false
    await tick()
    emailInput?.focus()
  }
</script>

<main class="auth-page">
  <div class="auth-inner">
    <header class="brand">
      <div class="logo-circle" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      </div>
      <h1>Madéo</h1>
    </header>

    <section class="auth-card" aria-labelledby="forgot-title">
      {#if sent}
        <div class="status" role="status">
          <span class="status-icon"><Icon name="mail" size={28} /></span>
          <h2 id="forgot-title" tabindex="-1" bind:this={titleEl}>Regarde tes e-mails</h2>
          <p class="status-text">
            Si un compte existe avec cette adresse, tu vas recevoir un e-mail avec un lien
            (pense à regarder les indésirables).
          </p>
          <div class="actions">
            <a class="btn btn-primary btn-main" href={href('login')}>Retour à la connexion</a>
            <button type="button" class="text-link" onclick={sendAnother}>Rien reçu ? Refaire une demande</button>
          </div>
        </div>
      {:else}
        <h2 id="forgot-title">Mot de passe oublié</h2>
        <p class="lead">
          Indique l’adresse e-mail de ton compte : on t’envoie un lien pour choisir un nouveau mot de passe.
        </p>

        <form onsubmit={handleSubmit} novalidate>
          <div class="field">
            <label for="forgot-email" class="label-text">Adresse e-mail</label>
            <div class="input-wrap">
              <span class="input-icon"><Icon name="mail" size={18} /></span>
              <input
                bind:this={emailInput}
                id="forgot-email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                autocapitalize="off"
                spellcheck="false"
                class="input input-has-icon"
                class:error={fieldError != null}
                aria-invalid={fieldError != null}
                aria-describedby="forgot-email-msg"
                placeholder="prenom@exemple.fr"
                bind:value={email}
                oninput={clearErrors}
              />
            </div>
            <p id="forgot-email-msg" class="field-msg" aria-live="polite">{fieldError ?? ''}</p>
          </div>

          {#if apiError}
            <p class="error-msg" role="alert">{apiError}</p>
          {/if}

          <button type="submit" class="btn btn-primary btn-main" disabled={submitting} aria-busy={submitting}>
            {#if submitting}
              <span class="btn-spinner" aria-hidden="true"></span>
              Envoi…
            {:else}
              Recevoir le lien
            {/if}
          </button>
        </form>

        <div class="back">
          <a class="text-link" href={href('login')}>
            <Icon name="arrow-left" size={18} /> Retour à la connexion
          </a>
        </div>
      {/if}
    </section>

    <p class="app-version">{VERSION_LABEL}</p>
  </div>
</main>

<style>
  .auth-page {
    min-height: 100svh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding:
      calc(24px + env(safe-area-inset-top, 0px))
      calc(var(--gutter) + env(safe-area-inset-right, 0px))
      calc(24px + env(safe-area-inset-bottom, 0px))
      calc(var(--gutter) + env(safe-area-inset-left, 0px));
    animation: page-in 0.3s ease-out;
  }

  .auth-inner {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── En-tête (posé directement sur la photo), comme la connexion ── */
  .brand {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .logo-circle {
    width: 72px;
    height: 72px;
    border-radius: 22px;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    color: var(--on-primary);
    margin-bottom: 18px;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 30px;
    line-height: 1.1;
    color: var(--text);
    letter-spacing: -0.01em;
    text-shadow: 0 2px 14px rgba(0, 0, 0, 0.45);
  }

  /* ── Carte (pas de backdrop-filter : la photo derrière bouge) ── */
  .auth-card {
    background: rgba(9, 24, 50, 0.86);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    padding: 24px 20px 20px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.38);
  }

  h2 {
    font-family: var(--font-display);
    font-size: 20px;
    line-height: 1.25;
    color: var(--text);
    margin-bottom: 18px;
  }

  h2:focus { outline: none; }

  .lead {
    margin: -10px 0 18px;
    font-size: 15px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  .label-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .input-wrap { position: relative; }

  .input-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .input { min-height: 52px; }
  .input-has-icon { padding-left: 44px; }

  .field-msg {
    font-size: 13px;
    line-height: 1.4;
    color: #FF9A9D;
  }

  .field-msg:not(:empty) { margin-top: 6px; }

  .error-msg {
    font-size: 14px;
    line-height: 1.4;
    color: #FFD9DA;
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 55%, transparent);
    padding: 10px 14px;
    border-radius: var(--radius-md);
  }

  .btn-main {
    margin-top: 4px;
    min-height: 52px;
    font-size: 16px;
    touch-action: manipulation;
  }

  .btn-main:disabled { opacity: 0.85; cursor: progress; }

  .btn-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: #FFFFFF;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .back {
    margin-top: 12px;
    display: flex;
    justify-content: center;
  }

  .text-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .text-link:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* ── E-mail envoyé ── */
  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 8px 0 4px;
  }

  .status h2 { margin-bottom: 8px; }

  .status-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
    background: var(--primary-light);
    color: var(--primary);
  }

  .status-text {
    font-size: 15px;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  .actions {
    margin-top: 20px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  /* Version de l'appli (voir src/lib/version.ts) */
  .app-version {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) and (pointer: fine) {
    .text-link:hover { background: var(--surface); }
  }

  @media (max-height: 640px) {
    .auth-inner { gap: 16px; }
    .logo-circle { width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px; }
    h1 { font-size: 26px; }
  }
</style>
