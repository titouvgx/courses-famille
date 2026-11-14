<script lang="ts">
  // « Ma famille » (#/famille) :
  //   - la famille (renommable par qui la gère) et sa super-famille ;
  //   - les membres, avec passage Membre ↔ Admin pour qui gère (jamais soi-même) ;
  //   - les liens d'invitation de la famille (admin, fondateur, super-admin) ;
  //   - fondateur / super-admin : « Mes familles » (toutes les familles de la
  //     super-famille, membres et invitations de chacune, création jusqu'à 3,
  //     suppression d'une famille vide) ;
  //   - « Retirer » un membre (son compte est supprimé) : jamais soi-même ni le fondateur.
  // Les droits sont vérifiés par la base : l'écran ne fait que montrer les bons boutons.
  import { untrack, tick } from 'svelte'
  import Icon from '../components/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import InviteDialog from '../components/InviteDialog.svelte'
  import { profileState, refreshContext, canInviteInOwnFamily } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { toast } from '../lib/toast.svelte'
  import {
    fetchMembers, setMemberRole, renameFamily, fetchFamilies, countMembers, createFamily,
    revokeInvitation, fetchInvitations, invitationStatus, namesOf, removeMember, deleteFamily,
    type Member, type InvitationStatus,
  } from '../lib/api/famille'
  import type { Family, Invitation } from '../lib/types'

  const FAMILY_LIMIT = 3
  const NAME_MAX = 60

  // ── Contexte ──
  const profile = $derived(profileState.profile)
  const ctx = $derived(profileState.context)
  const family = $derived(ctx?.family ?? null)
  const superFamily = $derived(ctx?.superFamily ?? null)
  const familyId = $derived(family?.id ?? null)
  const superFamilyId = $derived(superFamily?.id ?? null)
  const isFounder = $derived(!!ctx?.isFounder)
  const isSuperAdmin = $derived(!!ctx?.isSuperAdmin)
  /** Admin de la famille, fondateur ou super-admin : invite, renomme, change les rôles */
  const canManage = $derived(!!profile && canInviteInOwnFamily())
  const showFamilies = $derived((isFounder || isSuperAdmin) && !!superFamilyId)

  // ── Données ──
  let members = $state<Member[]>([])
  let membersLoading = $state(true)
  let membersError = $state<string | null>(null)

  let families = $state<Family[]>([])
  let counts = $state<Record<string, number>>({})
  let familiesLoading = $state(false)
  let familiesError = $state<string | null>(null)

  let invites = $state<Invitation[]>([])
  let usedNames = $state<Record<string, string>>({})
  let invitesLoading = $state(false)
  let invitesError = $state<string | null>(null)

  // Numéro du dernier chargement (ignore les réponses d'un chargement dépassé).
  // Pas en $state : lu et écrit dans les fonctions de chargement.
  let loadSeq = 0

  $effect(() => {
    const fid = familyId
    const sf = showFamilies ? superFamilyId : null
    const inv = canManage
    if (!fid) return
    untrack(() => { void loadAll(fid, sf, inv) })
  })

  async function loadAll(fid: string, sf: string | null, inv: boolean) {
    const seq = ++loadSeq
    void loadMembers(fid, seq)
    if (sf) await loadFamilies(sf, seq)
    if (seq !== loadSeq) return
    if (inv) await loadInvites(seq)
  }

  async function loadMembers(fid: string, seq = loadSeq) {
    membersLoading = true
    membersError = null
    try {
      const data = await fetchMembers(fid)
      if (seq === loadSeq) members = data
    } catch (e) {
      if (seq === loadSeq) membersError = messageOf(e, 'Les membres n’ont pas pu être chargés.')
    } finally {
      if (seq === loadSeq) membersLoading = false
    }
  }

  async function loadFamilies(sf: string, seq = loadSeq) {
    familiesLoading = true
    familiesError = null
    try {
      const list = await fetchFamilies(sf)
      const n = await countMembers(list.map((f) => f.id))
      if (seq !== loadSeq) return
      families = list
      counts = n
    } catch (e) {
      if (seq === loadSeq) familiesError = messageOf(e, 'Les familles n’ont pas pu être chargées.')
    } finally {
      if (seq === loadSeq) familiesLoading = false
    }
  }

  /** Liens de sa famille, + ceux des autres familles pour le fondateur. */
  async function loadInvites(seq = loadSeq) {
    if (!familyId) return
    const ids = [...new Set([familyId, ...(showFamilies ? families.map((f) => f.id) : [])])]
    invitesLoading = true
    invitesError = null
    try {
      const list = await fetchInvitations({ familyIds: ids })
      const names = await namesOf(list.map((i) => i.used_by ?? ''))
      if (seq !== loadSeq) return
      invites = list
      usedNames = names
    } catch (e) {
      if (seq === loadSeq) invitesError = messageOf(e, 'Les liens d’invitation n’ont pas pu être chargés.')
    } finally {
      if (seq === loadSeq) invitesLoading = false
    }
  }

  function retryAll() {
    if (familyId) void loadAll(familyId, showFamilies ? superFamilyId : null, canManage)
  }

  // ── Dérivés ──
  const me = $derived(profile?.id ?? null)
  const founderId = $derived(superFamily?.founder_id ?? null)
  const myRoleLabel = $derived(
    isSuperAdmin ? 'Super-admin'
      : isFounder ? 'Fondateur'
        : profile?.role === 'admin' ? 'Admin' : 'Membre',
  )
  const ownInvites = $derived(invites.filter((i) => i.family_id === familyId))
  const invitesByFamily = $derived.by(() => {
    const m: Record<string, Invitation[]> = {}
    for (const i of invites) {
      if (!i.family_id) continue
      ;(m[i.family_id] ??= []).push(i)
    }
    return m
  })
  const limitReached = $derived(!isSuperAdmin && families.length >= FAMILY_LIMIT)

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

  function initialOf(name: string | null | undefined): string {
    return (name ?? '').trim().charAt(0).toUpperCase() || '?'
  }

  function plural(n: number, one: string, many: string): string {
    return `${n} ${n > 1 ? many : one}`
  }

  function statusText(i: Invitation, s: InvitationStatus): string {
    switch (s) {
      case 'valide': return `En attente jusqu’au ${fmtDate(i.expires_at)}`
      case 'utilisee': return `Utilisé par ${(i.used_by && usedNames[i.used_by]) || 'quelqu’un'} le ${fmtDate(i.used_at)}`
      case 'expiree': return `Expiré le ${fmtDate(i.expires_at)}`
      case 'annulee': return 'Annulé'
    }
  }

  const STATUS_TAG: Record<InvitationStatus, string> = {
    valide: 'En attente',
    utilisee: 'Utilisé',
    expiree: 'Expiré',
    annulee: 'Annulé',
  }

  // ── Renommer la famille ──
  let editingName = $state(false)
  let nameDraft = $state('')
  let savingName = $state(false)
  let nameError = $state<string | null>(null)
  let nameInput: HTMLInputElement | undefined = $state()

  async function startRename() {
    nameDraft = family?.name ?? ''
    nameError = null
    editingName = true
    await tick()
    nameInput?.focus()
    nameInput?.select()
  }

  function cancelRename() {
    editingName = false
    nameError = null
  }

  async function saveRename() {
    if (!family || savingName) return
    const name = nameDraft.trim()
    if (!name) {
      nameError = 'Le nom ne peut pas être vide.'
      return
    }
    if (name === family.name) {
      editingName = false
      return
    }
    savingName = true
    nameError = null
    try {
      await renameFamily(family.id, name)
      await refreshContext()
      families = families.map((f) => (f.id === family?.id ? { ...f, name } : f))
      editingName = false
      toast.success('Famille renommée')
    } catch (e) {
      nameError = messageOf(e, 'Le nom n’a pas pu être changé.')
    } finally {
      savingName = false
    }
  }

  // ── Membres des autres familles (fondateur / super-admin), chargés à l'ouverture ──
  let otherMembers = $state<Record<string, Member[]>>({})
  let otherLoading = $state<Record<string, boolean>>({})
  let otherError = $state<Record<string, string | null>>({})
  let membersOpen = $state<Record<string, boolean>>({})

  async function loadOtherMembers(fid: string) {
    otherLoading[fid] = true
    otherError[fid] = null
    try {
      otherMembers[fid] = await fetchMembers(fid)
    } catch (e) {
      otherError[fid] = messageOf(e, 'Les membres n’ont pas pu être chargés.')
    } finally {
      otherLoading[fid] = false
    }
  }

  function toggleMembers(fid: string) {
    membersOpen[fid] = !membersOpen[fid]
    if (membersOpen[fid] && !otherMembers[fid]) void loadOtherMembers(fid)
  }

  function familyNameOf(fid: string): string {
    return families.find((f) => f.id === fid)?.name ?? family?.name ?? 'la famille'
  }

  /** Mêmes règles que la base : jamais soi-même ni le fondateur ; sa famille si on la
   *  gère, les autres familles du groupe pour le fondateur et le super-admin. */
  function canEditMember(m: Member, own: boolean): boolean {
    if (!me || m.id === me || m.id === founderId) return false
    return own ? canManage : isFounder || isSuperAdmin
  }

  /** Applique un changement à la liste où se trouve ce membre. */
  function patchMember(m: Member, change: (list: Member[]) => Member[]) {
    if (m.family_id === familyId) members = change(members)
    const other = otherMembers[m.family_id]
    if (other) otherMembers[m.family_id] = change(other)
  }

  // ── Rôles ──
  let roleTarget = $state<Member | null>(null)
  let savingRole = $state(false)

  async function confirmRole() {
    const m = roleTarget
    if (!m || savingRole) return
    const next = m.role === 'admin' ? 'member' : 'admin'
    savingRole = true
    try {
      await setMemberRole(m.id, next)
      patchMember(m, (list) => list.map((x) => (x.id === m.id ? { ...x, role: next } : x)))
      toast.success(next === 'admin' ? `${m.display_name} est maintenant admin` : `${m.display_name} est maintenant membre`)
      roleTarget = null
    } catch (e) {
      toast.error(messageOf(e, 'Le rôle n’a pas pu être changé.'))
    } finally {
      savingRole = false
    }
  }

  // ── Retirer quelqu'un ──
  let removeTarget = $state<Member | null>(null)
  let removing = $state(false)

  async function confirmRemove() {
    const m = removeTarget
    if (!m || removing) return
    removing = true
    try {
      await removeMember(m.id)
      patchMember(m, (list) => list.filter((x) => x.id !== m.id))
      counts = { ...counts, [m.family_id]: Math.max(0, (counts[m.family_id] ?? 1) - 1) }
      toast.success(`${m.display_name || 'Cette personne'} ne fait plus partie de ${familyNameOf(m.family_id)}`)
      removeTarget = null
      // Ses liens d'invitation ont été supprimés avec son compte
      if (canManage || showFamilies) void loadInvites()
    } catch (e) {
      toast.error(messageOf(e, 'Cette personne n’a pas pu être retirée.'))
    } finally {
      removing = false
    }
  }

  // ── Supprimer une famille vide ──
  let deleteTarget = $state<Family | null>(null)
  let deletingFamily = $state(false)

  async function confirmDeleteFamily() {
    const f = deleteTarget
    if (!f || deletingFamily) return
    deletingFamily = true
    try {
      await deleteFamily(f.id)
      families = families.filter((x) => x.id !== f.id)
      invites = invites.filter((i) => i.family_id !== f.id)
      delete otherMembers[f.id]
      toast.success(`Famille « ${f.name} » supprimée`)
      deleteTarget = null
      await refreshContext()
    } catch (e) {
      toast.error(messageOf(e, 'La famille n’a pas pu être supprimée.'))
    } finally {
      deletingFamily = false
    }
  }

  // ── Invitations ──
  let inviteTarget = $state<{ id: string; name: string } | null>(null)
  let revokeTarget = $state<Invitation | null>(null)
  let revoking = $state(false)
  let showPast = $state<Record<string, boolean>>({})
  let expanded = $state<Record<string, boolean>>({})

  function openInvite(f: { id: string; name: string } | null) {
    if (f) inviteTarget = { id: f.id, name: f.name }
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

  // ── Créer une famille ──
  let creating = $state(false)
  let newFamilyName = $state('')
  let savingFamily = $state(false)
  let createError = $state<string | null>(null)
  let newFamilyInput: HTMLInputElement | undefined = $state()

  async function startCreate() {
    if (limitReached) return
    creating = true
    newFamilyName = ''
    createError = null
    await tick()
    newFamilyInput?.focus()
  }

  async function saveFamily() {
    if (!superFamilyId || savingFamily) return
    const name = newFamilyName.trim()
    if (!name) {
      createError = 'Donne un nom à la famille.'
      return
    }
    savingFamily = true
    createError = null
    try {
      await createFamily(name, superFamilyId)
      await refreshContext()
      await loadFamilies(superFamilyId)
      creating = false
      newFamilyName = ''
      toast.success(`Famille « ${name} » créée. Invite quelqu’un pour en être l’admin.`)
    } catch (e) {
      createError = messageOf(e, 'La famille n’a pas pu être créée.')
    } finally {
      savingFamily = false
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

{#snippet memberRow(m: Member, own: boolean)}
  {@const editable = canEditMember(m, own)}
  <li class="row">
    <span class="avatar" class:avatar-admin={m.role === 'admin'} aria-hidden="true">{initialOf(m.display_name)}</span>
    <span class="row-main">
      <span class="row-name">
        {m.display_name || 'Sans nom'}
        {#if m.id === me}<span class="me">(toi)</span>{/if}
      </span>
      <span class="row-meta">
        <span class="badge" class:badge-admin={m.role === 'admin'}>{m.role === 'admin' ? 'Admin' : 'Membre'}</span>
        {#if m.id === founderId}<span class="badge badge-founder">Fondateur</span>{/if}
      </span>
    </span>
    {#if editable}
      <button
        class="btn btn-row-action"
        onclick={() => (roleTarget = m)}
        aria-label={m.role === 'admin' ? `Passer ${m.display_name} membre` : `Passer ${m.display_name} admin`}
      >
        {m.role === 'admin' ? 'Passer membre' : 'Passer admin'}
      </button>
      <button class="icon-btn icon-danger" onclick={() => (removeTarget = m)} aria-label={`Retirer ${m.display_name} de la famille`}>
        <Icon name="trash" size={18} />
      </button>
    {/if}
  </li>
{/snippet}

{#snippet errorBox(message: string)}
  <div class="state-error" role="alert">
    <p>{message}</p>
    <button class="btn btn-outline btn-small" onclick={retryAll}><Icon name="refresh" size={16} /> Réessayer</button>
  </div>
{/snippet}

{#snippet inviteList(list: Invitation[], key: string, emptyText: string)}
  {@const pending = list.filter((i) => invitationStatus(i) === 'valide')}
  {@const past = list.filter((i) => invitationStatus(i) !== 'valide')}
  {#if list.length === 0}
    <p class="empty">{emptyText}</p>
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
      {#if showPast[key]}
        <ul class="rows past">
          {#each past as inv (inv.id)}
            {@render inviteRow(inv)}
          {/each}
        </ul>
      {/if}
      <button
        class="link-btn"
        aria-expanded={!!showPast[key]}
        onclick={() => (showPast[key] = !showPast[key])}
      >
        <span class="chev" class:open={showPast[key]}><Icon name="chevron-down" size={16} /></span>
        {showPast[key] ? 'Masquer les liens passés' : `Liens passés (${past.length})`}
      </button>
    {/if}
  {/if}
{/snippet}

{#snippet inviteRow(inv: Invitation)}
  {@const s = invitationStatus(inv)}
  <li class="row invite" class:inactive={s !== 'valide'}>
    <span class="row-icon" aria-hidden="true"><Icon name="link" size={18} /></span>
    <span class="row-main">
      <span class="row-name">
        {inv.label || 'Lien sans nom'}
        {#if inv.role}<span class="badge" class:badge-admin={inv.role === 'admin'}>{inv.role === 'admin' ? 'Admin' : 'Membre'}</span>{/if}
      </span>
      <span class="row-meta">
        <span class="status status-{s}">{STATUS_TAG[s]}</span>
        <span>{statusText(inv, s)}</span>
      </span>
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
    <h1>Ma famille</h1>
    <p class="head-sub">Les personnes avec qui tu partages le planning et les courses.</p>
  </header>

  {#if !family}
    {#if profileState.loading || !ctx}
      <div class="card" aria-busy="true">
        <span class="sr-only">Chargement…</span>
        {@render skeleton(2)}
      </div>
    {:else}
      <div class="card state">
        <span class="state-icon"><Icon name="home" size={28} /></span>
        <p class="state-title">Ta famille n’a pas pu être chargée</p>
        <p class="state-text">Vérifie ta connexion puis réessaie.</p>
        <button class="btn btn-outline btn-small" onclick={() => { void refreshContext() }}>
          <Icon name="refresh" size={16} /> Réessayer
        </button>
      </div>
    {/if}
  {:else}
    <!-- ── La famille ── -->
    <section class="family-card" aria-label="Ta famille">
      <div class="family-avatar" aria-hidden="true"><Icon name="home" size={28} /></div>
      <div class="family-info">
        {#if editingName}
          <label class="sr-only" for="fam-name">Nom de la famille</label>
          <input
            id="fam-name"
            class="input name-input"
            class:error={nameError != null}
            aria-invalid={nameError != null}
            aria-describedby={nameError ? 'fam-name-error' : undefined}
            maxlength={NAME_MAX}
            autocomplete="off"
            enterkeyhint="done"
            bind:this={nameInput}
            bind:value={nameDraft}
            disabled={savingName}
            oninput={() => (nameError = null)}
            onkeydown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveRename() }
              else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
            }}
          />
          {#if nameError}<p id="fam-name-error" class="field-error" role="alert">{nameError}</p>{/if}
          <div class="inline-actions">
            <button class="btn btn-outline btn-small" onclick={cancelRename} disabled={savingName}>Annuler</button>
            <button class="btn btn-save btn-small" onclick={saveRename} disabled={savingName} aria-busy={savingName}>
              {savingName ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        {:else}
          <div class="family-name-row">
            <h2 class="family-name">{family.name}</h2>
            {#if canManage}
              <button class="icon-btn" onclick={startRename} aria-label="Renommer la famille">
                <Icon name="pencil" size={18} />
              </button>
            {/if}
          </div>
          {#if superFamily && superFamily.name !== family.name}
            <p class="family-sub">Fait partie de « {superFamily.name} »</p>
          {/if}
          <span class="me-badge">Tu es {myRoleLabel.toLowerCase()}</span>
        {/if}
      </div>
    </section>

    <!-- ── Membres ── -->
    <section class="card" aria-labelledby="members-title">
      <h2 id="members-title" class="section-title">
        <span class="section-icon"><Icon name="users" size={18} /></span>
        Membres
        {#if !membersLoading && !membersError}<span class="count">{members.length}</span>{/if}
      </h2>

      {#if membersLoading && members.length === 0}
        {@render skeleton(3)}
      {:else if membersError}
        {@render errorBox(membersError)}
      {:else if members.length === 0}
        <p class="empty">Personne pour l’instant.</p>
      {:else}
        <ul class="rows">
          {#each members as m (m.id)}
            {@render memberRow(m, true)}
          {/each}
        </ul>
      {/if}
    </section>

    <!-- ── Invitations ── -->
    {#if canManage}
      <section class="card" aria-labelledby="invites-title">
        <h2 id="invites-title" class="section-title">
          <span class="section-icon"><Icon name="link" size={18} /></span> Invitations
        </h2>
        <p class="card-text">
          Un lien par personne : elle crée son compte et arrive directement dans {family.name}.
        </p>
        <button class="btn btn-primary btn-invite" onclick={() => openInvite(family)}>
          <Icon name="user-plus" size={20} /> Inviter quelqu’un
        </button>

        {#if invitesLoading && invites.length === 0}
          {@render skeleton(2)}
        {:else if invitesError}
          {@render errorBox(invitesError)}
        {:else}
          {@render inviteList(ownInvites, 'own', 'Aucun lien créé pour l’instant.')}
        {/if}
      </section>
    {/if}

    <!-- ── Mes familles (fondateur / super-admin) ── -->
    {#if showFamilies}
      <section class="card" aria-labelledby="families-title">
        <h2 id="families-title" class="section-title">
          <span class="section-icon"><Icon name="star" size={18} /></span>
          Mes familles
          {#if !familiesLoading && !familiesError}
            <span class="count">{isSuperAdmin ? families.length : `${families.length}/${FAMILY_LIMIT}`}</span>
          {/if}
        </h2>
        <p class="card-text">
          {isSuperAdmin
            ? 'Les familles de ton groupe. Tu peux inviter dans chacune.'
            : `Tu peux créer jusqu’à ${FAMILY_LIMIT} familles et inviter dans chacune.`}
        </p>

        {#if familiesLoading && families.length === 0}
          {@render skeleton(2)}
        {:else if familiesError}
          {@render errorBox(familiesError)}
        {:else}
          <ul class="fam-list">
            {#each families as f (f.id)}
              {@const isOwn = f.id === familyId}
              {@const n = isOwn && !membersLoading ? members.length : (counts[f.id] ?? 0)}
              {@const links = invitesByFamily[f.id] ?? []}
              {@const pendingCount = links.filter((i) => invitationStatus(i) === 'valide').length}
              <li class="fam">
                <div class="fam-head">
                  <span class="fam-initial" aria-hidden="true">{initialOf(f.name)}</span>
                  <span class="row-main">
                    <span class="row-name">
                      {f.name}
                      {#if isOwn}<span class="badge badge-own">Ta famille</span>{/if}
                    </span>
                    <span class="row-meta">
                      {n === 0 ? 'Aucun membre' : plural(n, 'membre', 'membres')}
                      {#if pendingCount > 0}· {plural(pendingCount, 'lien en attente', 'liens en attente')}{/if}
                    </span>
                  </span>
                  {#if !isOwn}
                    <button class="btn btn-row-action btn-accent" onclick={() => openInvite(f)} aria-label={`Inviter dans ${f.name}`}>
                      <Icon name="user-plus" size={16} /> Inviter
                    </button>
                  {/if}
                </div>
                {#if !isOwn}
                  {#if n === 0 && pendingCount === 0}
                    <p class="fam-hint">Invite son premier admin : il pourra ensuite inviter sa famille.</p>
                  {/if}
                  {#if n > 0}
                    <button
                      class="link-btn fam-toggle"
                      aria-expanded={!!membersOpen[f.id]}
                      aria-controls={`fam-members-${f.id}`}
                      onclick={() => toggleMembers(f.id)}
                    >
                      <span class="chev" class:open={membersOpen[f.id]}><Icon name="chevron-down" size={16} /></span>
                      Membres ({n})
                    </button>
                    {#if membersOpen[f.id]}
                      <div class="fam-links" id={`fam-members-${f.id}`}>
                        {#if otherLoading[f.id] && !otherMembers[f.id]}
                          {@render skeleton(1)}
                        {:else if otherError[f.id]}
                          <div class="state-error" role="alert">
                            <p>{otherError[f.id]}</p>
                            <button class="btn btn-outline btn-small" onclick={() => loadOtherMembers(f.id)}>
                              <Icon name="refresh" size={16} /> Réessayer
                            </button>
                          </div>
                        {:else}
                          <ul class="rows">
                            {#each otherMembers[f.id] ?? [] as m (m.id)}
                              {@render memberRow(m, false)}
                            {/each}
                          </ul>
                        {/if}
                      </div>
                    {/if}
                  {/if}
                  <button
                    class="link-btn fam-toggle"
                    aria-expanded={!!expanded[f.id]}
                    aria-controls={`fam-links-${f.id}`}
                    onclick={() => (expanded[f.id] = !expanded[f.id])}
                  >
                    <span class="chev" class:open={expanded[f.id]}><Icon name="chevron-down" size={16} /></span>
                    Liens d’invitation ({links.length})
                  </button>
                  {#if expanded[f.id]}
                    <div class="fam-links" id={`fam-links-${f.id}`}>
                      {#if invitesLoading && invites.length === 0}
                        {@render skeleton(1)}
                      {:else if invitesError}
                        {@render errorBox(invitesError)}
                      {:else}
                        {@render inviteList(links, f.id, 'Aucun lien pour cette famille.')}
                      {/if}
                    </div>
                  {/if}
                  {#if n === 0 && pendingCount === 0}
                    <button class="link-btn link-danger" onclick={() => (deleteTarget = f)} aria-label={`Supprimer la famille ${f.name}`}>
                      <Icon name="trash" size={16} /> Supprimer cette famille
                    </button>
                  {/if}
                {/if}
              </li>
            {/each}
          </ul>

          {#if creating}
            <div class="create-box">
              <label class="label-text" for="new-family">Nom de la nouvelle famille</label>
              <input
                id="new-family"
                class="input"
                class:error={createError != null}
                aria-invalid={createError != null}
                aria-describedby={createError ? 'new-family-error' : undefined}
                placeholder="Ex : Les Martin"
                maxlength={NAME_MAX}
                autocomplete="off"
                enterkeyhint="done"
                bind:this={newFamilyInput}
                bind:value={newFamilyName}
                disabled={savingFamily}
                oninput={() => (createError = null)}
                onkeydown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); saveFamily() }
                  else if (e.key === 'Escape') { e.preventDefault(); creating = false }
                }}
              />
              {#if createError}<p id="new-family-error" class="field-error" role="alert">{createError}</p>{/if}
              <div class="inline-actions">
                <button class="btn btn-outline btn-small" onclick={() => (creating = false)} disabled={savingFamily}>Annuler</button>
                <button class="btn btn-save btn-small" onclick={saveFamily} disabled={savingFamily} aria-busy={savingFamily}>
                  {savingFamily ? 'Création…' : 'Créer'}
                </button>
              </div>
            </div>
          {:else}
            <button
              class="btn btn-outline btn-create"
              onclick={startCreate}
              disabled={limitReached}
              aria-describedby={limitReached ? 'limit-hint' : undefined}
            >
              <Icon name="plus" size={18} /> Créer une famille
            </button>
            {#if limitReached}
              <p id="limit-hint" class="limit-hint">
                Tu as déjà {FAMILY_LIMIT} familles, le maximum. Pour en ajouter une autre, demande à l’administrateur de l’appli.
              </p>
            {/if}
          {/if}
        {/if}
      </section>
    {/if}
  {/if}
</div>

{#if inviteTarget}
  <InviteDialog
    kind="membre"
    familyId={inviteTarget.id}
    familyName={inviteTarget.name}
    onclose={() => (inviteTarget = null)}
    oncreated={() => { void loadInvites() }}
  />
{/if}

{#if roleTarget}
  {@const toAdmin = roleTarget.role !== 'admin'}
  <ConfirmDialog
    title={toAdmin ? `Passer ${roleTarget.display_name} admin ?` : `Passer ${roleTarget.display_name} membre ?`}
    confirmLabel={toAdmin ? 'Passer admin' : 'Passer membre'}
    busy={savingRole}
    onconfirm={confirmRole}
    oncancel={() => (roleTarget = null)}
  >
    {#if toAdmin}
      Cette personne pourra inviter de nouvelles personnes dans {familyNameOf(roleTarget.family_id)}
      et changer le rôle des autres membres.
    {:else}
      Cette personne ne pourra plus inviter ni gérer les membres. Elle garde l’accès au planning,
      aux courses et aux recettes.
    {/if}
  </ConfirmDialog>
{/if}

{#if removeTarget}
  <ConfirmDialog
    title={`Retirer ${removeTarget.display_name || 'cette personne'} ?`}
    confirmLabel="Retirer"
    cancelLabel="Garder"
    danger
    busy={removing}
    onconfirm={confirmRemove}
    oncancel={() => (removeTarget = null)}
  >
    Son compte sera supprimé : elle ne pourra plus se connecter ni voir {familyNameOf(removeTarget.family_id)}.
    Ses recettes restent dans la famille{removeTarget.role === 'admin' ? ', et les liens qu’elle avait créés ne marcheront plus' : ''}.
    Tu pourras l’inviter à nouveau avec un nouveau lien.
  </ConfirmDialog>
{/if}

{#if deleteTarget}
  <ConfirmDialog
    title={`Supprimer « ${deleteTarget.name} » ?`}
    confirmLabel="Supprimer"
    cancelLabel="Garder"
    danger
    busy={deletingFamily}
    onconfirm={confirmDeleteFamily}
    oncancel={() => (deleteTarget = null)}
  >
    La famille disparaît avec son planning, ses listes, son placard et ses recettes.
    C’est définitif.
  </ConfirmDialog>
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

  /* ── Carte famille ── */
  .family-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 18px;
  }

  .family-avatar {
    width: 60px;
    height: 60px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--accent)));
    color: var(--on-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  .family-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .family-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
  }

  .family-name {
    font-size: 22px;
    color: var(--text);
    overflow-wrap: break-word; /* coupe entre les mots (« Paul / Martin »), pas au milieu */
    min-width: 0;
  }

  .family-sub { font-size: 14px; color: var(--text-secondary); margin-top: -4px; }

  .me-badge {
    align-self: flex-start;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--primary-light);
    color: var(--primary);
  }

  .name-input { min-height: 48px; }

  .icon-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: var(--primary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .icon-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  .icon-danger { color: #FF9A9D; }
  .link-btn.link-danger { color: #FF9A9D; }

  .inline-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
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

  .count {
    margin-left: auto;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .card-text { font-size: 14px; line-height: 1.5; color: var(--text-secondary); margin-top: -4px; }

  .label-text { font-size: 14px; font-weight: 600; color: var(--text-secondary); }

  .empty { font-size: 14px; color: var(--text-secondary); }

  .field-error {
    font-size: 14px;
    line-height: 1.4;
    color: #FFD9DA;
    background: var(--error-bg);
    border: 1px solid color-mix(in srgb, var(--error) 55%, transparent);
    padding: 9px 12px;
    border-radius: var(--radius-md);
  }

  /* ── Lignes (membres, liens) ── */
  .rows { list-style: none; margin: 0; padding: 0; }
  .rows + .rows { margin-top: -6px; }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 60px;
    padding: 8px 0;
  }

  .rows .row + .row { border-top: 1px solid var(--border); }

  .avatar {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--bg-raised);
    border: 1.5px solid var(--border-strong);
    color: var(--text);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-admin {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }

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
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
    overflow-wrap: anywhere;
  }

  .me { font-weight: 500; color: var(--text-secondary); }

  .row-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--bg-raised);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    letter-spacing: 0.01em;
  }

  .badge-admin { background: var(--primary-light); color: var(--primary); border-color: transparent; }
  .badge-founder { background: rgba(255, 107, 53, 0.16); color: #FFB59A; border-color: transparent; }
  .badge-own { background: var(--success-bg); color: var(--success); border-color: transparent; }

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
    color: var(--primary);
    font-size: 14px;
    gap: 6px;
    touch-action: manipulation;
  }

  .btn-cancel { color: #FF9A9D; }

  .btn-accent {
    background: var(--accent);
    border-color: var(--accent);
    color: #FFFFFF;
  }

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

  /* ── Boutons ── */
  .btn-small {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    font-size: 14px;
    touch-action: manipulation;
  }

  .btn-save {
    background: var(--primary);
    color: var(--on-primary);
  }

  .btn-save[aria-busy='true'] { opacity: 0.75; cursor: progress; }
  .btn-small:disabled { opacity: 0.55; }

  .btn-invite { min-height: 52px; padding: 14px; touch-action: manipulation; }

  .btn-create {
    min-height: 48px;
    font-size: 15px;
    touch-action: manipulation;
  }

  .btn-create:disabled { opacity: 0.5; cursor: not-allowed; }

  .limit-hint { font-size: 13px; line-height: 1.45; color: var(--text-secondary); margin-top: -6px; }

  /* ── Mes familles ── */
  .fam-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fam {
    padding: 10px 12px;
    border-radius: 16px;
    background: rgba(9, 24, 50, 0.45);
    border: 1px solid var(--border);
  }

  .fam-head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
  }

  .fam-initial {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fam-hint { margin-top: 6px; font-size: 13px; color: var(--text-secondary); line-height: 1.4; }

  .fam-toggle { margin-top: 2px; }

  /* Membres d'une autre famille : un peu plus serré (la carte est plus étroite) */
  .fam-links .row { gap: 8px; }
  .fam-links .btn-row-action { padding: 0 10px; }

  .fam-links {
    padding-top: 4px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .create-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .create-box .input { min-height: 50px; }

  /* ── États ── */
  .state {
    align-items: center;
    text-align: center;
    gap: 6px;
  }

  .state-icon { color: var(--text-secondary); }
  .state-title { font-weight: 700; font-size: 16px; }
  .state-text { color: var(--text-secondary); font-size: 14px; }

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
    border-radius: 50%;
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
    .icon-btn:hover { background: var(--surface); }
    .btn-row-action:hover { background: var(--surface-hover); }
    .btn-accent:hover { background: var(--accent); opacity: 0.9; }
    .btn-save:hover { opacity: 0.9; }
    .link-btn:hover { text-decoration: underline; }
  }

  @media (min-width: 900px) {
    .back-link { margin-top: calc(24px + env(safe-area-inset-top, 0px)); }
  }
</style>
