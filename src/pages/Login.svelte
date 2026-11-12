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
      <span class="logo-icon">🛒</span>
    </div>

    <h1>Courses en famille</h1>
    <p class="subtitle">Connecte-toi pour accéder aux recettes et au planning.</p>

    <form onsubmit={handleSubmit}>
      <label>
        <span class="label-text">Email</span>
        <input
          type="email"
          class="input"
          class:error={auth.error != null}
          placeholder="ton@email.fr"
          autocomplete="email"
          required
          bind:value={email}
        />
      </label>

      <label>
        <span class="label-text">Mot de passe</span>
        <input
          type="password"
          class="input"
          class:error={auth.error != null}
          placeholder="••••••••"
          autocomplete="current-password"
          required
          bind:value={password}
        />
      </label>

      {#if auth.error}
        <p class="error-msg">{auth.error}</p>
      {/if}

      <button type="submit" class="btn btn-primary" disabled={submitting || !email || !password}>
        {#if submitting}
          Connexion…
        {:else}
          Se connecter
        {/if}
      </button>
    </form>

    <p class="hint">Pas de compte ? Demande à Titouan de t'en créer un.</p>
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
  }

  .login-card {
    width: 100%;
    max-width: 380px;
    text-align: center;
  }

  .logo {
    margin-bottom: 16px;
  }

  .logo-icon {
    font-size: 48px;
    display: inline-block;
  }

  h1 {
    font-size: 28px;
    color: var(--text);
    margin-bottom: 8px;
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: 15px;
    margin-bottom: 32px;
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
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .error-msg {
    font-size: 14px;
    color: var(--error);
    background: var(--error-bg);
    padding: 10px 14px;
    border-radius: var(--radius-sm);
  }

  .hint {
    margin-top: 24px;
    font-size: 13px;
    color: var(--text-placeholder);
    text-align: center;
  }
</style>
