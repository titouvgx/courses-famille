<script lang="ts">
  import { auth, signIn } from '../lib/auth.svelte'

  let email = $state('')
  let password = $state('')
  let submitting = $state(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (submitting || !email || !password) return
    submitting = true
    await signIn(email.trim(), password)
    submitting = false
  }
</script>

<div class="login-page">

  <div class="login-card">
    <div class="logo">
      <div class="logo-circle">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
      </div>
    </div>

    <h1>Courses en famille</h1>
    <p class="subtitle">Recettes, planning & listes de courses partagés.</p>

    <form onsubmit={handleSubmit}>
      <label>
        <span class="label-text">Email</span>
        <div class="input-wrap">
          <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2"/>
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
          </svg>
          <input
            type="email"
            class="input input-has-icon"
            class:error={auth.error != null}
            placeholder="ton@email.fr"
            autocomplete="email"
            required
            bind:value={email}
          />
        </div>
      </label>

      <label>
        <span class="label-text">Mot de passe</span>
        <div class="input-wrap">
          <svg class="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <input
            type="password"
            class="input input-has-icon"
            class:error={auth.error != null}
            placeholder="••••••••"
            autocomplete="current-password"
            required
            bind:value={password}
          />
        </div>
      </label>

      {#if auth.error}
        <p class="error-msg">{auth.error}</p>
      {/if}

      <button type="submit" class="btn btn-primary btn-login" disabled={submitting || !email || !password}>
        {#if submitting}
          <span class="btn-spinner"></span>
          Connexion…
        {:else}
          Se connecter
        {/if}
      </button>
    </form>

    <p class="hint">Pas de compte ? Demande à l'administrateur de t'en créer un.</p>
  </div>
</div>

<style>
  .login-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--gutter);
    position: relative;
    overflow: hidden;
  }

  /* ── Card ── */
  .login-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 380px;
    text-align: center;
    /* Pas de backdrop-filter : la photo derrière bouge, le flou serait recalculé
       à chaque image. Un fond presque opaque suffit à rester lisible. */
    background: rgba(9, 24, 50, 0.82);
    border: 1px solid var(--border-strong);
    border-radius: 20px;
    padding: 32px 24px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
  }

  .logo {
    margin-bottom: 20px;
  }

  .logo-circle {
    width: 68px;
    height: 68px;
    border-radius: 20px;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    color: var(--on-primary);
  }

  h1 {
    font-size: 26px;
    color: var(--text);
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 28px;
    line-height: 1.4;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    text-align: left;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-text {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .input-wrap {
    position: relative;
  }

  .input-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-placeholder);
    pointer-events: none;
  }

  .input-has-icon {
    padding-left: 40px;
  }

  .error-msg {
    font-size: 14px;
    color: var(--error);
    background: var(--error-bg);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
  }

  .btn-login {
    margin-top: 4px;
    padding: 14px;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .hint {
    margin-top: 20px;
    font-size: 13px;
    color: var(--text-placeholder);
    text-align: center;
  }

</style>
