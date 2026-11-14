<script lang="ts">
  import { onMount, tick } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import { auth, signIn } from '../lib/auth.svelte'
  import { href } from '../lib/router.svelte'
  import { VERSION_LABEL } from '../lib/version'

  let email = $state('')
  let password = $state('')
  let showPassword = $state(false)
  let submitting = $state(false)

  /** Erreur de saisie détectée avant l'envoi (champ vide, adresse mal écrite). */
  let formError = $state<{ field: 'email' | 'password' | null; message: string } | null>(null)
  /** Erreur réseau détectée ici (sans appeler Supabase). */
  let offlineError = $state(false)

  let emailInput: HTMLInputElement | undefined = $state()
  let passwordInput: HTMLInputElement | undefined = $state()

  /** Traduit les messages renvoyés par Supabase Auth en français clair. */
  function translate(raw: string | null): string | null {
    if (!raw) return null
    const m = raw.toLowerCase()
    // Déjà traduit dans auth.svelte.ts
    if (raw === 'Email ou mot de passe incorrect.' || m.includes('invalid login credentials'))
      return 'E-mail ou mot de passe incorrect.'
    if (m.includes('email not confirmed'))
      return "Ton adresse e-mail n'est pas encore confirmée. Ouvre le lien reçu par e-mail, puis réessaie."
    if (m.includes('rate limit') || m.includes('too many') || m.includes('429'))
      return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.'
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed') || m.includes('fetch'))
      return 'Pas de connexion internet. Vérifie ton réseau, puis réessaie.'
    if (m.includes('non configuré'))
      return "L'appli n'est pas reliée à son serveur (configuration manquante)."
    if (m.includes('user banned') || m.includes('banned'))
      return 'Ce compte est suspendu. Contacte l’administrateur.'
    return "La connexion n'a pas abouti. Réessaie dans un instant."
  }

  const errorMessage = $derived(
    formError?.message
      ?? (offlineError ? 'Pas de connexion internet. Vérifie ton réseau, puis réessaie.' : null)
      ?? translate(auth.error),
  )
  // Sur quel(s) champ(s) mettre le contour rouge
  const emailInvalid = $derived(formError ? formError.field === 'email' : auth.error != null)
  const passwordInvalid = $derived(formError ? formError.field === 'password' : auth.error != null)

  onMount(() => {
    // Premier champ au clavier/souris. Sur téléphone on évite d'ouvrir le
    // clavier d'office : il masquerait l'écran d'accueil.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) emailInput?.focus()
  })

  function clearErrors() {
    formError = null
    offlineError = false
    if (auth.error) auth.error = null
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting) return

    const mail = email.trim()
    if (!mail) {
      formError = { field: 'email', message: 'Indique ton adresse e-mail.' }
      emailInput?.focus()
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      formError = { field: 'email', message: 'Cette adresse e-mail ne semble pas complète (ex. prenom@exemple.fr).' }
      emailInput?.focus()
      return
    }
    if (!password) {
      formError = { field: 'password', message: 'Indique ton mot de passe.' }
      passwordInput?.focus()
      return
    }
    if (!navigator.onLine) {
      offlineError = true
      return
    }

    formError = null
    offlineError = false
    submitting = true
    try {
      await signIn(mail, password)
    } catch {
      auth.error = 'Failed to fetch'
    }
    submitting = false
    if (auth.error) {
      await tick()
      passwordInput?.focus()
      passwordInput?.select()
    }
  }
</script>

