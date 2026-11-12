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
  <!-- Formes évanescentes en arrière-plan -->
  <div class="blobs" aria-hidden="true">
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="blob blob-3"></div>
    <div class="blob blob-4"></div>
  </div>

  <div class="login-card">
    <div class="logo">
      <div class="logo-circle">
        <span class="logo-icon">🛒</span>
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
    background: var(--bg);
    position: relative;
    overflow: hidden;
  }

  /* ── Formes évanescentes ── */
  .blobs {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.4;
    animation: drift 18s ease-in-out infinite alternate;
  }

  .blob-1 {
    width: 340px;
    height: 340px;
    background: var(--primary);
    top: -80px;
    right: -60px;
    animation-duration: 16s;
  }

  .blob-2 {
    width: 280px;
    height: 280px;
    background: var(--accent);
    bottom: -50px;
    left: -40px;
    animation-duration: 20s;
    animation-delay: -4s;
  }

  .blob-3 {
    width: 180px;
    height: 180px;
    background: #a78bfa;
    top: 30%;
    left: 15%;
    opacity: 0.25;
    animation-duration: 22s;
    animation-delay: -8s;
  }

  .blob-4 {
    width: 220px;
    height: 220px;
    background: var(--primary);
    bottom: 20%;
    right: 10%;
    opacity: 0.2;
    animation-duration: 24s;
    animation-delay: -12s;
  }

  @keyframes drift {
    0% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(30px, -20px) scale(1.1);
    }
    100% {
      transform: translate(-20px, 30px) scale(0.95);
    }
  }

  /* ── Card ── */
  .login-card {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 380px;
    text-align: center;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
    border-radius: 20px;
    padding: 32px 24px;
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
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
    box-shadow: 0 4px 20px rgba(26, 83, 92, 0.25);
  }

  .logo-icon {
    font-size: 32px;
    display: inline-block;
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

  /* ── Dark mode blob adjustments ── */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) .blob {
      opacity: 0.2;
    }
    :global(:root:not([data-theme="light"])) .login-card {
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3);
    }
  }

  :global(:root[data-theme="dark"]) .blob {
    opacity: 0.2;
  }

  :global(:root[data-theme="dark"]) .login-card {
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3);
  }
</style>
