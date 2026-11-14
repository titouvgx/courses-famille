<script lang="ts">
  // « Administration » (#/admin), réservée au super-admin :
  //   - liens « fondateur » (création, suivi, annulation) ;
  //   - vue d'ensemble en lecture seule : super-familles, familles, nombre de personnes.
  // La base refuse tout à qui n'est pas super-admin : l'écran ne fait que le dire.
  import { untrack } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import InviteDialog from '../components/InviteDialog.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { toast } from '../lib/toast.svelte'
  import {
    fetchInvitations, revokeInvitation, invitationStatus, namesOf, fetchOverview,
    type InvitationStatus, type SuperFamilyOverview,
  } from '../lib/api/famille'
  import type { Invitation } from '../lib/types'

  const ctx = $derived(profileState.context)
  const isSuperAdmin = $derived(!!ctx?.isSuperAdmin)
  const checking = $derived(!ctx && profileState.loading)

  // ── Liens fondateur ──
  let invites = $state<Invitation[]>([])
  let usedNames = $state<Record<string, string>>({})
  let invitesLoading = $state(true)
  let invitesError = $state<string | null>(null)
  let showPast = $state(false)

  // ── Vue d'ensemble ──
  let overview = $state<SuperFamilyOverview[]>([])
  let overviewLoading = $state(true)
  let overviewError = $state<string | null>(null)

  let inviting = $state(false)
  let revokeTarget = $state<Invitation | null>(null)
  let revoking = $state(false)

  $effect(() => {
    if (!isSuperAdmin) return
    untrack(() => {
      void loadInvites()
      void loadOverview()
    })
  })

  async function loadInvites() {
    invitesLoading = true
    invitesError = null
    try {
      const list = await fetchInvitations({ kind: 'fondateur' })
      usedNames = await namesOf(list.map((i) => i.used_by ?? ''))
      invites = list
    } catch (e) {
      invitesError = messageOf(e, 'Les liens n’ont pas pu être chargés.')
    } finally {
      invitesLoading = false
    }
  }

  async function loadOverview() {
    overviewLoading = true
    overviewError = null
    try {
      overview = await fetchOverview()
    } catch (e) {
      overviewError = messageOf(e, 'La vue d’ensemble n’a pas pu être chargée.')
    } finally {
      overviewLoading = false
    }
  }

  async function confirmRevoke() {
    const inv = revokeTarget
    if (!inv || revoking) return
    revoking = true
    try {
      await revokeInvitation(inv.id)
      const now = new Date().toISOString()
      invites = invites.map((i) => (i.id === inv.id ? { ...i, revoked_at: now } : i))
      toast.success('Lien annulé : il ne marchera plus.')
      revokeTarget = null
    } catch (e) {
      toast.error(messageOf(e, 'Le lien n’a pas pu être annulé.'))
    } finally {
      revoking = false
    }
  }

  // ── Dérivés ──
  const pending = $derived(invites.filter((i) => invitationStatus(i) === 'valide'))
  const past = $derived(invites.filter((i) => invitationStatus(i) !== 'valide'))
  const totalFamilies = $derived(overview.reduce((n, sf) => n + sf.families.length, 0))
  const totalPeople = $derived(
    overview.reduce((n, sf) => n + sf.families.reduce((m, f) => m + f.members, 0), 0),
  )

  // ── Utilitaires ──
  function messageOf(e: unknown, fallback: string): string {
    const m = (e as { message?: unknown } | null)?.message
    if (typeof m !== 'string' || !m.trim()) return fallback
    if (/failed to fetch|network|load failed/i.test(m)) return 'Pas de réseau : réessaie quand tu seras connecté.'
    return m
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric'
    return d.toLocaleDateString('fr-FR', opts)
  }

  function plural(n: number, one: string, many: string): string {
    return `${n} ${n > 1 ? many : one}`
  }

  function initialOf(name: string | null | undefined): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?'
  }

  const STATUS_TAG: Record<InvitationStatus, string> = {
    valide: 'En attente',
    utilisee: 'Utilisé',
    expiree: 'Expiré',
    annulee: 'Annulé',
  }

  function statusText(i: Invitation, s: InvitationStatus): string {
    switch (s) {
      case 'valide': return `En attente jusqu’au ${fmtDate(i.expires_at)}`
      case 'utilisee': return `Utilisé par ${(i.used_by && usedNames[i.used_by]) || 'quelqu’un'} le ${fmtDate(i.used_at)}`
      case 'expiree': return `Expiré le ${fmtDate(i.expires_at)}`
      case 'annulee': return 'Annulé'
    }
  }
