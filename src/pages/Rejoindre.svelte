<script lang="ts">
  // #/rejoindre/<jeton> : création de compte par lien d'invitation (sans être connecté).
  // Le jeton (router.token) n'est jamais affiché ni journalisé.
  import { onDestroy, tick, untrack } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import { auth } from '../lib/auth.svelte'
  import { router, navigate, href } from '../lib/router.svelte'
  import { toast } from '../lib/toast.svelte'
  import { VERSION_LABEL } from '../lib/version'
  import {
    acceptInvitation,
    invitationInfo,
    INVITATION_DAYS,
    type InvitationInfo,
  } from '../lib/api/famille'

  const NAME_MAX = 40
  const FAMILY_MAX = 60
  const PW_MIN = 10
  const PW_MAX_BYTES = 72 // limite de Supabase Auth (bcrypt)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const OFFLINE_MSG = 'Pas de connexion internet. Vérifie ton réseau, puis réessaie.'

  type Field = 'name' | 'email' | 'password' | 'confirm' | 'family'
  type BadStatus = Exclude<InvitationInfo['status'], 'valide'>

  const STATUS_TEXT: Record<BadStatus, { title: string; text: string }> = {
    inconnue: {
      title: 'Lien d’invitation introuvable',
      text: 'Ce lien ne correspond à aucune invitation. Vérifie que tu l’as ouvert en entier, ou demande un nouveau lien à la personne qui t’a invité.',
    },
    expiree: {
      title: 'Ce lien a expiré',
      text: `Un lien d’invitation n’est valable que ${INVITATION_DAYS} jours. Demande un nouveau lien à la personne qui t’a invité.`,
    },
    utilisee: {
      title: 'Ce lien a déjà servi',
      text: 'Chaque lien ne sert qu’une fois. Si le compte créé est le tien, connecte-toi. Sinon, demande un nouveau lien à la personne qui t’a invité.',
    },
    annulee: {
      title: 'Ce lien a été annulé',
      text: 'La personne qui l’a créé l’a annulé. Demande-lui un nouveau lien.',
    },
  }

  // ── Lecture du lien ──
  let loadState = $state<'loading' | 'ready' | 'network'>('loading')
  let info = $state<InvitationInfo | null>(null)
  let loadSeq = 0

  async function load(token: string | null) {
    const seq = ++loadSeq
    if (!token) {
      info = { status: 'inconnue', kind: null, role: null, family_name: null }
      loadState = 'ready'
      return
    }
    loadState = 'loading'
    try {
      const res = await invitationInfo(token)
      if (seq !== loadSeq) return
      info = res
      loadState = 'ready'
    } catch {
      if (seq !== loadSeq) return
      loadState = 'network'
    }
  }

  $effect(() => {
    const token = router.token
    untrack(() => load(token))
  })

  const isFounder = $derived(info?.kind === 'fondateur')
  const badStatus = $derived<BadStatus | null>(info && info.status !== 'valide' ? info.status : null)

  // ── Formulaire ──
  let step = $state<1 | 2>(1)
  let displayName = $state('')
  let email = $state('')
  let password = $state('')
  let confirm = $state('')
  let familyName = $state('')
  let showPassword = $state(false)

  let submitting = $state(false)
  let apiError = $state<string | null>(null)
  let errors = $state<Partial<Record<Field, string>>>({})
  /** Message de bienvenue après la création (le compte est alors connecté). */
  let welcome = $state<string | null>(null)
  let redirectTimer: ReturnType<typeof setTimeout> | undefined

  let titleEl: HTMLHeadingElement | undefined = $state()
  let nameInput: HTMLInputElement | undefined = $state()
  let emailInput: HTMLInputElement | undefined = $state()
  let passwordInput: HTMLInputElement | undefined = $state()
  let confirmInput: HTMLInputElement | undefined = $state()
  let familyInput: HTMLInputElement | undefined = $state()

  // Un compte déjà ouvert sur ce téléphone (pas celui qu'on vient de créer)
  const alreadyConnected = $derived(auth.user != null && !submitting && welcome == null)

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

  function clearError(f: Field) {
    if (errors[f]) errors[f] = undefined
    apiError = null
  }

  function focusField(f: Field) {
    const el = { name: nameInput, email: emailInput, password: passwordInput, confirm: confirmInput, family: familyInput }[f]
    el?.focus()
  }

  /** Vérifie l'étape « Ton compte ». Renvoie le premier champ en erreur. */
  function validateAccount(): Field | null {
    const e: Partial<Record<Field, string>> = {}
    const n = displayName.trim()
    if (!n) e.name = 'Indique ton prénom.'
    else if (n.length > NAME_MAX) e.name = `${NAME_MAX} caractères maximum.`

    const m = email.trim()
    if (!m) e.email = 'Indique ton adresse e-mail.'
    else if (!EMAIL_RE.test(m)) e.email = 'Cette adresse e-mail ne semble pas complète (ex. prenom@exemple.fr).'

    if (!password) e.password = 'Choisis un mot de passe.'
    else if (password.length < PW_MIN) e.password = `Le mot de passe doit faire au moins ${PW_MIN} caractères.`
    else if (new TextEncoder().encode(password).length > PW_MAX_BYTES) e.password = 'Ce mot de passe est trop long (72 caractères maximum).'

    if (!confirm) e.confirm = 'Retape le mot de passe pour le confirmer.'
    else if (confirm !== password) e.confirm = 'Les deux mots de passe ne correspondent pas.'

    errors = { ...e, family: errors.family }
    const order: Field[] = ['name', 'email', 'password', 'confirm']
    return order.find((f) => e[f]) ?? null
  }

  function validateFamily(): boolean {
    const f = familyName.trim()
    let msg: string | undefined
    if (!f) msg = 'Donne un nom à ta famille.'
    else if (f.length < 2) msg = 'Ce nom est un peu court (2 caractères minimum).'
    else if (f.length > FAMILY_MAX) msg = `${FAMILY_MAX} caractères maximum.`
    errors = { ...errors, family: msg }
    return !msg
  }

  async function goToStep(n: 1 | 2) {
    step = n
    await tick()
    if (n === 2) familyInput?.focus()
    else titleEl?.focus()
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting) return
    apiError = null

    const bad = validateAccount()
    if (bad) {
      if (step !== 1) {
        step = 1
        await tick()
      }
      focusField(bad)
      return
    }

    // Fondateur : l'étape 1 ne fait que passer à l'étape 2 (rien n'est créé)
    if (isFounder && step === 1) {
      await goToStep(2)
      return
    }
    if (isFounder && !validateFamily()) {
      familyInput?.focus()
      return
    }

    const token = router.token
    if (!token) {
      info = { status: 'inconnue', kind: null, role: null, family_name: null }
      return
    }
    if (!navigator.onLine) {
      apiError = OFFLINE_MSG
      return
    }

    const firstName = displayName.trim()
    submitting = true
    try {
      await acceptInvitation({
        token,
        email: email.trim(),
        password,
        display_name: firstName,
        ...(isFounder ? { family_name: familyName.trim() } : {}),
      })
      // welcome avant submitting = false : la session vient de s'ouvrir, il ne
      // faut pas afficher « un compte est déjà ouvert sur ce téléphone »
      welcome = isFounder
        ? `Bienvenue ${firstName} ! Ta famille « ${familyName.trim()} » est prête.`
        : `Bienvenue ${firstName} ! Ton compte est prêt.`
      submitting = false
      password = ''
      confirm = ''
      redirectTimer = setTimeout(() => navigate('accueil'), 1800)
    } catch (err) {
      submitting = false
      const message = err instanceof Error && err.message
        ? err.message
        : 'Le compte n’a pas pu être créé. Réessaie dans un instant.'
      // Compte créé mais connexion automatique ratée : on passe par la connexion
      if (message.startsWith('Compte créé')) {
        toast.success(message)
        navigate('login')
        return
      }
      apiError = message
      // Erreur qui porte sur l'étape 1 (adresse déjà prise, mot de passe refusé…)
      if (isFounder && step === 2 && /e-mail|adresse|mot de passe|prénom/i.test(message)) {
        step = 1
      }
    }
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
      <h1>Courses en famille</h1>
    </header>

    <section class="auth-card" aria-labelledby="join-title">
      {#if welcome}
        <div class="status" role="status">
          <span class="status-icon" data-tone="success"><Icon name="check-circle" size={28} /></span>
          <h2 id="join-title">{welcome}</h2>
          <p class="status-text">On t’emmène à l’accueil…</p>
          <div class="actions">
            <a class="text-link" href={href('accueil')}>Aller à l’accueil maintenant</a>
          </div>
        </div>
      {:else if alreadyConnected}
        <div class="status">
          <span class="status-icon" data-tone="info"><Icon name="user" size={28} /></span>
          <h2 id="join-title">Tu es déjà connecté</h2>
          <p class="status-text">
            Un compte est déjà ouvert sur ce téléphone, et une personne n’a qu’une famille.
            Ce lien sert à créer le compte de quelqu’un d’autre : transmets-le à la personne
            invitée pour qu’elle l’ouvre sur son propre téléphone.
          </p>
          <div class="actions">
            <a class="btn btn-primary btn-main" href={href('accueil')}>
              <Icon name="home" size={18} /> Aller à l’accueil
            </a>
          </div>
        </div>
      {:else if auth.loading || loadState === 'loading'}
        <div class="status" role="status">
          <span class="big-spinner" aria-hidden="true"></span>
          <h2 id="join-title">Vérification du lien…</h2>
        </div>
      {:else if loadState === 'network'}
        <div class="status">
          <span class="status-icon" data-tone="error"><Icon name="alert-circle" size={28} /></span>
          <h2 id="join-title">Impossible de vérifier ce lien</h2>
          <p class="status-text" role="alert">
            Vérifie ta connexion internet, puis réessaie.
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary btn-main" onclick={() => load(router.token)}>
              <Icon name="refresh" size={18} /> Réessayer
            </button>
            <a class="text-link" href={href('login')}>Aller à la connexion</a>
          </div>
        </div>
      {:else if badStatus}
        <div class="status">
          <span class="status-icon" data-tone="error"><Icon name="alert-circle" size={28} /></span>
          <h2 id="join-title">{STATUS_TEXT[badStatus].title}</h2>
          <p class="status-text">{STATUS_TEXT[badStatus].text}</p>
          <div class="actions">
            <a class="btn btn-primary btn-main" href={href('login')}>Aller à la connexion</a>
          </div>
        </div>
      {:else}
        {#if isFounder}
          <h2 id="join-title" tabindex="-1" bind:this={titleEl}>
            {step === 1 ? 'Crée ton compte' : 'Crée ta famille'}
          </h2>
          <p class="lead">
            {step === 1
              ? 'Tu es invité à fonder ta famille sur Courses en famille. D’abord ton compte, puis ta famille.'
              : 'Dernière étape : le nom de ta famille.'}
          </p>
          <ol class="steps" aria-label="Étapes">
            <li class:active={step === 1} class:done={step === 2} aria-current={step === 1 ? 'step' : undefined}>
              <span class="step-num" aria-hidden="true">
                {#if step === 2}<Icon name="check" size={14} strokeWidth={3} />{:else}1{/if}
              </span>
              <span class="step-label">Ton compte{#if step === 2}<span class="sr-only"> (terminé)</span>{/if}</span>
            </li>
            <li class:active={step === 2} aria-current={step === 2 ? 'step' : undefined}>
              <span class="step-num" aria-hidden="true">2</span>
              <span class="step-label">Ta famille</span>
            </li>
          </ol>
        {:else}
          <h2 id="join-title" tabindex="-1" bind:this={titleEl}>
            {info?.family_name ? `Rejoins « ${info.family_name} »` : 'Rejoins ta famille'}
          </h2>
          <p class="lead">
            Tu es invité {info?.role === 'admin' ? 'en tant qu’admin' : 'en tant que membre'}.
            Crée ton compte pour commencer.
          </p>
        {/if}

        <form onsubmit={handleSubmit} novalidate>
          <!-- Étape 1 (gardée dans la page à l'étape 2 : saisie conservée, et le
               gestionnaire de mots de passe voit l'e-mail et le mot de passe à l'envoi) -->
          <div class="group" hidden={step !== 1}>
            <div class="field">
              <label for="join-name" class="label-text">Prénom</label>
              <div class="input-wrap">
                <span class="input-icon"><Icon name="user" size={18} /></span>
                <input
                  bind:this={nameInput}
                  id="join-name"
                  name="given-name"
                  type="text"
                  autocomplete="given-name"
                  autocapitalize="words"
                  maxlength={NAME_MAX}
                  class="input input-has-icon"
                  class:error={!!errors.name}
                  aria-invalid={!!errors.name}
                  aria-describedby="join-name-msg"
                  placeholder="Ton prénom"
                  bind:value={displayName}
                  oninput={() => clearError('name')}
                />
              </div>
              <p id="join-name-msg" class="field-msg" aria-live="polite">{errors.name ?? ''}</p>
            </div>

            <div class="field">
              <label for="join-email" class="label-text">Adresse e-mail</label>
              <div class="input-wrap">
                <span class="input-icon"><Icon name="mail" size={18} /></span>
                <input
                  bind:this={emailInput}
                  id="join-email"
                  name="email"
                  type="email"
                  inputmode="email"
                  autocomplete="email"
                  autocapitalize="off"
                  spellcheck="false"
                  class="input input-has-icon"
                  class:error={!!errors.email}
                  aria-invalid={!!errors.email}
                  aria-describedby="join-email-msg"
                  placeholder="prenom@exemple.fr"
                  bind:value={email}
                  oninput={() => clearError('email')}
                />
              </div>
              <p id="join-email-msg" class="field-msg" aria-live="polite">{errors.email ?? ''}</p>
            </div>

            <div class="field">
              <label for="join-password" class="label-text">Mot de passe</label>
              <div class="input-wrap">
                <span class="input-icon"><Icon name="lock" size={18} /></span>
                <input
                  bind:this={passwordInput}
                  id="join-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autocomplete="new-password"
                  autocapitalize="off"
                  spellcheck="false"
                  class="input input-has-icon input-has-toggle"
                  class:error={!!errors.password}
                  aria-invalid={!!errors.password}
                  aria-describedby="join-pw-strength join-password-msg"
                  placeholder="{PW_MIN} caractères minimum"
                  bind:value={password}
                  oninput={() => clearError('password')}
                />
                <button
                  type="button"
                  class="eye-btn"
                  aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                  aria-pressed={showPassword}
                  aria-controls="join-password join-confirm"
                  onclick={() => (showPassword = !showPassword)}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
                </button>
              </div>
              <div id="join-pw-strength" class="strength" aria-live="polite">
                {#if strength}
                  <div class="strength-bar" data-level={strength.level} aria-hidden="true">
                    <span></span><span></span><span></span>
                  </div>
                  <span class="strength-label" data-level={strength.level}>{strength.label}</span>
                {:else}
                  <span class="strength-hint">Astuce : une phrase courte est plus facile à retenir et plus solide.</span>
                {/if}
              </div>
              <p id="join-password-msg" class="field-msg" aria-live="polite">{errors.password ?? ''}</p>
            </div>

            <div class="field">
              <label for="join-confirm" class="label-text">Confirmer le mot de passe</label>
              <div class="input-wrap">
                <span class="input-icon"><Icon name="lock" size={18} /></span>
                <input
                  bind:this={confirmInput}
                  id="join-confirm"
                  name="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autocomplete="new-password"
                  autocapitalize="off"
                  spellcheck="false"
                  class="input input-has-icon"
                  class:error={!!errors.confirm}
                  aria-invalid={!!errors.confirm}
                  aria-describedby="join-match join-confirm-msg"
                  placeholder="Retape le mot de passe"
                  bind:value={confirm}
                  oninput={() => clearError('confirm')}
                />
              </div>
              <p id="join-match" class="match" aria-live="polite">
                {#if passwordsMatch}
                  <span class="match-ok"><Icon name="check" size={14} /> Les mots de passe correspondent</span>
                {:else if passwordsDiffer && !errors.confirm}
                  <span class="match-ko">Pas encore identiques</span>
                {/if}
              </p>
              <p id="join-confirm-msg" class="field-msg" aria-live="polite">{errors.confirm ?? ''}</p>
            </div>
          </div>

          {#if isFounder && step === 2}
            <div class="group">
              <div class="field">
                <label for="join-family" class="label-text">Nom de ta famille</label>
                <div class="input-wrap">
                  <span class="input-icon"><Icon name="users" size={18} /></span>
                  <input
                    bind:this={familyInput}
                    id="join-family"
                    name="family-name"
                    type="text"
                    autocomplete="off"
                    autocapitalize="words"
                    maxlength={FAMILY_MAX}
                    class="input input-has-icon"
                    class:error={!!errors.family}
                    aria-invalid={!!errors.family}
                    aria-describedby="join-family-help join-family-msg"
                    placeholder="Famille Martin"
                    bind:value={familyName}
                    oninput={() => clearError('family')}
                  />
                </div>
                <p id="join-family-msg" class="field-msg" aria-live="polite">{errors.family ?? ''}</p>
              </div>
              <p id="join-family-help" class="explain">
                Tu en seras le fondateur : tu pourras inviter des gens à la rejoindre,
                et créer jusqu’à 3 familles.
              </p>
            </div>
          {/if}

          {#if apiError}
            <p class="error-msg" role="alert">{apiError}</p>
          {/if}

          <button type="submit" class="btn btn-primary btn-main" disabled={submitting} aria-busy={submitting}>
            {#if submitting}
              <span class="btn-spinner" aria-hidden="true"></span>
              {isFounder ? 'Création en cours…' : 'Création du compte…'}
            {:else if isFounder && step === 1}
              Continuer <Icon name="arrow-right" size={18} />
            {:else if isFounder}
              Créer mon compte et ma famille
            {:else}
              Créer mon compte
            {/if}
          </button>

          {#if isFounder && step === 2}
            <button type="button" class="text-link back-btn" disabled={submitting} onclick={() => goToStep(1)}>
              <Icon name="arrow-left" size={18} /> Retour à mon compte
            </button>
          {/if}
        </form>

        <p class="hint">
          Déjà un compte ? <a class="inline-link" href={href('login')}>Connecte-toi</a>
        </p>
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
    overflow-wrap: anywhere;
  }

  h2:focus { outline: none; }

  .lead {
    margin: -10px 0 18px;
    font-size: 15px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  /* ── Étapes (fondateur) ── */
  .steps {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .steps li + li::before {
    content: '';
    width: 28px;
    height: 2px;
    border-radius: 1px;
    background: var(--border-strong);
    margin-right: 2px;
  }

  .step-num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    border: 1.5px solid var(--border-strong);
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .steps li.active { color: var(--text); }
  .steps li.active .step-num { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  .steps li.done .step-num { background: var(--success-bg); border-color: var(--success); color: var(--success); }

  /* ── Formulaire ── */
  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .group[hidden] { display: none; }

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

  .explain {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
    background: var(--primary-light);
    border-radius: var(--radius-md);
    padding: 10px 14px;
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

  .text-link:disabled { opacity: 0.5; cursor: not-allowed; }

  .back-btn { align-self: center; margin-top: -6px; }

  .text-link:focus-visible,
  .inline-link:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .hint {
    margin-top: 14px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--text-secondary);
    text-align: center;
  }

  /* Lien dans une phrase : zone de tap agrandie sans décaler le texte */
  .inline-link {
    display: inline-block;
    padding: 12px 4px;
    margin: -12px -4px;
    color: var(--primary);
    font-weight: 600;
    border-radius: var(--radius-sm);
    touch-action: manipulation;
  }

  /* ── États (chargement, lien invalide, bienvenue…) ── */
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
  .status-icon[data-tone='info'] { background: var(--primary-light); color: var(--primary); }
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
    .text-link:not(:disabled):hover { background: var(--surface); }
    .inline-link:hover { text-decoration: underline; }
  }

  @media (max-height: 640px) {
    .auth-inner { gap: 16px; }
    .logo-circle { width: 56px; height: 56px; border-radius: 18px; margin-bottom: 12px; }
    h1 { font-size: 26px; }
  }
</style>
