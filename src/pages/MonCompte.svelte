<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import { auth, signOut } from '../lib/auth.svelte'
  import { profileState, loadProfile, clearProfile } from '../lib/profile.svelte'
  import { pendingToggles } from '../lib/offline'
  import { supabase } from '../lib/supabase'
  import { navigate } from '../lib/router.svelte'
  import { toast } from '../lib/toast.svelte'
  import { VERSION_LABEL } from '../lib/version'

  let displayName = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')
  let showPassword = $state(false)

  let saving = $state(false)
  let savingPw = $state(false)
  let nameError = $state<string | null>(null)
  let pwError = $state<string | null>(null)

  let confirmSignOut = $state(false)
  let confirmClear = $state(false)
  let pendingCount = $state(0)

  // Charger les infos initiales
  $effect(() => {
    if (profileState.profile) {
      displayName = profileState.profile.display_name ?? ''
    }
  })

  const savedName = $derived(profileState.profile?.display_name ?? '')
  const nameChanged = $derived(displayName.trim() !== savedName)

  async function handleSaveName() {
    if (!supabase || !auth.user || saving) return
    nameError = null
    if (!displayName.trim()) {
      nameError = 'Le nom ne peut pas être vide.'
      return
    }
    if (!nameChanged) {
      toast.info('Ce nom est déjà enregistré.')
      return
    }

    saving = true

    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', auth.user.id)

    if (err) {
      toast.error(err.message)
    } else {
      toast.success('Nom mis à jour !')
      await loadProfile(auth.user.id)
    }
    saving = false
  }

  // Indicateur de force volontairement simple (longueur + variété)
  const strength = $derived.by(() => {
    const p = newPassword
    if (!p) return null
    if (p.length < 6) return { level: 0, label: 'Trop court (6 caractères min.)' }
    let score = 0
    if (p.length >= 10) score++
    if (p.length >= 14) score++
    if (/[a-z]/i.test(p) && /\d/.test(p)) score++
    if (/[^a-z0-9]/i.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score++
    if (score <= 1) return { level: 1, label: 'Faible' }
    if (score === 2) return { level: 2, label: 'Correct' }
    return { level: 3, label: 'Solide' }
  })

  const passwordsMatch = $derived(confirmPassword.length > 0 && confirmPassword === newPassword)
  const passwordsDiffer = $derived(confirmPassword.length > 0 && confirmPassword !== newPassword)

  async function handleChangePassword() {
    if (!supabase || savingPw) return
    pwError = null
    if (newPassword.length < 6) {
      pwError = 'Le mot de passe doit faire au moins 6 caractères.'
      return
    }
    if (newPassword !== confirmPassword) {
      pwError = 'Les deux mots de passe ne correspondent pas.'
      return
    }

    savingPw = true

    const { error: err } = await supabase.auth.updateUser({ password: newPassword })

    if (err) {
      pwError = err.message.toLowerCase().includes('different from the old')
        ? "Le nouveau mot de passe doit être différent de l'ancien."
        : err.message
    } else {
      toast.success('Mot de passe changé !')
      newPassword = ''
      confirmPassword = ''
      showPassword = false
    }
    savingPw = false
  }

  function handleSignOut() {
    confirmSignOut = false
    clearProfile(true) // déconnexion : on efface aussi les données gardées sur le téléphone
    signOut()
    navigate('login')
  }

  function askClear() {
    try {
      pendingCount = pendingToggles().length
    } catch {
      pendingCount = 0
    }
    confirmClear = true
  }

  /** Efface uniquement les données hors connexion (clés `courses:`), sans déconnecter. */
  function handleClearOffline() {
    let removed = 0
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('courses:')) {
          localStorage.removeItem(key)
          removed++
        }
      }
    } catch {
      // stockage indisponible : rien à effacer
    }
    confirmClear = false
    toast.success(removed > 0
      ? 'Données hors connexion effacées. La liste sera rechargée depuis internet.'
      : 'Rien à effacer sur ce téléphone.')
  }

  const userEmail = $derived(auth.user?.email ?? '')
  const role = $derived(profileState.profile?.role === 'admin' ? 'Administrateur' : 'Membre')
  const initial = $derived(savedName.trim().charAt(0).toUpperCase())
</script>

