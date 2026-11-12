<script lang="ts">
  import { auth, signOut } from '../lib/auth.svelte'
  import { profileState, loadProfile, clearProfile } from '../lib/profile.svelte'
  import { supabase } from '../lib/supabase'
  import { navigate } from '../lib/router.svelte'

  let displayName = $state('')
  let newPassword = $state('')
  let confirmPassword = $state('')

  let saving = $state(false)
  let savingPw = $state(false)
  let success = $state<string | null>(null)
  let error = $state<string | null>(null)

  // Charger les infos initiales
  $effect(() => {
    if (profileState.profile) {
      displayName = profileState.profile.display_name ?? ''
    }
  })

  async function handleSaveName() {
    if (!supabase || !auth.user || saving) return
    if (!displayName.trim()) {
      error = 'Le nom ne peut pas être vide.'
      return
    }

    saving = true
    error = null
    success = null

    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', auth.user.id)

    if (err) {
      error = err.message
    } else {
      success = 'Nom mis à jour !'
      // Recharger le profil en mémoire
      await loadProfile(auth.user.id)
    }
    saving = false
  }

  async function handleChangePassword() {
    if (!supabase || savingPw) return
    if (newPassword.length < 6) {
      error = 'Le mot de passe doit faire au moins 6 caractères.'
      return
    }
    if (newPassword !== confirmPassword) {
      error = 'Les mots de passe ne correspondent pas.'
      return
    }

    savingPw = true
    error = null
    success = null

    const { error: err } = await supabase.auth.updateUser({ password: newPassword })

    if (err) {
      error = err.message
    } else {
      success = 'Mot de passe changé !'
      newPassword = ''
      confirmPassword = ''
    }
    savingPw = false
  }

  function handleSignOut() {
    clearProfile()
    signOut()
    navigate('login')
  }

  const userEmail = $derived(auth.user?.email ?? '—')
  const familyName = $derived(profileState.profile?.family_id ? 'Ma famille' : '—')
  const role = $derived(profileState.profile?.role === 'admin' ? 'Administrateur' : 'Membre')
</script>

<div class="page">
  <header class="page-header">
    <h1>Mon compte</h1>
    <p class="page-sub">Gère tes informations personnelles.</p>
  </header>

  <!-- Avatar + résumé -->
  <div class="profile-card">
    <div class="avatar">
      {#if displayName}
        {displayName.charAt(0).toUpperCase()}
      {:else}
        👤
      {/if}
    </div>
    <div class="profile-info">
      <span class="profile-name">{displayName || '—'}</span>
      <span class="profile-email">{userEmail}</span>
      <span class="profile-role-badge">{role}</span>
    </div>
  </div>

  <!-- Nom d'affichage -->
  <div class="card">
    <h2 class="section-title">✏️ Nom d'affichage</h2>
    <label class="field">
      <span class="label-text">Comment les autres te voient</span>
      <input
        type="text"
        class="input"
        placeholder="Ton prénom ou surnom"
        bind:value={displayName}
      />
    </label>
    <button class="btn btn-primary btn-sm" onclick={handleSaveName} disabled={saving}>
      {saving ? 'Enregistrement…' : 'Enregistrer'}
    </button>
  </div>

  <!-- Changer le mot de passe -->
  <div class="card">
    <h2 class="section-title">🔒 Changer le mot de passe</h2>
    <label class="field">
      <span class="label-text">Nouveau mot de passe</span>
      <input
        type="password"
        class="input"
        placeholder="6 caractères min."
        autocomplete="new-password"
        bind:value={newPassword}
      />
    </label>
    <label class="field">
      <span class="label-text">Confirmer</span>
      <input
        type="password"
        class="input"
        placeholder="Retape le mot de passe"
        autocomplete="new-password"
        bind:value={confirmPassword}
      />
    </label>
    <button class="btn btn-primary btn-sm" onclick={handleChangePassword} disabled={savingPw}>
      {savingPw ? 'Modification…' : 'Changer le mot de passe'}
    </button>
  </div>

  {#if error}
    <p class="msg msg-error">{error}</p>
  {/if}
  {#if success}
    <p class="msg msg-success">{success}</p>
  {/if}

  <!-- Déconnexion -->
  <button class="btn btn-danger-outline btn-logout" onclick={handleSignOut}>
    🚪 Se déconnecter
  </button>
</div>

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 520px;
    padding-bottom: 32px;
  }

  .page-header {
    margin-bottom: 20px;
  }

  .page-header h1 {
    font-size: 24px;
    margin-bottom: 4px;
  }

  .page-sub {
    font-size: 14px;
    color: var(--text-secondary);
  }

  /* ── Profile card ── */
  .profile-card {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
    margin-bottom: 16px;
  }

  .avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary), var(--accent));
    color: white;
    font-size: 22px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .profile-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .profile-name {
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-email {
    font-size: 13px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-role-badge {
    margin-top: 2px;
    align-self: flex-start;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    color: var(--primary);
  }

  /* ── Cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .btn-sm {
    align-self: flex-start;
    padding: 8px 18px;
    font-size: 14px;
  }

  /* ── Messages ── */
  .msg {
    font-size: 14px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    margin-bottom: 12px;
  }

  .msg-error {
    color: var(--error);
    background: var(--error-bg);
  }

  .msg-success {
    color: #15803d;
    background: #dcfce7;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) .msg-success {
      color: #86efac;
      background: rgba(34, 197, 94, 0.15);
    }
  }

  :global(:root[data-theme="dark"]) .msg-success {
    color: #86efac;
    background: rgba(34, 197, 94, 0.15);
  }

  /* ── Logout ── */
  .btn-logout {
    width: 100%;
    margin-top: 8px;
  }

  .btn-danger-outline {
    padding: 12px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--error);
    background: transparent;
    color: var(--error);
    font-size: 15px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .btn-danger-outline:hover {
    background: var(--error);
    color: white;
  }
</style>
