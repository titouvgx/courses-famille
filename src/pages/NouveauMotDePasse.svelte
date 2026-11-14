<script lang="ts">
  // #/nouveau-mot-de-passe : arrivée depuis l'e-mail « mot de passe oublié ».
  // L'adresse est …/?token_hash=…&type=recovery#/nouveau-mot-de-passe : on valide
  // le jeton (ce qui ouvre une session), puis on le retire aussitôt de l'adresse
  // pour qu'il ne reste ni dans l'historique ni dans un partage.
  import { onDestroy, onMount, tick } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import { auth } from '../lib/auth.svelte'
  import { navigate, href } from '../lib/router.svelte'
  import { VERSION_LABEL } from '../lib/version'
  import { setNewPassword, verifyRecoveryLink } from '../lib/api/famille'

  const PW_MIN = 10
  const PW_MAX_BYTES = 72 // limite de Supabase Auth (bcrypt)
  const OFFLINE_MSG = 'Pas de connexion internet. Vérifie ton réseau, puis réessaie.'

  // ── Lien reçu par e-mail ──
  const initialHash = new URLSearchParams(window.location.search).get('token_hash')
  /** Jeton gardé en mémoire seulement (pour « Réessayer » sans réseau), jamais affiché. */
  let pendingHash: string | null = initialHash
  let verifying = $state(initialHash != null) // dès le 1er affichage : pas d'éclair « Lien invalide »
  let verified = $state(false)
  let linkError = $state<{ message: string; canRetry: boolean } | null>(null)

  function cleanUrl() {
    history.replaceState(history.state, '', `${window.location.pathname}${href('nouveau-mot-de-passe')}`)
  }

  async function runVerify(clean = false) {
    if (!pendingHash) return
    linkError = null
    if (!navigator.onLine) {
      if (clean) cleanUrl()
      verifying = false
      linkError = { message: OFFLINE_MSG, canRetry: true }
      return
    }
    verifying = true
    const pending = verifyRecoveryLink(pendingHash)
    if (clean) cleanUrl() // tout de suite, sans attendre la réponse
    try {
      await pending
      pendingHash = null
      verified = true
    } catch (err) {
      if (!navigator.onLine) {
        linkError = { message: OFFLINE_MSG, canRetry: true }
      } else {
        pendingHash = null
        linkError = {
          message: err instanceof Error && err.message
            ? err.message
            : 'Ce lien a expiré ou a déjà servi. Demande un nouvel e-mail.',
          canRetry: false,
        }
      }
    }
    verifying = false
  }

  onMount(() => {
    if (pendingHash) void runVerify(true)
    else if (new URLSearchParams(window.location.search).has('type')) cleanUrl()
  })

  // ── Nouveau mot de passe ──
  let password = $state('')
  let confirm = $state('')
  let showPassword = $state(false)
  let saving = $state(false)
  let done = $state(false)
  let pwError = $state<string | null>(null)
  let confirmError = $state<string | null>(null)
  let apiError = $state<string | null>(null)
  let redirectTimer: ReturnType<typeof setTimeout> | undefined

  let passwordInput: HTMLInputElement | undefined = $state()
  let confirmInput: HTMLInputElement | undefined = $state()

  onDestroy(() => clearTimeout(redirectTimer))

  // Solidité du mot de passe : même logique que Mon compte (longueur + variété)
  const strength = $derived.by(() => {
    const p = password
    if (!p) return null
    if (p.length < PW_MIN) return { level: 0, label: `Trop court (${PW_MIN} caractères min.)` }
    let score = 0
    if (p.length >= 10) score++
    if (p.length >= 14) score++
    if (/[a-z]/i.test(p) && /\d/.test(p)) score++
    if (/[^a-z0-9]/i.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score++
    if (score <= 1) return { level: 1, label: 'Faible' }
    if (score === 2) return { level: 2, label: 'Correct' }
    return { level: 3, label: 'Solide' }
  })

  const passwordsMatch = $derived(confirm.length > 0 && confirm === password)
  const passwordsDiffer = $derived(confirm.length > 0 && confirm !== password)

  /** Ce que la page montre (le lien d'abord, puis la session). */
  const view = $derived.by(() => {
    if (done) return 'done' as const
    if (verifying || (verified && !auth.user) || (auth.loading && !linkError)) return 'loading' as const
    if (linkError) return 'link-error' as const
    if (!auth.user) return 'invalid' as const
    return 'form' as const
  })

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (saving) return
    apiError = null
    pwError = null
    confirmError = null

    if (!password) pwError = 'Choisis un nouveau mot de passe.'
    else if (password.length < PW_MIN) pwError = `Le mot de passe doit faire au moins ${PW_MIN} caractères.`
    else if (new TextEncoder().encode(password).length > PW_MAX_BYTES) pwError = 'Ce mot de passe est trop long (72 caractères maximum).'

    if (!confirm) confirmError = 'Retape le mot de passe pour le confirmer.'
    else if (confirm !== password) confirmError = 'Les deux mots de passe ne correspondent pas.'

    if (pwError) { passwordInput?.focus(); return }
    if (confirmError) { confirmInput?.focus(); return }
    if (!navigator.onLine) {
      apiError = OFFLINE_MSG
      return
    }

    saving = true
    try {
      await setNewPassword(password)
      done = true
      password = ''
      confirm = ''
      redirectTimer = setTimeout(() => navigate('accueil'), 1800)
    } catch (err) {
      apiError = err instanceof Error && err.message
        ? err.message
        : 'Le mot de passe n’a pas pu être changé.'
      await tick()
      passwordInput?.focus()
    }
    saving = false
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

    <section class="auth-card" aria-labelledby="newpw-title">
      {#if view === 'done'}
        <div class="status" role="status">
          <span class="status-icon" data-tone="success"><Icon name="check-circle" size={28} /></span>
          <h2 id="newpw-title">Mot de passe changé !</h2>
          <p class="status-text">Tu es connecté. On t’emmène à l’accueil…</p>
          <div class="actions">
            <a class="text-link" href={href('accueil')}>Aller à l’accueil maintenant</a>
          </div>
        </div>
      {:else if view === 'loading'}
        <div class="status" role="status">
          <span class="big-spinner" aria-hidden="true"></span>
          <h2 id="newpw-title">Vérification du lien…</h2>
        </div>
      {:else if view === 'link-error' && linkError}
        <div class="status">
          <span class="status-icon" data-tone="error"><Icon name="alert-circle" size={28} /></span>
          <h2 id="newpw-title">{linkError.canRetry ? 'Impossible de vérifier le lien' : 'Lien expiré'}</h2>
          <p class="status-text" role="alert">{linkError.message}</p>
          <div class="actions">
            {#if linkError.canRetry}
              <button type="button" class="btn btn-primary btn-main" onclick={() => runVerify()}>
                <Icon name="refresh" size={18} /> Réessayer
              </button>
            {:else}
              <a class="btn btn-primary btn-main" href={href('mot-de-passe-oublie')}>Recevoir un nouvel e-mail</a>
            {/if}
            <a class="text-link" href={href('login')}>Retour à la connexion</a>
          </div>
        </div>
      {:else if view === 'invalid'}
        <div class="status">
          <span class="status-icon" data-tone="error"><Icon name="alert-circle" size={28} /></span>
          <h2 id="newpw-title">Lien invalide</h2>
          <p class="status-text">
            Ce lien est incomplet ou n’est plus valable. Pour choisir un nouveau mot de passe,
            demande un nouvel e-mail.
          </p>
          <div class="actions">
            <a class="btn btn-primary btn-main" href={href('mot-de-passe-oublie')}>Mot de passe oublié</a>
            <a class="text-link" href={href('login')}>Retour à la connexion</a>
          </div>
        </div>
      {:else}
        <h2 id="newpw-title">Nouveau mot de passe</h2>
        <p class="lead">
          Choisis un nouveau mot de passe{#if auth.user?.email} pour <strong class="account">{auth.user.email}</strong>{/if}.
        </p>

        <form onsubmit={handleSubmit} novalidate>
          <!-- Pour le gestionnaire de mots de passe : à quel compte associer le nouveau -->
          {#if auth.user?.email}
            <input
              class="sr-only"
              type="email"
              name="username"
              autocomplete="username"
              value={auth.user.email}
              readonly
              tabindex="-1"
              aria-hidden="true"
            />
          {/if}

          <div class="field">
            <label for="newpw-password" class="label-text">Nouveau mot de passe</label>
            <div class="input-wrap">
              <span class="input-icon"><Icon name="lock" size={18} /></span>
              <input
                bind:this={passwordInput}
                id="newpw-password"
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autocomplete="new-password"
                autocapitalize="off"
                spellcheck="false"
                class="input input-has-icon input-has-toggle"
                class:error={pwError != null}
                aria-invalid={pwError != null}
                aria-describedby="newpw-strength newpw-password-msg"
                placeholder="{PW_MIN} caractères minimum"
                bind:value={password}
                oninput={() => { pwError = null; apiError = null }}
              />
              <button
                type="button"
                class="eye-btn"
                aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                aria-pressed={showPassword}
                aria-controls="newpw-password newpw-confirm"
                onclick={() => (showPassword = !showPassword)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
              </button>
            </div>
            <div id="newpw-strength" class="strength" aria-live="polite">
              {#if strength}
                <div class="strength-bar" data-level={strength.level} aria-hidden="true">
                  <span></span><span></span><span></span>
                </div>
                <span class="strength-label" data-level={strength.level}>{strength.label}</span>
              {:else}
                <span class="strength-hint">Astuce : une phrase courte est plus facile à retenir et plus solide.</span>
              {/if}
            </div>
            <p id="newpw-password-msg" class="field-msg" aria-live="polite">{pwError ?? ''}</p>
          </div>

          <div class="field">
            <label for="newpw-confirm" class="label-text">Confirmer le mot de passe</label>
            <div class="input-wrap">
              <span class="input-icon"><Icon name="lock" size={18} /></span>
              <input
                bind:this={confirmInput}
                id="newpw-confirm"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autocomplete="new-password"
                autocapitalize="off"
                spellcheck="false"
                class="input input-has-icon"
                class:error={confirmError != null}
                aria-invalid={confirmError != null}
                aria-describedby="newpw-match newpw-confirm-msg"
                placeholder="Retape le mot de passe"
                bind:value={confirm}
                oninput={() => { confirmError = null; apiError = null }}
              />
            </div>
            <p id="newpw-match" class="match" aria-live="polite">
              {#if passwordsMatch}
                <span class="match-ok"><Icon name="check" size={14} /> Les mots de passe correspondent</span>
              {:else if passwordsDiffer && !confirmError}
                <span class="match-ko">Pas encore identiques</span>
              {/if}
            </p>
            <p id="newpw-confirm-msg" class="field-msg" aria-live="polite">{confirmError ?? ''}</p>
          </div>

          {#if apiError}
            <p class="error-msg" role="alert">{apiError}</p>
          {/if}

          <button type="submit" class="btn btn-primary btn-main" disabled={saving} aria-busy={saving}>
            {#if saving}
              <span class="btn-spinner" aria-hidden="true"></span>
              Enregistrement…
            {:else}
              <Icon name="key" size={18} /> Enregistrer le mot de passe
            {/if}
          </button>
        </form>
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

  .lead {
    margin: -10px 0 18px;
    font-size: 15px;
    line-height: 1.45;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .account { color: var(--text); font-weight: 600; }

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
  .input-has-toggle { padding-right: 52px; }

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

  .eye-btn[aria-pressed='true'] { color: var(--primary); }

  .eye-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -2px;
  }

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

  /* ── Solidité du mot de passe (comme Mon compte) ── */
  .strength {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 20px;
    margin-top: 8px;
    font-size: 13px;
  }

  .strength-bar {
    display: flex;
    gap: 4px;
    flex: 0 0 96px;
  }

  .strength-bar span {
    flex: 1;
    height: 5px;
    border-radius: 3px;
    background: var(--border-strong);
  }

  .strength-bar[data-level='0'] span:nth-child(1) { background: var(--error); }
  .strength-bar[data-level='1'] span:nth-child(1) { background: var(--accent); }
  .strength-bar[data-level='2'] span:nth-child(-n + 2) { background: var(--primary); }
  .strength-bar[data-level='3'] span { background: var(--success); }

  .strength-label { font-weight: 600; color: var(--text-secondary); }
  .strength-label[data-level='0'] { color: #FF9A9D; }
  .strength-label[data-level='1'] { color: var(--accent); }
  .strength-label[data-level='2'] { color: var(--primary); }
  .strength-label[data-level='3'] { color: var(--success); }

  .strength-hint { color: var(--text-secondary); line-height: 1.4; }

  .match {
    font-size: 13px;
    line-height: 1.4;
  }

  .match:not(:empty) { margin-top: 6px; }

  .match-ok {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--success);
    font-weight: 600;
  }

  .match-ko { color: var(--text-secondary); }

  /* ── Boutons et liens ── */
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

  .text-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: var(--radius-sm);
    color: var(--primary);
    font-size: 15px;
    font-weight: 600;
    touch-action: manipulation;
  }

  .text-link:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  /* ── États (vérification, lien invalide, succès) ── */
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
  }

  .status-icon[data-tone='error'] { background: var(--error-bg); color: #FF9A9D; }
  .status-icon[data-tone='success'] { background: var(--success-bg); color: var(--success); }

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

  .big-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--border-strong);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 8px 0 18px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
    .eye-btn:hover { color: var(--text); background: var(--surface); }
    .text-link:hover { background: var(--surface); }
  }

  @media (max-height: 640px) {
    .auth-inner { gap: 16px; }
    .logo-circle { width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px; }
    h1 { font-size: 26px; }
  }
</style>