<div class="page">
  <header class="head">
    <h1>Mon compte</h1>
    <p class="head-sub">Ton profil et les réglages de ce téléphone.</p>
  </header>

  <!-- Avatar + résumé -->
  <section class="profile-card" aria-label="Profil">
    <div class="avatar" aria-hidden="true">
      {#if initial}
        {initial}
      {:else}
        <Icon name="user" size={28} />
      {/if}
    </div>
    <div class="profile-info">
      <span class="profile-name">{savedName || 'Sans nom'}</span>
      {#if userEmail}<span class="profile-email">{userEmail}</span>{/if}
      {#if profileState.profile}<span class="profile-role-badge">{role}</span>{/if}
    </div>
  </section>

  <!-- Nom d'affichage -->
  <section class="card" aria-labelledby="name-title">
    <h2 id="name-title" class="section-title">
      <span class="section-icon"><Icon name="pencil" size={18} /></span> Nom d'affichage
    </h2>
    <div class="field">
      <label for="display-name" class="label-text">Comment les autres te voient</label>
      <input
        id="display-name"
        type="text"
        class="input"
        class:error={nameError != null}
        aria-invalid={nameError != null}
        aria-describedby={nameError ? 'name-error' : undefined}
        placeholder="Ton prénom ou surnom"
        autocomplete="nickname"
        maxlength="40"
        bind:value={displayName}
        oninput={() => (nameError = null)}
        onkeydown={(e) => { if (e.key === 'Enter') handleSaveName() }}
      />
    </div>
    {#if nameError}<p id="name-error" class="field-error" role="alert">{nameError}</p>{/if}
    <button class="btn btn-save" onclick={handleSaveName} aria-busy={saving}>
      {saving ? 'Enregistrement…' : 'Enregistrer le nom'}
    </button>
  </section>

  <!-- Changer le mot de passe -->
  <section class="card" aria-labelledby="pw-title">
    <h2 id="pw-title" class="section-title">
      <span class="section-icon"><Icon name="lock" size={18} /></span> Changer le mot de passe
    </h2>

    <div class="field">
      <label for="new-password" class="label-text">Nouveau mot de passe</label>
      <div class="input-wrap">
        <input
          id="new-password"
          type={showPassword ? 'text' : 'password'}
          class="input input-has-toggle"
          class:error={pwError != null && newPassword.length < 6}
          placeholder="6 caractères minimum"
          autocomplete="new-password"
          autocapitalize="off"
          spellcheck="false"
          aria-describedby="pw-strength"
          bind:value={newPassword}
          oninput={() => (pwError = null)}
        />
        <button
          type="button"
          class="eye-btn"
          aria-label={showPassword ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
          aria-pressed={showPassword}
          onclick={() => (showPassword = !showPassword)}
        >
          <Icon name={showPassword ? 'eye-off' : 'eye'} size={20} />
        </button>
      </div>
      <div id="pw-strength" class="strength" aria-live="polite">
        {#if strength}
          <div class="strength-bar" data-level={strength.level} aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <span class="strength-label" data-level={strength.level}>{strength.label}</span>
        {:else}
          <span class="strength-hint">Astuce : une phrase courte est plus facile à retenir et plus solide.</span>
        {/if}
      </div>
    </div>

    <div class="field">
      <label for="confirm-password" class="label-text">Confirmer le mot de passe</label>
      <input
        id="confirm-password"
        type={showPassword ? 'text' : 'password'}
        class="input"
        class:error={passwordsDiffer && pwError != null}
        placeholder="Retape le mot de passe"
        autocomplete="new-password"
        autocapitalize="off"
        spellcheck="false"
        aria-describedby="pw-match"
        bind:value={confirmPassword}
        oninput={() => (pwError = null)}
      />
      <p id="pw-match" class="match" aria-live="polite">
        {#if passwordsMatch}
          <span class="match-ok"><Icon name="check" size={14} /> Les mots de passe correspondent</span>
        {:else if passwordsDiffer}
          <span class="match-ko">Pas encore identiques</span>
        {/if}
      </p>
    </div>

    {#if pwError}<p class="field-error" role="alert">{pwError}</p>{/if}
    <button class="btn btn-save" onclick={handleChangePassword} aria-busy={savingPw}>
      {savingPw ? 'Modification…' : 'Changer le mot de passe'}
    </button>
  </section>

  <!-- À propos / ce téléphone -->
  <section class="card" aria-labelledby="about-title">
    <h2 id="about-title" class="section-title">
      <span class="section-icon"><Icon name="settings" size={18} /></span> Ce téléphone
    </h2>
    <p class="about-text">
      La dernière liste de courses est gardée sur ce téléphone pour marcher sans réseau.
      Si elle paraît bloquée ou pas à jour, tu peux l'effacer : tu resteras connecté.
    </p>
    <button class="btn btn-outline btn-row" onclick={askClear}>
      <Icon name="refresh" size={18} /> Vider les données locales
    </button>
  </section>

  <!-- Déconnexion : à part -->
  <div class="danger-zone">
    <button class="btn btn-logout" onclick={() => (confirmSignOut = true)}>
      <Icon name="logout" size={18} /> Se déconnecter
    </button>
  </div>

  <p class="app-version">Courses en famille · {VERSION_LABEL}</p>
</div>

{#if confirmSignOut}
  <ConfirmDialog
    title="Se déconnecter ?"
    confirmLabel="Se déconnecter"
    danger
    onconfirm={handleSignOut}
    oncancel={() => (confirmSignOut = false)}
  >
    La liste de courses gardée sur ce téléphone sera effacée. Tu devras te reconnecter
    avec ton e-mail et ton mot de passe.
  </ConfirmDialog>
{/if}

{#if confirmClear}
  <ConfirmDialog
    title="Vider les données hors connexion de ce téléphone ?"
    confirmLabel="Vider"
    danger={pendingCount > 0}
    onconfirm={handleClearOffline}
    oncancel={() => (confirmClear = false)}
  >
    {#if pendingCount > 0}
      <strong class="warn">
        {pendingCount === 1
          ? '1 article coché sans réseau n’a pas encore été envoyé'
          : `${pendingCount} articles cochés sans réseau n’ont pas encore été envoyés`}
        et sera perdu.
      </strong>
    {/if}
    La copie locale de la liste sera effacée et rechargée depuis internet. Tu restes connecté.
  </ConfirmDialog>
{/if}

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 560px;
    margin: 0 auto;
    padding-bottom: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .head {
    margin-bottom: 4px;
  }

  .head h1 {
    font-family: var(--font-display);
    font-size: 28px;
  }

  .head-sub {
    margin-top: 4px;
    font-size: 15px;
    color: var(--text-secondary);
  }

  /* ── Profil ── */
  .profile-card {
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 18px;
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
    color: var(--on-primary);
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  .profile-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .profile-name {
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-email {
    font-size: 14px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-role-badge {
    margin-top: 4px;
    align-self: flex-start;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--primary-light);
    color: var(--primary);
  }

  /* ── Cartes ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  .section-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--primary-light);
    color: var(--primary);
    flex-shrink: 0;
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

  .input {
    min-height: 50px;
  }

  .input-wrap {
    position: relative;
  }

  .input-has-toggle {
    padding-right: 52px;
  }

  .eye-btn {
    position: absolute;
    right: 3px;
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

  .field-error {
    font-size: 14px;
    line-height: 1.4;
    color: #FFD9DA;
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 55%, transparent);
    padding: 9px 12px;
    border-radius: var(--radius-md);
  }

  /* ── Force du mot de passe ── */
  .strength {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 20px;
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
    min-height: 18px;
    font-size: 13px;
  }

  .match-ok {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--success);
    font-weight: 600;
  }

  .match-ko { color: var(--text-secondary); }

  /* ── Boutons ── */
  .btn-save {
    min-height: 48px;
    padding: 12px 20px;
    border-radius: var(--radius-lg);
    background: var(--primary);
    color: var(--on-primary);
    font-size: 15px;
    touch-action: manipulation;
  }

  .btn-save[aria-busy='true'] { opacity: 0.75; cursor: progress; }

  .btn-row {
    min-height: 48px;
    font-size: 15px;
    touch-action: manipulation;
  }

  .about-text {
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-secondary);
  }

  /* ── Déconnexion, à part ── */
  .danger-zone {
    margin-top: 16px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .btn-logout {
    width: 100%;
    min-height: 50px;
    border-radius: var(--radius-lg);
    border: 1.5px solid color-mix(in srgb, var(--error) 70%, transparent);
    background: rgba(9, 24, 50, 0.55);
    color: #FF9A9D;
    font-size: 15px;
    touch-action: manipulation;
  }

  /* Version de l'appli (voir src/lib/version.ts) */
  .app-version {
    margin: 20px 0 4px;
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }

  .warn {
    display: block;
    margin-bottom: 8px;
    color: #FFB59A;
  }

  @media (hover: hover) and (pointer: fine) {
    .eye-btn:hover { color: var(--text); background: var(--surface); }
    .btn-save:hover { opacity: 0.9; }
    .btn-logout:hover { background: var(--error-bg); }
  }

  @media (min-width: 900px) {
    .page { padding-top: calc(32px + env(safe-area-inset-top, 0px)); }
  }
</style>
