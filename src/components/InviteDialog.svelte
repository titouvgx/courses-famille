<script lang="ts">
  // Fenêtre « Inviter » : crée un lien d'invitation à usage unique.
  //   Étape 1 : rôle (invitation « membre ») + « Pour qui ? » (facultatif)
  //   Étape 2 : le lien, à copier ou partager TOUT DE SUITE
  // Le jeton n'est renvoyé qu'à la création (la base ne garde que son empreinte) :
  // une fois la fenêtre fermée, le lien ne peut plus être réaffiché.
  import { onMount, onDestroy, tick } from 'svelte'
  import Icon from './Icon.svelte'
  import { toast } from '../lib/toast.svelte'
  import { createInvitation, INVITATION_DAYS, type NewInvitation } from '../lib/api/famille'

  interface Props {
    kind: 'fondateur' | 'membre'
    /** Famille où inviter (obligatoire pour kind = 'membre') */
    familyId?: string
    familyName?: string
    onclose: () => void
    /** Un lien vient d'être créé : recharger la liste des liens */
    oncreated?: () => void
  }
  let { kind, familyId, familyName, onclose, oncreated }: Props = $props()

  const LABEL_MAX = 60

  let step = $state<'choix' | 'lien'>('choix')
  let role = $state<'member' | 'admin'>('member')
  let label = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let invitation = $state<NewInvitation | null>(null)
  /** Lien copié ou partagé au moins une fois */
  let sent = $state(false)
  let copied = $state(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  let dialogEl: HTMLDivElement | undefined = $state()
  let linkEl: HTMLInputElement | undefined = $state()
  let copyBtn: HTMLButtonElement | undefined = $state()

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  onMount(() => {
    document.body.style.overflow = 'hidden'
    dialogEl?.focus()
  })
  onDestroy(() => {
    document.body.style.overflow = ''
    clearTimeout(copiedTimer)
  })

  const title = $derived(
    step === 'lien'
      ? 'Ton lien est prêt'
      : kind === 'fondateur'
        ? 'Inviter un fondateur'
        : familyName
          ? `Inviter dans ${familyName}`
          : 'Inviter quelqu’un',
  )

  const expiresLabel = $derived(
    invitation
      ? new Date(invitation.expires_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      : '',
  )

  const shareText = $derived(invitation ? `Rejoins-moi sur Madéo : ${invitation.url}` : '')

  function messageOf(e: unknown, fallback: string): string {
    const m = (e as { message?: unknown } | null)?.message
    if (typeof m !== 'string' || !m.trim()) return fallback
    if (/failed to fetch|network|load failed/i.test(m)) return 'Pas de réseau : réessaie quand tu seras connecté.'
    return m
  }

  async function create() {
    if (busy) return
    if (kind === 'membre' && !familyId) {
      error = 'Famille introuvable : ferme la fenêtre et réessaie.'
      return
    }
    busy = true
    error = null
    try {
      invitation = await createInvitation(kind, {
        familyId: kind === 'membre' ? familyId : undefined,
        role: kind === 'membre' ? role : undefined,
        label: label.trim() || undefined,
      })
      step = 'lien'
      oncreated?.()
      await tick()
      copyBtn?.focus()
    } catch (e) {
      error = messageOf(e, 'Le lien n’a pas pu être créé. Réessaie dans un instant.')
    } finally {
      busy = false
    }
  }

  /** Copie avec repli (anciens navigateurs, contexte non sécurisé). */
  async function writeClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // refusé : on tente le repli
    }
    try {
      linkEl?.focus()
      linkEl?.select()
      linkEl?.setSelectionRange(0, linkEl.value.length)
      const doc = document as Document & { execCommand?: (cmd: string) => boolean }
      return !!doc.execCommand?.('copy')
    } catch {
      return false
    }
  }

  async function copy() {
    if (!invitation) return
    const ok = await writeClipboard(invitation.url)
    if (ok) {
      sent = true
      copied = true
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied = false), 2500)
      toast.success('Lien copié')
    } else {
      // Le lien reste sélectionné dans le champ : copie à la main
      linkEl?.focus()
      linkEl?.select()
      toast.info('Copie impossible ici : sélectionne le lien et copie-le à la main.')
    }
  }

  async function share() {
    if (!invitation) return
    if (!canShare) {
      await copy()
      return
    }
    try {
      await navigator.share({ title: 'Madéo', text: shareText })
      sent = true
    } catch (e) {
      // Partage annulé par la personne : rien à dire
      if ((e as { name?: string } | null)?.name === 'AbortError') return
      await copy()
    }
  }

  function close() {
    if (busy) return
    onclose()
  }

  // Clic à côté : à l'étape 2, seulement si le lien a déjà été copié ou partagé
  // (sinon un appui de travers ferait perdre le lien pour de bon).
  function onOverlay() {
    if (busy) return
    if (step === 'lien' && !sent) return
    onclose()
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="iv-overlay" onclick={onOverlay}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="iv"
    bind:this={dialogEl}
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    aria-labelledby="iv-title"
    aria-describedby="iv-sub"
    onclick={(e) => e.stopPropagation()}
  >
    <header class="iv-header">
      <div class="iv-titles">
        <h2 id="iv-title">{title}</h2>
        <p id="iv-sub" class="iv-sub">
          {#if step === 'lien'}
            Envoie-le maintenant, par message ou par e-mail.
          {:else if kind === 'fondateur'}
            Un lien pour lancer une nouvelle famille.
          {:else}
            Un lien à envoyer, valable {INVITATION_DAYS} jours.
          {/if}
        </p>
      </div>
      <button class="iv-close" onclick={close} aria-label="Fermer" disabled={busy}>
        <Icon name="x" size={18} strokeWidth={2.5} />
      </button>
    </header>

    <div class="iv-scroll">
      {#if step === 'choix'}
        {#if kind === 'membre'}
          <fieldset class="roles">
            <legend class="field-label">Son rôle</legend>
            <label class="role" class:on={role === 'member'}>
              <input type="radio" name="iv-role" value="member" bind:group={role} disabled={busy} />
              <span class="role-icon" aria-hidden="true"><Icon name="user" size={20} /></span>
              <span class="role-text">
                <span class="role-name">Membre</span>
                <span class="role-desc">Planifie les repas, coche les courses, crée des recettes.</span>
              </span>
              <span class="role-dot" aria-hidden="true"></span>
            </label>
            <label class="role" class:on={role === 'admin'}>
              <input type="radio" name="iv-role" value="admin" bind:group={role} disabled={busy} />
              <span class="role-icon" aria-hidden="true"><Icon name="shield" size={20} /></span>
              <span class="role-text">
                <span class="role-name">Admin</span>
                <span class="role-desc">Peut en plus inviter et gérer les membres de la famille.</span>
              </span>
              <span class="role-dot" aria-hidden="true"></span>
            </label>
          </fieldset>
        {:else}
          <div class="explain">
            <span class="explain-icon" aria-hidden="true"><Icon name="star" size={22} /></span>
            <p>
              La personne crée son compte, puis sa famille. Elle en sera la <strong>fondatrice</strong> :
              elle pourra créer jusqu’à 3 familles et y inviter qui elle veut.
            </p>
          </div>
        {/if}

        <div class="field">
          <label class="field-label" for="iv-label">Pour qui ? <span class="optional">(facultatif)</span></label>
          <input
            id="iv-label"
            class="input"
            type="text"
            placeholder="Ex : Marie"
            maxlength={LABEL_MAX}
            autocomplete="off"
            enterkeyhint="go"
            aria-describedby="iv-label-hint"
            bind:value={label}
            disabled={busy}
            onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create() } }}
          />
          <p id="iv-label-hint" class="hint">Juste pour toi : pour reconnaître ce lien dans la liste.</p>
        </div>

        {#if error}<p class="iv-error" role="alert">{error}</p>{/if}
      {:else if invitation}
        <div class="field">
          <label class="field-label" for="iv-link">Lien d’invitation</label>
          <div class="link-box">
            <span class="link-icon" aria-hidden="true"><Icon name="link" size={18} /></span>
            <input
              id="iv-link"
              class="input link-input"
              type="text"
              readonly
              value={invitation.url}
              bind:this={linkEl}
              onfocus={(e) => e.currentTarget.select()}
            />
          </div>
        </div>

        <div class="link-actions">
          <button class="btn act act-copy" class:done={copied} bind:this={copyBtn} onclick={copy}>
            <Icon name={copied ? 'check' : 'copy'} size={18} />
            {copied ? 'Copié' : 'Copier'}
          </button>
          <button class="btn act act-share" onclick={share}>
            <Icon name="share" size={18} /> Partager
          </button>
        </div>

        <div class="notice" role="note">
          <Icon name="clock" size={18} />
          <p>
            Valable {INVITATION_DAYS} jours, une seule fois. Il ne sera plus affiché ensuite :
            partage-le maintenant.
            <span class="notice-date">Expire le {expiresLabel}.</span>
          </p>
        </div>
      {/if}
    </div>

    <div class="iv-actions">
      {#if step === 'choix'}
        <button class="btn btn-primary" onclick={create} disabled={busy} aria-busy={busy}>
          <Icon name="link" size={18} />
          {busy ? 'Création…' : 'Créer le lien'}
        </button>
      {:else}
        <button class="btn btn-done" onclick={close}>Terminer</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .iv-overlay {
    position: fixed;
    inset: 0;
    z-index: 200; /* au-dessus de la barre d'onglets (100) */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    padding-top: max(16px, env(safe-area-inset-top, 0px));
    padding-bottom: max(16px, env(safe-area-inset-bottom, 0px));
    background: rgba(2, 8, 22, 0.66);
    animation: fade 0.2s ease-out;
  }

  .iv {
    width: min(440px, 100%);
    max-height: min(88svh, 720px);
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 22px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.15);
    outline: none;
  }

  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(0.92) translateY(12px); } }

  /* ── En-tête ── */
  .iv-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 18px 12px;
  }

  .iv-titles { min-width: 0; }
  .iv-header h2 { font-size: 21px; color: var(--text); overflow-wrap: anywhere; }
  .iv-sub { margin-top: 2px; font-size: 14px; color: var(--text-secondary); }

  .iv-close {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    margin: -6px -6px 0 0;
    border-radius: 50%;
    border: none;
    background: var(--surface);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
  }

  .iv-close:disabled { opacity: 0.5; }

  .iv-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding: 0 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .field { display: flex; flex-direction: column; gap: 6px; }

  .field-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .optional { font-weight: 500; }

  .hint { font-size: 13px; color: var(--text-secondary); }

  .input { min-height: 50px; }

  /* ── Choix du rôle ── */
  .roles {
    margin: 0;
    padding: 0;
    border: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .roles legend { padding: 0; margin-bottom: 6px; }

  .role {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 72px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1.5px solid var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color 0.15s, background-color 0.15s;
  }

  .role.on {
    border-color: var(--primary);
    background: var(--primary-light);
  }

  .role input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  .role:has(input:focus-visible) { outline: 2px solid var(--primary); outline-offset: 2px; }

  .role-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    color: var(--text-secondary);
  }

  .role.on .role-icon { background: var(--primary); color: var(--on-primary); }

  .role-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .role-name { font-weight: 700; font-size: 16px; color: var(--text); }
  .role-desc { font-size: 13px; line-height: 1.35; color: var(--text-secondary); }

  .role-dot {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 2px solid var(--border-strong);
    position: relative;
  }

  .role.on .role-dot { border-color: var(--primary); }

  .role-dot::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--primary);
    transform: scale(0);
    transition: transform 0.15s;
  }

  .role.on .role-dot::after { transform: scale(1); }

  /* ── Fondateur ── */
  .explain {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px;
    border-radius: 14px;
    background: var(--primary-light);
    color: var(--text);
    font-size: 15px;
    line-height: 1.45;
  }

  .explain-icon { color: var(--primary); flex-shrink: 0; margin-top: 1px; }

  /* ── Lien ── */
  .link-box { position: relative; }

  .link-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--primary);
    pointer-events: none;
  }

  .link-input {
    padding-left: 42px;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    color: var(--text);
    text-overflow: ellipsis;
    user-select: all;
    -webkit-user-select: all;
  }

  .link-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .act {
    min-height: 52px;
    border-radius: var(--radius-lg);
    font-size: 15px;
    touch-action: manipulation;
  }

  .act-copy {
    background: var(--primary);
    color: var(--on-primary);
  }

  .act-copy.done {
    background: var(--success);
    color: var(--on-success);
  }

  .act-share {
    background: var(--accent);
    color: #FFFFFF;
  }

  .notice {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 14px;
    background: rgba(255, 107, 53, 0.12);
    border: 1px solid rgba(255, 107, 53, 0.35);
    color: #FFD2BF;
    font-size: 14px;
    line-height: 1.45;
  }

  .notice :global(.icon) { margin-top: 1px; color: var(--accent); }
  .notice-date { display: block; margin-top: 4px; color: var(--text-secondary); }

  .iv-error {
    font-size: 14px;
    line-height: 1.4;
    color: #FFD9DA;
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 55%, transparent);
    padding: 9px 12px;
    border-radius: var(--radius-md);
  }

  /* ── Bas de fenêtre ── */
  .iv-actions {
    padding: 12px 18px 18px;
    border-top: 1px solid var(--border);
  }

  .iv-actions .btn-primary { min-height: 52px; padding: 14px; touch-action: manipulation; }
  .iv-actions .btn-primary[aria-busy='true'] { cursor: progress; }

  .btn-done {
    width: 100%;
    min-height: 52px;
    border-radius: var(--radius-lg);
    background: var(--surface);
    color: var(--text);
    border: 1.5px solid var(--border-strong);
    touch-action: manipulation;
  }

  @media (hover: hover) and (pointer: fine) {
    .iv-close:hover { background: var(--surface-hover); }
    .role:hover { border-color: var(--primary); }
    .act:hover, .btn-done:hover { opacity: 0.9; }
  }
</style>