<main class="login-page">
  <div class="login-inner">
    <header class="brand">
      <div class="logo-circle" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      </div>
      <h1>Madéo</h1>
      <p class="tagline">Les recettes, la semaine et la liste de courses, partagées à la maison.</p>
    </header>

    <section class="login-card" aria-labelledby="login-title">
      <h2 id="login-title">Connexion</h2>

      <form onsubmit={handleSubmit} novalidate>
        <div class="field">
          <label for="login-email" class="label-text">Adresse e-mail</label>
          <div class="input-wrap">
            <span class="input-icon"><Icon name="mail" size={18} /></span>
            <input
              bind:this={emailInput}
              id="login-email"
              name="email"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              class="input input-has-icon"
              class:error={emailInvalid}
              aria-invalid={emailInvalid}
              aria-describedby={errorMessage ? 'login-error' : undefined}
              placeholder="prenom@exemple.fr"
              bind:value={email}
              oninput={clearErrors}
            />
          </div>
        </div>

        <div class="field">
          <label for="login-password" class="label-text">Mot de passe</label>
          <div class="input-wrap">
            <span class="input-icon"><Icon name="lock" size={18} /></span>
            <input
              bind:this={passwordInput}
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autocomplete="current-password"
              autocapitalize="off"
              spellcheck="false"
              class="input input-has-icon input-has-toggle"
              class:error={passwordInvalid}
              aria-invalid={passwordInvalid}
              aria-describedby={errorMessage ? 'login-error' : undefined}
              placeholder="Ton mot de passe"
              bind:value={password}
              oninput={clearErrors}
            />
            <button
              type="button"
              class="eye-btn"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={showPassword}
              aria-controls="login-password"
              onclick={() => (showPassword = !showPassword)}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
            </button>
          </div>
        </div>

        {#if errorMessage}
          <p id="login-error" class="error-msg" role="alert">{errorMessage}</p>
        {/if}

        <button type="submit" class="btn btn-primary btn-login" aria-busy={submitting}>
          {#if submitting}
            <span class="btn-spinner" aria-hidden="true"></span>
            Connexion…
          {:else}
            Se connecter
          {/if}
        </button>
      </form>

      <div class="forgot">
        <a class="forgot-link" href={href('mot-de-passe-oublie')}>Mot de passe oublié ?</a>
      </div>

      <p class="hint">
        Pas encore de compte ? Demande un lien d’invitation à l’admin de ta famille.
      </p>
    </section>

    <p class="app-version">{VERSION_LABEL}</p>
  </div>
</main>

<style>
  .login-page {
    min-height: 100svh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(24px + env(safe-area-inset-top, 0px)) var(--gutter) calc(24px + env(safe-area-inset-bottom, 0px));
    animation: page-in 0.3s ease-out;
  }

  .login-inner {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── Accueil (posé directement sur la photo) ── */
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

  .tagline {
    margin-top: 8px;
    max-width: 300px;
    color: var(--text);
    opacity: 0.88;
    font-size: 15px;
    line-height: 1.45;
    text-shadow: 0 1px 10px rgba(0, 0, 0, 0.5);
  }

  /* ── Carte formulaire ── */
  .login-card {
    /* Pas de backdrop-filter : la photo derrière bouge, le flou serait recalculé
       à chaque image. Un fond presque opaque suffit à rester lisible. */
    background: rgba(9, 24, 50, 0.86);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    padding: 24px 20px 20px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.38);
  }

  h2 {
    font-family: var(--font-display);
    font-size: 20px;
    color: var(--text);
    margin-bottom: 18px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .input-wrap {
    position: relative;
  }

  .input-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .input {
    min-height: 52px;
  }

  .input-has-icon {
    padding-left: 44px;
  }

  .input-has-toggle {
    padding-right: 52px;
  }

  .eye-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .eye-btn[aria-pressed='true'] {
    color: var(--primary);
  }

  .eye-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .eye-btn:hover {
      color: var(--text);
      background: var(--surface);
    }
  }

  .error-msg {
    font-size: 14px;
    line-height: 1.4;
    color: #FFD9DA;
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 55%, transparent);
    padding: 10px 14px;
    border-radius: var(--radius-md);
  }

  .btn-login {
    margin-top: 4px;
    min-height: 52px;
    font-size: 16px;
    touch-action: manipulation;
  }

  .btn-login[aria-busy='true'] {
    cursor: progress;
    opacity: 0.85;
  }

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

  /* Version de l'appli (voir src/lib/version.ts) */
  .app-version {
    margin: 0;
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }

  /* Lien discret sous le bouton (zone de tap 44 px) */
  .forgot {
    margin-top: 6px;
    display: flex;
    justify-content: center;
  }

  .forgot-link {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    touch-action: manipulation;
  }

  .forgot-link:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .forgot-link:hover {
      color: var(--primary);
      text-decoration: underline;
    }
  }

  .hint {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-secondary);
    text-align: center;
  }

  @media (max-height: 640px) {
    .login-inner { gap: 16px; }
    .logo-circle { width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px; }
    h1 { font-size: 26px; }
  }
</style>
