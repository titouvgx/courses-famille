<script lang="ts">
  import { profileState } from '../lib/profile.svelte'
  import { router, href } from '../lib/router.svelte'

  const initial = $derived(
    profileState.profile?.display_name
      ? profileState.profile.display_name.charAt(0).toUpperCase()
      : '?'
  )

  const isOnCompte = $derived(router.current === 'compte')
</script>

<header class="app-header">
  <a
    href={href('compte')}
    class="avatar-btn"
    class:active={isOnCompte}
    aria-label="Mon compte"
    title="Mon compte"
  >
    {initial}
  </a>
</header>

<style>
  .app-header {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 50;
    padding: calc(10px + env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) 0 0;
    pointer-events: none;
  }

  .avatar-btn {
    pointer-events: all;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
    color: var(--on-primary);
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .avatar-btn:hover,
  .avatar-btn.active {
    transform: scale(1.08);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
  }
</style>
