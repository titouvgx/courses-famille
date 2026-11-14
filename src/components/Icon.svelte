<script lang="ts">
  // Petites icônes au trait, même style que la barre d'onglets.
  // Remplacent les émojis décoratifs (on garde les émojis des rayons et des ingrédients).
  // Usage : <Icon name="clock" /> — la couleur suit le texte (currentColor).
  export type IconName =
    | 'clock' | 'users' | 'sun' | 'moon' | 'calendar' | 'cart' | 'pencil' | 'trash'
    | 'refresh' | 'check' | 'check-circle' | 'list' | 'lock' | 'logout' | 'user'
    | 'book' | 'archive' | 'star' | 'plate' | 'camera' | 'image'
    | 'plus' | 'minus' | 'x' | 'arrow-left' | 'arrow-right' | 'chevron-right' | 'chevron-down'
    | 'grip' | 'chef' | 'mail' | 'eye' | 'eye-off' | 'flame' | 'share' | 'settings' | 'home'
    | 'alert-circle' | 'key'
    | 'link' | 'copy' | 'shield' | 'user-plus'

  interface Props {
    name: IconName
    size?: number
    strokeWidth?: number
    label?: string // si renseigné, l'icône est lue par les lecteurs d'écran
  }

  let { name, size = 18, strokeWidth = 2, label }: Props = $props()
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {#if name === 'clock'}
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  {:else if name === 'users'}
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18.5 14.3c1.8.8 3 2.9 3 5.7" />
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  {:else if name === 'moon'}
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  {:else if name === 'calendar'}
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
  {:else if name === 'cart'}
    <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  {:else if name === 'pencil'}
    <path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14 6l4 4" />
  {:else if name === 'trash'}
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  {:else if name === 'refresh'}
    <path d="M20 11a8 8 0 0 0-14.6-4.5M4 3v4h4" /><path d="M4 13a8 8 0 0 0 14.6 4.5M20 21v-4h-4" />
  {:else if name === 'check'}
    <path d="M5 12.5l4.5 4.5L19 7" />
  {:else if name === 'check-circle'}
    <circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" />
  {:else if name === 'list'}
    <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM9 11h6M9 15h4" />
  {:else if name === 'lock'}
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  {:else if name === 'logout'}
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  {:else if name === 'user'}
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  {:else if name === 'book'}
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  {:else if name === 'archive'}
    <rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
  {:else if name === 'star'}
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  {:else if name === 'plate'}
    <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3.5" />
  {:else if name === 'camera'}
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  {:else if name === 'image'}
    <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" />
    <path d="M21 16l-5-5-9 9" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'minus'}
    <path d="M5 12h14" />
  {:else if name === 'x'}
    <path d="M18 6 6 18M6 6l12 12" />
  {:else if name === 'arrow-left'}
    <path d="M19 12H5M11 18l-6-6 6-6" />
  {:else if name === 'arrow-right'}
    <path d="M5 12h14M13 6l6 6-6 6" />
  {:else if name === 'chevron-right'}
    <path d="m9 18 6-6-6-6" />
  {:else if name === 'chevron-down'}
    <path d="m6 9 6 6 6-6" />
  {:else if name === 'grip'}
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3" />
  {:else if name === 'chef'}
    <path d="M6 13.5V20h12v-6.5" /><path d="M6 13.5a4 4 0 1 1 2.2-7.4A4.5 4.5 0 0 1 16 5.6a4 4 0 1 1 2 7.9" /><path d="M6 17h12" />
  {:else if name === 'mail'}
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
  {:else if name === 'eye'}
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
  {:else if name === 'eye-off'}
    <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  {:else if name === 'flame'}
    <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 1.5.8 2.5 2 2.5-1-3 0-5.5 1-8z" />
  {:else if name === 'share'}
    <circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  {:else if name === 'home'}
    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
  {:else if name === 'link'}
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
  {:else if name === 'copy'}
    <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  {:else if name === 'shield'}
    <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" />
  {:else if name === 'user-plus'}
    <circle cx="10" cy="8" r="4" /><path d="M3 21c0-4.4 3.1-7 7-7 1.4 0 2.7.3 3.8.9" /><path d="M19 15v6M16 18h6" />
  {:else if name === 'alert-circle'}
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" />
  {:else if name === 'key'}
    <circle cx="7.5" cy="15.5" r="3.5" /><path d="m10 13 9.5-9.5M16 7l2.5 2.5M13.5 9.5l2 2" />
  {/if}
</svg>

<style>
  .icon {
    display: inline-block;
    flex-shrink: 0;
    vertical-align: -0.18em;
  }
</style>