</script>

{#snippet skeleton(rows: number)}
  <ul class="rows" aria-hidden="true">
    {#each Array(rows) as _, i (i)}
      <li class="row sk-row" style:animation-delay="{i * 90}ms">
        <span class="sk-dot"></span>
        <span class="sk-body"><span class="sk-line"></span><span class="sk-line sk-short"></span></span>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet errorBox(message: string, retry: () => void)}
  <div class="state-error" role="alert">
    <p>{message}</p>
    <button class="btn btn-outline btn-small" onclick={retry}><Icon name="refresh" size={16} /> Réessayer</button>
  </div>
{/snippet}

{#snippet inviteRow(inv: Invitation)}
  {@const s = invitationStatus(inv)}
  <li class="row" class:inactive={s !== 'valide'}>
    <span class="row-icon" aria-hidden="true"><Icon name="star" size={18} /></span>
    <span class="row-main">
      <span class="row-name">{inv.label || 'Lien sans nom'}</span>
      <span class="row-meta">
        <span class="status status-{s}">{STATUS_TAG[s]}</span>
        <span>{statusText(inv, s)}</span>
      </span>
      <span class="row-meta">Créé le {fmtDate(inv.created_at)}</span>
    </span>
    {#if s === 'valide'}
      <button
        class="btn btn-row-action btn-cancel"
        onclick={() => (revokeTarget = inv)}
        aria-label={`Annuler le lien ${inv.label ? `pour ${inv.label}` : 'sans nom'}`}
      >Annuler</button>
    {/if}
  </li>
{/snippet}

<div class="page">
  <a href={href('compte')} class="back-link"><Icon name="arrow-left" size={18} /> Mon compte</a>

  <header class="head">
    <h1>Administration</h1>
    <p class="head-sub">Les fondateurs et toutes les familles de l’appli.</p>
  </header>

  {#if checking}
    <div class="card" aria-busy="true">
      <span class="sr-only">Chargement…</span>
      {@render skeleton(2)}
    </div>
  {:else if !isSuperAdmin}
    <div class="card state">
      <span class="state-icon"><Icon name="lock" size={28} /></span>
      <p class="state-title">Réservé à l’administrateur</p>
      <p class="state-text">Cette page sert à inviter de nouveaux fondateurs de familles.</p>
      <a href={href('compte')} class="btn btn-outline btn-small">
        <Icon name="arrow-left" size={16} /> Retour à mon compte
      </a>
    </div>
  {:else}
    <!-- ── Liens fondateur ── -->
    <section class="card" aria-labelledby="founders-title">
      <h2 id="founders-title" class="section-title">
        <span class="section-icon"><Icon name="star" size={18} /></span> Fondateurs
      </h2>
      <p class="card-text">
        Un fondateur crée son compte, puis sa famille. Il pourra créer jusqu’à 3 familles et y inviter qui il veut.
      </p>
      <button class="btn btn-primary btn-invite" onclick={() => (inviting = true)}>
        <Icon name="user-plus" size={20} /> Inviter un fondateur
      </button>

      {#if invitesLoading && invites.length === 0}
        {@render skeleton(2)}
      {:else if invitesError}
        {@render errorBox(invitesError, loadInvites)}
      {:else if invites.length === 0}
        <p class="empty">Aucun lien fondateur pour l’instant.</p>
      {:else}
        {#if pending.length === 0}
          <p class="empty">Aucun lien en attente.</p>
        {:else}
          <ul class="rows">
            {#each pending as inv (inv.id)}
              {@render inviteRow(inv)}
            {/each}
          </ul>
        {/if}
        {#if past.length > 0}
          {#if showPast}
            <ul class="rows">
              {#each past as inv (inv.id)}
                {@render inviteRow(inv)}
              {/each}
            </ul>
          {/if}
          <button class="link-btn" aria-expanded={showPast} onclick={() => (showPast = !showPast)}>
            <span class="chev" class:open={showPast}><Icon name="chevron-down" size={16} /></span>
            {showPast ? 'Masquer les liens passés' : `Liens passés (${past.length})`}
          </button>
        {/if}
      {/if}
    </section>

    <!-- ── Vue d'ensemble ── -->
    <section class="card" aria-labelledby="overview-title">
      <h2 id="overview-title" class="section-title">
        <span class="section-icon"><Icon name="users" size={18} /></span> Vue d’ensemble
      </h2>

      {#if overviewLoading && overview.length === 0}
        {@render skeleton(3)}
      {:else if overviewError}
        {@render errorBox(overviewError, loadOverview)}
      {:else}
        <div class="totals">
          <div class="total">
            <span class="total-n">{overview.length}</span>
            <span class="total-l">{overview.length > 1 ? 'groupes' : 'groupe'}</span>
          </div>
          <div class="total">
            <span class="total-n">{totalFamilies}</span>
            <span class="total-l">{totalFamilies > 1 ? 'familles' : 'famille'}</span>
          </div>
          <div class="total">
            <span class="total-n">{totalPeople}</span>
            <span class="total-l">{totalPeople > 1 ? 'personnes' : 'personne'}</span>
          </div>
        </div>

        {#if overview.length === 0}
          <p class="empty">Aucune famille pour l’instant.</p>
        {:else}
          <ul class="sf-list">
            {#each overview as sf (sf.id)}
              {@const people = sf.families.reduce((m, f) => m + f.members, 0)}
              <li class="sf">
                <div class="sf-head">
                  <span class="sf-initial" aria-hidden="true">{initialOf(sf.name)}</span>
                  <span class="row-main">
                    <span class="row-name">{sf.name}</span>
                    <span class="row-meta">
                      {sf.founder_name ? `Fondé par ${sf.founder_name}` : 'Sans fondateur'} · le {fmtDate(sf.created_at)}
                    </span>
                    <span class="row-meta">
                      {plural(sf.families.length, 'famille', 'familles')} · {plural(people, 'personne', 'personnes')}
                    </span>
                  </span>
                </div>
                {#if sf.families.length > 0}
                  <ul class="fam-list">
                    {#each sf.families as f (f.id)}
                      <li class="fam-row">
                        <span class="fam-name">{f.name}</span>
                        <span class="fam-count">{f.members === 0 ? 'Aucun membre' : plural(f.members, 'membre', 'membres')}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>
  {/if}
</div>

{#if inviting}
  <InviteDialog
    kind="fondateur"
    onclose={() => (inviting = false)}
    oncreated={() => { void loadInvites() }}
  />
{/if}

{#if revokeTarget}
  <ConfirmDialog
    title="Annuler ce lien ?"
    confirmLabel="Annuler le lien"
    cancelLabel="Garder"
    danger
    busy={revoking}
    onconfirm={confirmRevoke}
    oncancel={() => (revokeTarget = null)}
  >
    {revokeTarget.label ? `${revokeTarget.label} ne pourra` : 'La personne qui l’a reçu ne pourra'} plus s’en servir
    pour créer son compte. Tu pourras toujours en créer un nouveau.
  </ConfirmDialog>
{/if}

<style>
  .page {
    padding: var(--gutter);
    padding-top: 0;
    max-width: 560px;
    margin: 0 auto;
    padding-bottom: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    min-height: 44px;
    margin-top: calc(8px + env(safe-area-inset-top, 0px));
    color: var(--primary);
    font-weight: 600;
    touch-action: manipulation;
  }

  .head { margin-bottom: 4px; }
  .head h1 {
    font-family: var(--font-display);
    font-size: 28px;
    padding-right: 48px; /* avatar */
  }
  .head-sub { margin-top: 4px; font-size: 15px; color: var(--text-secondary); }

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

  .card-text { font-size: 14px; line-height: 1.5; color: var(--text-secondary); margin-top: -4px; }
  .empty { font-size: 14px; color: var(--text-secondary); }

  .btn-invite { min-height: 52px; padding: 14px; touch-action: manipulation; }

  .btn-small {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    font-size: 14px;
    touch-action: manipulation;
  }

  /* ── Lignes ── */
  .rows { list-style: none; margin: 0; padding: 0; }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 8px 0;
  }

  .rows .row + .row { border-top: 1px solid var(--border); }

  .row-icon {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: var(--primary-light);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .row.inactive .row-icon { background: var(--bg-raised); color: var(--text-secondary); }
  .row.inactive .row-name { color: var(--text-secondary); }

  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .row-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .row-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .status {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .status-valide { background: var(--primary-light); color: var(--primary); }
  .status-utilisee { background: var(--success-bg); color: var(--success); }
  .status-expiree, .status-annulee { background: var(--bg-raised); color: var(--text-secondary); }

  .btn-row-action {
    flex-shrink: 0;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 12px;
    background: var(--bg-raised);
    border: 1.5px solid var(--border-strong);
    font-size: 14px;
    touch-action: manipulation;
  }

  .btn-cancel { color: #FF9A9D; }

  .link-btn {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    min-height: 44px;
    padding: 0 4px;
    margin-left: -4px;
    border: none;
    background: none;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .chev { display: inline-flex; transition: transform 0.2s; }
  .chev.open { transform: rotate(180deg); }

  /* ── Vue d'ensemble ── */
  .totals {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .total {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 12px 6px;
    border-radius: 14px;
    background: rgba(9, 24, 50, 0.45);
    border: 1px solid var(--border);
  }

  .total-n {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 800;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
  }

  .total-l { font-size: 13px; color: var(--text-secondary); }

  .sf-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sf {
    padding: 12px;
    border-radius: 16px;
    background: rgba(9, 24, 50, 0.45);
    border: 1px solid var(--border);
  }

  .sf-head { display: flex; align-items: flex-start; gap: 12px; }

  .sf-initial {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: var(--primary);
    color: var(--on-primary);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fam-list {
    list-style: none;
    margin: 10px 0 0 52px;
    padding: 0;
    border-left: 2px solid var(--border);
  }

  .fam-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0 6px 12px;
    font-size: 14px;
  }

  .fam-name { color: var(--text); font-weight: 600; overflow-wrap: anywhere; min-width: 0; }
  .fam-count { flex-shrink: 0; color: var(--text-secondary); font-variant-numeric: tabular-nums; }

  /* ── États ── */
  .state {
    align-items: center;
    text-align: center;
    gap: 6px;
  }

  .state-icon { color: var(--text-secondary); }
  .state-title { font-weight: 700; font-size: 16px; }
  .state-text { color: var(--text-secondary); font-size: 14px; margin-bottom: 6px; }

  .state-error {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 55%, transparent);
    color: #FFD9DA;
    font-size: 14px;
    line-height: 1.4;
  }

  /* ── Squelettes ── */
  .sk-row { animation: fade-up 0.3s ease-out both; }
  .sk-dot {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
  }
  .sk-body { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .sk-line {
    height: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    animation: sk-pulse 1.2s ease-in-out infinite;
  }
  .sk-short { width: 45%; }

  @keyframes sk-pulse { 50% { opacity: 0.45; } }

  @media (hover: hover) and (pointer: fine) {
    .btn-row-action:hover { background: var(--surface-hover); }
    .link-btn:hover { text-decoration: underline; }
  }

  @media (min-width: 900px) {
    .back-link { margin-top: calc(24px + env(safe-area-inset-top, 0px)); }
  }
</style>
