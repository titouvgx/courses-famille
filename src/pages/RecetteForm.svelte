<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import { flip } from 'svelte/animate'
  import Icon from '../components/Icon.svelte'
  import ConfirmDialog from '../components/ConfirmDialog.svelte'
  import { toast } from '../lib/toast.svelte'
  import { href, navigate } from '../lib/router.svelte'
  import { auth } from '../lib/auth.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { normalizeText } from '../lib/quantities'
  import {
    fetchRecipe,
    fetchRecipeCategories,
    fetchShoppingCategories,
    fetchKnownIngredients,
    createRecipe,
    updateRecipe,
    type KnownIngredient,
  } from '../lib/api/recipes'
  import {
    compressRecipeImage,
    PhotoError,
    PhotoUploadError,
    recipeImageSrc,
    type CompressedImage,
    type PhotoChange,
  } from '../lib/api/recipeImages'
  import type {
    RecipeCategory,
    ShoppingCategory,
    RecipeFormData,
    RecipeIngredientInput,
    RecipeStepInput,
  } from '../lib/types'

  // Props
  interface Props {
    editId?: string | null
  }
  let { editId = null }: Props = $props()

  const isEdit = $derived(Boolean(editId))

  // ── Lignes du formulaire ──
  // Chaque ligne a une clé stable (`key`) : indispensable pour réordonner
  // sans que Svelte mélange les champs (focus, autocomplétion, animation).
  // La quantité est gardée en texte pour accepter « 1,5 » (virgule française).
  interface IngRow {
    key: number
    id?: string
    qty: string
    unit: string
    name: string
    shopping_category_id: string
  }
  interface StepRow {
    key: number
    id?: string
    instruction: string
  }

  let nextKey = 1
  const newIng = (): IngRow => ({ key: nextKey++, qty: '', unit: '', name: '', shopping_category_id: '' })
  const newStep = (): StepRow => ({ key: nextKey++, instruction: '' })

  // État du formulaire
  let title = $state('')
  let categoryId = $state('')
  let prepTimeMin = $state<number | null>(null)
  let defaultPortions = $state<number | null>(4)
  // Qui voit la recette : sa famille (défaut, le plus prudent) ou toute la super-famille
  let visibility = $state<'famille' | 'super_famille'>('famille')
  const superFamilyName = $derived(profileState.context?.superFamily?.name ?? null)
  let ingredients = $state<IngRow[]>([newIng()])
  let steps = $state<StepRow[]>([newStep()])

  // Photo
  let currentImageUrl = $state<string | null>(null) // photo déjà enregistrée (édition)
  let pendingImage = $state<CompressedImage | null>(null) // nouvelle photo compressée, pas encore envoyée
  let pendingPreviewUrl = $state<string | null>(null)
  let imageRemoved = $state(false)
  let processingPhoto = $state(false)
  let photoInput = $state<HTMLInputElement | null>(null)

  const previewUrl = $derived(pendingPreviewUrl ?? (imageRemoved ? null : currentImageUrl))

  // Données de référence
  let recipeCategories: RecipeCategory[] = $state([])
  let shoppingCategories: ShoppingCategory[] = $state([])
  let knownIngredients: KnownIngredient[] = $state([])

  // Autocomplétion
  let activeAutocomplete = $state<number | null>(null) // clé de la ligne
  let autocompleteResults = $state<KnownIngredient[]>([])
  let acIndex = $state(-1) // suggestion surlignée au clavier

  // UI
  let loading = $state(true)
  let loadError = $state<string | null>(null)
  let reloadKey = $state(0)
  let saving = $state(false)
  let error = $state<string | null>(null) // erreur serveur
  let errors = $state<Record<string, string>>({}) // erreurs par champ
  let announce = $state('') // annonces pour lecteurs d'écran (déplacements)
  let freshFrom = $state(Infinity) // les lignes de clé ≥ freshFrom apparaissent en fondu

  const errorCount = $derived(Object.keys(errors).length)
  const titleMissing = $derived(!title.trim())

  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const flipMs = reduceMotion ? 0 : 220

  // ── Chargement ──
  let loadedFor: string | null = null // évite de recharger (et d'écraser la saisie) si le profil se met à jour

  $effect(() => {
    void reloadKey
    if (profileState.loading) return
    const familyId = profileState.profile?.family_id
    const key = `${editId ?? 'new'}#${reloadKey}`
    if (loadedFor === key) return
    loadedFor = key

    loading = true
    loadError = null
    error = null

    // Requêtes essentielles (catégories + recette en édition)
    const essentialPromises: Promise<any>[] = [
      fetchRecipeCategories(),
      fetchShoppingCategories(),
    ]

    if (editId) {
      essentialPromises.push(fetchRecipe(editId))
    }

    // L'autocomplétion est chargée à part pour ne pas bloquer le formulaire
    if (familyId) {
      fetchKnownIngredients(familyId)
        .then((data) => { knownIngredients = data })
        .catch(() => { /* silencieux : l'autocomplétion sera juste vide */ })
    }

    Promise.all(essentialPromises)
      .then((results) => {
        recipeCategories = results[0]
        shoppingCategories = results[1]

        if (editId && results[2]) {
          const r = results[2]
          if (familyId && r.family_id !== familyId && !profileState.context?.isSuperAdmin) {
            throw new Error('Cette recette appartient à un autre foyer : seul ce foyer peut la modifier.')
          }
          if (r.visibility === 'catalogue' && !profileState.context?.isSuperAdmin) {
            throw new Error('Recette du catalogue commun : elle ne se modifie pas.')
          }
          visibility = r.visibility === 'super_famille' ? 'super_famille' : 'famille'
          title = r.title
          categoryId = r.category_id ?? ''
          prepTimeMin = r.prep_time_min
          defaultPortions = r.default_portions
          currentImageUrl = recipeImageSrc(r.image_url)

          ingredients = r.recipe_ingredients.length > 0
            ? r.recipe_ingredients.map((ing: any) => ({
                key: nextKey++,
                id: ing.id,
                name: ing.name,
                qty: formatQty(ing.quantity),
                unit: ing.unit ?? '',
                shopping_category_id: ing.shopping_category_id ?? '',
              }))
            : [newIng()]

          steps = r.recipe_steps.length > 0
            ? r.recipe_steps.map((s: any) => ({
                key: nextKey++,
                id: s.id,
                instruction: s.instruction,
              }))
            : [newStep()]
        } else if (editId) {
          throw new Error('Recette introuvable.')
        }
        baseline = serialize()
        freshFrom = nextKey
      })
      .catch((e) => {
        loadError = e?.message ?? 'Chargement impossible.'
        loadedFor = null
      })
      .finally(() => {
        loading = false
      })
  })

  // ── Quantités (texte ↔ nombre) ──
  function formatQty(q: number | null | undefined): string {
    return q == null ? '' : String(q).replace('.', ',')
  }

  /** null = vide ; NaN = invalide. Accepte « 1,5 », « 1.5 », « 1/2 ». */
  function parseQty(s: string): number | null {
    const t = s.trim().replace(/\s+/g, '')
    if (!t) return null
    const frac = t.match(/^(\d+)\/(\d+)$/)
    if (frac) {
      const d = Number(frac[2])
      return d > 0 ? Number(frac[1]) / d : NaN
    }
    if (!/^\d*[.,]?\d+$|^\d+[.,]$/.test(t)) return NaN
    return Number(t.replace(',', '.'))
  }

  // ── Modifications non enregistrées ──
  let baseline = $state<string | null>(null)

  function serialize(): string {
    return JSON.stringify({
      t: title.trim(),
      c: categoryId,
      p: prepTimeMin ?? null,
      d: defaultPortions ?? null,
      v: visibility,
      i: ingredients
        .filter((i) => i.name.trim() || i.qty.trim() || i.unit.trim())
        .map((i) => [i.qty.trim(), i.unit.trim(), i.name.trim(), i.shopping_category_id]),
      s: steps.map((s) => s.instruction.trim()).filter(Boolean),
    })
  }

  const dirty = $derived(
    baseline !== null &&
      (serialize() !== baseline || pendingImage !== null || (imageRemoved && currentImageUrl !== null)),
  )

  // ── Autocomplétion ──
  function findKnown(name: string): KnownIngredient | undefined {
    const n = normalizeText(name)
    return n ? knownIngredients.find((ki) => normalizeText(ki.name) === n) : undefined
  }

  function onIngredientInput(row: IngRow) {
    clearErr(`ing-name-${row.key}`)
    const query = normalizeText(row.name)
    acIndex = -1
    if (query.length < 1) {
      closeAutocomplete()
      return
    }

    const starts: KnownIngredient[] = []
    const contains: KnownIngredient[] = []
    for (const ki of knownIngredients) {
      const n = normalizeText(ki.name)
      if (n.startsWith(query)) starts.push(ki)
      else if (n.includes(query)) contains.push(ki)
    }
    const results = [...starts, ...contains].slice(0, 6)

    if (results.length > 0) {
      activeAutocomplete = row.key
      autocompleteResults = results
    } else {
      closeAutocomplete()
    }
  }

  function applyKnown(row: IngRow, ki: KnownIngredient) {
    if (ki.unit && !row.unit) row.unit = ki.unit
    if (ki.shopping_category_id && !row.shopping_category_id) {
      row.shopping_category_id = ki.shopping_category_id
    }
  }

  function selectSuggestion(row: IngRow, suggestion: KnownIngredient) {
    row.name = suggestion.name
    applyKnown(row, suggestion)
    closeAutocomplete()
  }

  function closeAutocomplete() {
    activeAutocomplete = null
    autocompleteResults = []
    acIndex = -1
  }

  function onNameBlur(row: IngRow) {
    // Nom tapé en entier sans passer par la liste : on propose quand même le rayon
    const ki = findKnown(row.name)
    if (ki) applyKnown(row, ki)
    if (activeAutocomplete === row.key) closeAutocomplete()
  }

  // ── Focus ──
  async function focusField(selector: string) {
    await tick()
    const el = document.querySelector<HTMLElement>(selector)
    el?.focus()
  }

  // ── Ingrédients ──
  function addIngredient(focus = true) {
    const row = newIng()
    ingredients.push(row)
    if (focus) focusField(`[data-ing="${row.key}"][data-f="qty"]`)
  }

  function removeIngredient(index: number) {
    const hadFocus = document.activeElement instanceof HTMLButtonElement
    const removed = ingredients[index]
    ingredients.splice(index, 1)
    for (const k of ['qty', 'name']) clearErr(`ing-${k}-${removed.key}`)
    if (ingredients.length === 0) ingredients.push(newIng())
    announce = `Ingrédient ${removed.name.trim() || index + 1} retiré.`
    if (hadFocus) {
      const next = ingredients[Math.min(index, ingredients.length - 1)]
      focusField(`[data-ing="${next.key}"][data-f="del"]`)
    }
  }

  function moveIngredient(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= ingredients.length) return
    const [row] = ingredients.splice(index, 1)
    ingredients.splice(to, 0, row)
    announce = `${row.name.trim() || 'Ingrédient'} : position ${to + 1} sur ${ingredients.length}.`
    keepMoveFocus('ing', row.key, to, ingredients.length, dir)
  }

  /** Après un déplacement, garde le focus sur le bouton (ou l'autre s'il devient inactif). */
  function keepMoveFocus(kind: 'ing' | 'step', key: number, to: number, len: number, dir: -1 | 1) {
    if (!(document.activeElement instanceof HTMLButtonElement)) return
    let f = dir === -1 ? 'up' : 'down'
    if (dir === -1 && to === 0) f = 'down'
    if (dir === 1 && to === len - 1) f = 'up'
    focusField(`[data-${kind}="${key}"][data-f="${f}"]`)
  }

  function onIngKeydown(e: KeyboardEvent, row: IngRow, index: number, field: 'qty' | 'unit' | 'name') {
    // Navigation dans les suggestions
    if (field === 'name' && activeAutocomplete === row.key && autocompleteResults.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = autocompleteResults.length
        acIndex = e.key === 'ArrowDown' ? (acIndex + 1) % n : (acIndex - 1 + n) % n
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        closeAutocomplete()
        return
      }
      if (e.key === 'Enter' && acIndex >= 0) {
        e.preventDefault()
        selectSuggestion(row, autocompleteResults[acIndex])
        return
      }
    }

    if (e.key !== 'Enter' || e.isComposing) return
    e.preventDefault()

    if (field === 'qty') return void focusField(`[data-ing="${row.key}"][data-f="unit"]`)
    if (field === 'unit') return void focusField(`[data-ing="${row.key}"][data-f="name"]`)

    // Entrée dans le nom : ligne suivante, ou nouvel ingrédient si c'était la dernière
    const ki = findKnown(row.name)
    if (ki) applyKnown(row, ki)
    closeAutocomplete()
    const next = ingredients[index + 1]
    if (next) {
      focusField(`[data-ing="${next.key}"][data-f="qty"]`)
    } else if (row.name.trim() || row.qty.trim() || row.unit.trim()) {
      addIngredient()
    } else {
      // Dernière ligne vide : on passe aux étapes plutôt que d'empiler des lignes vides
      focusField(`[data-step="${steps[0].key}"][data-f="text"]`)
    }
  }

  // ── Étapes ──
  function addStep() {
    const row = newStep()
    steps.push(row)
    focusField(`[data-step="${row.key}"][data-f="text"]`)
  }

  function removeStep(index: number) {
    const hadFocus = document.activeElement instanceof HTMLButtonElement
    steps.splice(index, 1)
    if (steps.length === 0) steps.push(newStep())
    announce = `Étape ${index + 1} retirée.`
    if (hadFocus) {
      const next = steps[Math.min(index, steps.length - 1)]
      focusField(`[data-step="${next.key}"][data-f="del"]`)
    }
  }

  function moveStep(index: number, dir: -1 | 1) {
    const to = index + dir
    if (to < 0 || to >= steps.length) return
    const [row] = steps.splice(index, 1)
    steps.splice(to, 0, row)
    announce = `Étape déplacée en position ${to + 1} sur ${steps.length}.`
    keepMoveFocus('step', row.key, to, steps.length, dir)
  }

  /** Zone de texte qui suit la hauteur de son contenu. */
  function autogrow(node: HTMLTextAreaElement, _value: string) {
    const fit = () => {
      const cs = getComputedStyle(node)
      const borders = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
      node.style.height = 'auto'
      node.style.height = `${node.scrollHeight + borders}px`
    }
    fit()
    node.addEventListener('input', fit)
    window.addEventListener('resize', fit)
    return {
      update: fit,
      destroy() {
        node.removeEventListener('input', fit)
        window.removeEventListener('resize', fit)
      },
    }
  }

  // ── Portions ──
  function stepPortions(d: number) {
    const v = Math.round(Number(defaultPortions) || 0) + d
    defaultPortions = Math.min(50, Math.max(1, v))
    clearErr('portions')
  }

  // ── Photo ──
  function setPendingPreview(url: string | null) {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl)
    pendingPreviewUrl = url
  }

  // Si on quitte la page pendant la compression, l'aperçu ne doit pas être créé
  // après coup (sinon son URL ne serait jamais libérée)
  let destroyed = false
  onDestroy(() => {
    destroyed = true
    setPendingPreview(null)
  })

  function pickPhoto() {
    if (processingPhoto || saving) return
    photoInput?.click()
  }

  async function onPhotoSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = '' // permet de re-choisir la même photo
    if (!file) return

    processingPhoto = true
    try {
      const img = await compressRecipeImage(file)
      if (destroyed) return
      pendingImage = img
      setPendingPreview(URL.createObjectURL(img.blob))
      imageRemoved = false
    } catch (err) {
      toast.error(
        err instanceof PhotoError ? err.message : 'Impossible de préparer cette photo. Essaie avec une autre.',
      )
    } finally {
      processingPhoto = false
    }
  }

  function removePhoto() {
    pendingImage = null
    setPendingPreview(null)
    imageRemoved = true
  }

  function photoChange(): PhotoChange {
    if (pendingImage) return { kind: 'replace', image: pendingImage }
    if (imageRemoved && currentImageUrl) return { kind: 'remove' }
    return { kind: 'keep' }
  }

  // ── Validation ──
  function clearErr(key: string) {
    if (key in errors) delete errors[key]
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Donne un titre à la recette.'

    const p = Number(defaultPortions)
    if (defaultPortions == null || !Number.isInteger(p) || p < 1 || p > 50) {
      errs.portions = 'Entre 1 et 50.'
    }
    if (prepTimeMin != null && (!Number.isFinite(prepTimeMin) || prepTimeMin < 0 || prepTimeMin > 600)) {
      errs.prep = 'Entre 0 et 600 min.'
    }

    for (const ing of ingredients) {
      const q = parseQty(ing.qty)
      if (q !== null && Number.isNaN(q)) errs[`ing-qty-${ing.key}`] = 'Quantité invalide (ex : 1,5 ou 1/2).'
      if (!ing.name.trim() && (ing.qty.trim() || ing.unit.trim())) {
        errs[`ing-name-${ing.key}`] = 'Il manque le nom de cet ingrédient.'
      }
    }
    return errs
  }

  async function revealFirstError() {
    await tick()
    const el = document.querySelector<HTMLElement>('.page [aria-invalid="true"]')
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
  }

  // ── Soumission ──
  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (saving || processingPhoto) return

    errors = validate()
    if (errorCount > 0) {
      revealFirstError()
      return
    }

    const validIngredients: RecipeIngredientInput[] = ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        id: i.id,
        name: i.name.trim(),
        quantity: parseQty(i.qty),
        unit: i.unit.trim(),
        shopping_category_id: i.shopping_category_id,
      }))
    const validSteps: RecipeStepInput[] = steps
      .filter((s) => s.instruction.trim())
      .map((s) => ({ id: s.id, instruction: s.instruction }))

    const formData: RecipeFormData = {
      title: title.trim(),
      category_id: categoryId,
      prep_time_min: prepTimeMin,
      default_portions: Number(defaultPortions),
      visibility,
      ingredients: validIngredients,
      steps: validSteps,
    }

    saving = true
    error = null
    const photo = photoChange()

    try {
      if (isEdit && editId) {
        await updateRecipe(editId, formData, photo)
        leaveAllowed = true
        navigate('recette', editId)
      } else {
        const familyId = profileState.profile?.family_id
        const userId = auth.user?.id
        if (!familyId || !userId) {
          error = 'Profil non chargé.'
          saving = false
          return
        }
        const newId = await createRecipe(familyId, userId, formData, photo)
        leaveAllowed = true
        navigate('recette', newId)
      }
    } catch (e: any) {
      if (e instanceof PhotoUploadError) {
        // La recette existe : on y va quand même (pas de doublon en réessayant)
        toast.error(e.message)
        leaveAllowed = true
        navigate('recette', e.recipeId)
        return
      }
      error = e?.message ?? 'Enregistrement impossible.'
      if (e instanceof PhotoError) toast.error(e.message)
      saving = false
    }
  }

  // Entrée dans un champ simple : champ suivant (jamais d'envoi involontaire du formulaire)
  function nextOnEnter(selector: string) {
    return (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return
      e.preventDefault()
      focusField(selector)
    }
  }

  function shoppingCat(id: string): ShoppingCategory | undefined {
    return shoppingCategories.find((s) => s.id === id)
  }

  // ── Protection contre la perte de saisie ──
  // Le routeur écoute `hashchange` sans offrir de garde (et un écouteur `hashchange`
  // ajouté ici passerait APRÈS le sien). On intercepte donc plus tôt, sans le modifier :
  //  1. clics sur les liens « #/… » (onglets, avatar, retour) en phase de capture,
  //     avant que le navigateur ne change l'adresse ;
  //  2. bouton retour du téléphone / navigateur (et changements d'adresse par code) :
  //     `popstate` est émis AVANT `hashchange`. On y remet aussitôt l'adresse du
  //     formulaire : quand le routeur lit l'adresse au `hashchange`, il voit la page
  //     actuelle et ne fait rien. Puis on demande confirmation.
  //  3. rechargement / fermeture de l'onglet : `beforeunload`.
  let leaveAllowed = false
  let leaveAction = $state<(() => void) | null>(null)

  const guardActive = () => dirty && !leaveAllowed
  const routeOf = (h: string) => h.replace(/^#\/?/, '')

  function askLeave(action: () => void) {
    closeAutocomplete()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    leaveAction = action
  }

  function confirmLeave() {
    const action = leaveAction
    leaveAction = null
    leaveAllowed = true
    action?.()
  }

  $effect(() => {
    const onClick = (e: MouseEvent) => {
      if (!guardActive() || e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]')
      const h = a?.getAttribute('href')
      if (!h || !h.startsWith('#') || routeOf(h) === routeOf(location.hash)) return
      e.preventDefault()
      e.stopPropagation()
      askLeave(() => { location.hash = h })
    }

    const formUrl = location.href
    const onPop = () => {
      if (!guardActive() || routeOf(location.hash) === routeOf(new URL(formUrl).hash)) return
      history.pushState(null, '', formUrl)
      // Confirmé : un cran en arrière mène à la page demandée
      // (retour arrière comme changement d'adresse par code).
      askLeave(() => history.back())
    }

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!guardActive()) return
      e.preventDefault()
      e.returnValue = ''
    }

    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  })

  // ── Clavier virtuel ──
  // Pendant la saisie, la barre d'enregistrement s'efface : elle flotterait sinon
  // au-dessus du clavier (ou derrière lui sur iOS) et mangerait la moitié de l'écran.
  let keyboardOpen = $state(false)

  $effect(() => {
    const vv = window.visualViewport
    let editing = false
    const isEditable = (el: Element | null) =>
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit'].includes(el.type))
    const update = () => {
      const gap = vv ? window.innerHeight - vv.height * vv.scale : 0
      keyboardOpen = editing && gap > 150
    }
    const onFocusIn = (e: FocusEvent) => { editing = isEditable(e.target as Element); update() }
    const onFocusOut = () => { editing = false; setTimeout(update, 50) }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    vv?.addEventListener('resize', update)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', update)
    }
  })

  const statusText = $derived.by(() => {
    if (saving) return pendingImage ? 'Envoi de la photo…' : 'Enregistrement…'
    if (errorCount > 0) return `${errorCount} champ${errorCount > 1 ? 's' : ''} à corriger`
    if (titleMissing) return 'Ajoute un titre pour enregistrer'
    if (processingPhoto) return 'Préparation de la photo…'
    if (dirty) return isEdit ? 'Modifications non enregistrées' : 'Brouillon non enregistré'
    return isEdit ? 'Aucune modification' : ''
  })
</script>

<div class="page">
  <a href={isEdit && editId ? href('recette', editId) : href('recettes')} class="back">
    <Icon name="arrow-left" size={20} />
    {isEdit ? 'Retour' : 'Recettes'}
  </a>

  <h1>{isEdit ? 'Modifier la recette' : 'Nouvelle recette'}</h1>

  {#if loading}
    <div class="center-msg"><div class="spinner"></div></div>
  {:else if loadError}
    <div class="card load-error" role="alert">
      <p>{loadError}</p>
      <button type="button" class="btn btn-outline" onclick={() => reloadKey++}>
        <Icon name="refresh" /> Réessayer
      </button>
    </div>
  {:else}
    <form onsubmit={handleSubmit} novalidate>

      <!-- ── Photo ── -->
      <section class="card" aria-labelledby="photo-label">
        <h2 class="section-title" id="photo-label"><Icon name="image" size={18} /> Photo</h2>
        <input
          bind:this={photoInput}
          type="file"
          accept="image/*"
          class="visually-hidden"
          tabindex="-1"
          aria-hidden="true"
          onchange={onPhotoSelected}
        />

        {#if previewUrl}
          <div class="photo-frame">
            <img src={previewUrl} alt={title.trim() || 'Aperçu'} class="photo-img" />
            {#if processingPhoto}
              <div class="photo-busy" role="status">
                <div class="spinner"></div>
                <span>Préparation de la photo…</span>
              </div>
            {/if}
          </div>
          <div class="photo-actions">
            <button
              type="button"
              class="photo-btn"
              onclick={pickPhoto}
              disabled={processingPhoto || saving}
            >
              <Icon name="camera" size={18} /> Changer
            </button>
            <button
              type="button"
              class="photo-btn photo-btn-danger"
              onclick={removePhoto}
              disabled={processingPhoto || saving}
            >
              <Icon name="trash" size={18} /> Retirer
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="photo-frame photo-empty"
            onclick={pickPhoto}
            disabled={processingPhoto || saving}
            aria-describedby="photo-label"
          >
            {#if processingPhoto}
              <div class="spinner"></div>
              <span class="photo-empty-title" role="status">Préparation de la photo…</span>
            {:else}
              <span class="photo-empty-icon"><Icon name="camera" size={28} strokeWidth={1.8} /></span>
              <span class="photo-empty-title">Ajouter une photo</span>
              <span class="photo-empty-sub">Galerie ou appareil photo</span>
            {/if}
          </button>
        {/if}
        <p class="photo-hint">Visible par toute la famille. Évite les visages et les documents.</p>
      </section>

      <!-- ── Infos principales ── -->
      <section class="card" aria-label="Informations">
        <div class="field">
          <label class="label-text" for="rf-title">Titre <span class="req" aria-hidden="true">*</span></label>
          <input
            id="rf-title"
            type="text"
            class="input"
            class:error={errors.title}
            placeholder="Ex : Poulet rôti aux herbes"
            autocapitalize="sentences"
            enterkeyhint="next"
            maxlength="120"
            required
            aria-invalid={errors.title ? 'true' : undefined}
            aria-describedby={errors.title ? 'rf-title-err' : undefined}
            bind:value={title}
            oninput={() => clearErr('title')}
            onkeydown={nextOnEnter('#rf-portions')}
          />
          {#if errors.title}<p class="field-err" id="rf-title-err">{errors.title}</p>{/if}
        </div>

        <div class="field" role="group" aria-labelledby="rf-cat-label">
          <span class="label-text" id="rf-cat-label">Catégorie</span>
          <div class="chip-select">
            <button
              type="button"
              class="chip-option"
              class:selected={categoryId === ''}
              aria-pressed={categoryId === ''}
              onclick={() => (categoryId = '')}
            >Aucune</button>
            {#each recipeCategories as cat (cat.id)}
              <button
                type="button"
                class="chip-option"
                class:selected={categoryId === cat.id}
                aria-pressed={categoryId === cat.id}
                onclick={() => (categoryId = cat.id)}
                style="--cat-color: {cat.color}"
              >{cat.name}</button>
            {/each}
          </div>
        </div>

        <div class="row-2">
          <div class="field">
            <label class="label-text" for="rf-portions"><Icon name="users" size={14} /> Portions</label>
            <div class="stepper" class:error={errors.portions}>
              <button
                type="button"
                class="stepper-btn"
                aria-label="Une portion de moins"
                disabled={(Number(defaultPortions) || 0) <= 1}
                onclick={() => stepPortions(-1)}
              ><Icon name="minus" /></button>
              <input
                id="rf-portions"
                type="number"
                class="stepper-input"
                inputmode="numeric"
                enterkeyhint="next"
                min="1"
                max="50"
                aria-invalid={errors.portions ? 'true' : undefined}
                aria-describedby={errors.portions ? 'rf-portions-err' : undefined}
                bind:value={defaultPortions}
                oninput={() => clearErr('portions')}
                onkeydown={nextOnEnter('#rf-prep')}
              />
              <button
                type="button"
                class="stepper-btn"
                aria-label="Une portion de plus"
                disabled={(Number(defaultPortions) || 0) >= 50}
                onclick={() => stepPortions(1)}
              ><Icon name="plus" /></button>
            </div>
            {#if errors.portions}<p class="field-err" id="rf-portions-err">{errors.portions}</p>{/if}
          </div>
          <div class="field">
            <label class="label-text" for="rf-prep"><Icon name="clock" size={14} /> Temps (min)</label>
            <input
              id="rf-prep"
              type="number"
              class="input"
              class:error={errors.prep}
              inputmode="numeric"
              enterkeyhint="next"
              min="0"
              max="600"
              placeholder="Ex : 45"
              aria-invalid={errors.prep ? 'true' : undefined}
              aria-describedby={errors.prep ? 'rf-prep-err' : undefined}
              bind:value={prepTimeMin}
              oninput={() => clearErr('prep')}
              onkeydown={nextOnEnter(`[data-ing="${ingredients[0]?.key}"][data-f="qty"]`)}
            />
            {#if errors.prep}<p class="field-err" id="rf-prep-err">{errors.prep}</p>{/if}
          </div>
        </div>
      </section>

      <!-- ── Qui peut voir la recette ── -->
      <section class="card" aria-labelledby="rf-vis-title">
        <h2 class="section-title" id="rf-vis-title"><Icon name="users" size={18} /> Qui peut la voir ?</h2>
        <div class="vis-options" role="radiogroup" aria-labelledby="rf-vis-title">
          <label class="vis-option" class:selected={visibility === 'famille'}>
            <input type="radio" name="rf-visibility" value="famille" bind:group={visibility} />
            <span class="vis-text">
              <span class="vis-name">Ma famille seulement</span>
              <span class="vis-hint">Visible par les membres de ta famille.</span>
            </span>
          </label>
          <label class="vis-option" class:selected={visibility === 'super_famille'}>
            <input type="radio" name="rf-visibility" value="super_famille" bind:group={visibility} />
            <span class="vis-text">
              <span class="vis-name">Toutes nos familles</span>
              <span class="vis-hint">
                {superFamilyName ? `Partagée avec toutes les familles de « ${superFamilyName} ».` : 'Partagée avec les autres familles de ton groupe.'}
              </span>
            </span>
          </label>
        </div>
      </section>

      <!-- ── Ingrédients ── -->
      <section class="card" aria-labelledby="rf-ing-title">
        <div class="section-head">
          <h2 class="section-title" id="rf-ing-title">🥕 Ingrédients</h2>
          <span class="count">{ingredients.filter((i) => i.name.trim()).length || ''}</span>
        </div>

        <div class="col-heads" aria-hidden="true">
          <span>Qté</span><span>Unité</span><span>Ingrédient</span>
        </div>

        <ul class="ing-list">
          {#each ingredients as ing, i (ing.key)}
            {@const cat = shoppingCat(ing.shopping_category_id)}
            {@const qtyErr = errors[`ing-qty-${ing.key}`]}
            {@const nameErr = errors[`ing-name-${ing.key}`]}
            <li class="ing" class:fresh={ing.key >= freshFrom} animate:flip={{ duration: flipMs }}>
              <div class="ing-line">
                <input
                  type="text"
                  class="input cell"
                  class:error={qtyErr}
                  placeholder="Qté"
                  inputmode="decimal"
                  enterkeyhint="next"
                  autocomplete="off"
                  aria-label="Quantité, ingrédient {i + 1}"
                  aria-invalid={qtyErr ? 'true' : undefined}
                  aria-describedby={qtyErr ? `rf-ingerr-${ing.key}` : undefined}
                  data-ing={ing.key}
                  data-f="qty"
                  bind:value={ing.qty}
                  oninput={() => clearErr(`ing-qty-${ing.key}`)}
                  onkeydown={(e) => onIngKeydown(e, ing, i, 'qty')}
                />
                <input
                  type="text"
                  class="input cell"
                  placeholder="g, cl…"
                  enterkeyhint="next"
                  autocapitalize="none"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Unité, ingrédient {i + 1}"
                  data-ing={ing.key}
                  data-f="unit"
                  bind:value={ing.unit}
                  onkeydown={(e) => onIngKeydown(e, ing, i, 'unit')}
                />
                <input
                  type="text"
                  class="input cell"
                  class:error={nameErr}
                  placeholder="Ex : beurre"
                  enterkeyhint="next"
                  autocapitalize="none"
                  autocomplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={activeAutocomplete === ing.key}
                  aria-controls="rf-ac-{ing.key}"
                  aria-activedescendant={activeAutocomplete === ing.key && acIndex >= 0 ? `rf-ac-${ing.key}-${acIndex}` : undefined}
                  aria-label="Nom, ingrédient {i + 1}"
                  aria-invalid={nameErr ? 'true' : undefined}
                  aria-describedby={nameErr ? `rf-ingerr-${ing.key}` : undefined}
                  data-ing={ing.key}
                  data-f="name"
                  bind:value={ing.name}
                  oninput={() => onIngredientInput(ing)}
                  onblur={() => onNameBlur(ing)}
                  onkeydown={(e) => onIngKeydown(e, ing, i, 'name')}
                />
                {#if activeAutocomplete === ing.key && autocompleteResults.length > 0}
                  <ul class="autocomplete" id="rf-ac-{ing.key}" role="listbox" aria-label="Suggestions">
                    {#each autocompleteResults as suggestion, s (suggestion.name)}
                      {@const sc = suggestion.shopping_category_id ? shoppingCat(suggestion.shopping_category_id) : undefined}
                      <!-- Clavier géré par le champ (flèches + Entrée, aria-activedescendant) -->
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <li
                        id="rf-ac-{ing.key}-{s}"
                        role="option"
                        aria-selected={s === acIndex}
                        class="autocomplete-item"
                        class:active={s === acIndex}
                        onpointerdown={(e) => e.preventDefault()}
                        onclick={() => selectSuggestion(ing, suggestion)}
                      >
                        {#if sc}<span class="ac-emoji" aria-hidden="true">{sc.icon}</span>{/if}
                        <span class="ac-name">{suggestion.name}</span>
                        {#if suggestion.unit}<span class="ac-unit">{suggestion.unit}</span>{/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              {#if qtyErr || nameErr}
                <p class="field-err" id="rf-ingerr-{ing.key}">{qtyErr ?? nameErr}</p>
              {/if}

              <div class="ing-tools">
                <label class="rayon" class:unset={!cat}>
                  <select
                    class="rayon-select"
                    aria-label="Rayon, ingrédient {i + 1}"
                    bind:value={ing.shopping_category_id}
                  >
                    <option value="">Choisir le rayon</option>
                    {#each shoppingCategories as sc (sc.id)}
                      <option value={sc.id}>{sc.icon} {sc.name}</option>
                    {/each}
                  </select>
                  <span class="rayon-chev" aria-hidden="true"><Icon name="chevron-down" size={16} /></span>
                </label>
                <button
                  type="button"
                  class="tool"
                  aria-label="Monter l'ingrédient {i + 1}"
                  disabled={i === 0}
                  data-ing={ing.key}
                  data-f="up"
                  onclick={() => moveIngredient(i, -1)}
                ><span class="up"><Icon name="chevron-down" size={20} /></span></button>
                <button
                  type="button"
                  class="tool"
                  aria-label="Descendre l'ingrédient {i + 1}"
                  disabled={i === ingredients.length - 1}
                  data-ing={ing.key}
                  data-f="down"
                  onclick={() => moveIngredient(i, 1)}
                ><Icon name="chevron-down" size={20} /></button>
                <button
                  type="button"
                  class="tool tool-del"
                  aria-label="Retirer l'ingrédient {i + 1}"
                  data-ing={ing.key}
                  data-f="del"
                  onclick={() => removeIngredient(i)}
                ><Icon name="trash" size={18} /></button>
              </div>
            </li>
          {/each}
        </ul>

        <button type="button" class="btn-add" onclick={() => addIngredient()}>
          <Icon name="plus" size={18} strokeWidth={2.5} /> Ajouter un ingrédient
        </button>
      </section>

      <!-- ── Étapes ── -->
      <section class="card" aria-labelledby="rf-steps-title">
        <div class="section-head">
          <h2 class="section-title" id="rf-steps-title"><Icon name="list" size={18} /> Étapes</h2>
        </div>

        <ol class="step-list">
          {#each steps as step, i (step.key)}
            <li class="step" class:fresh={step.key >= freshFrom} animate:flip={{ duration: flipMs }}>
              <div class="step-head">
                <span class="step-badge" aria-hidden="true">{i + 1}</span>
                <span class="step-label">Étape {i + 1}</span>
                <button
                  type="button"
                  class="tool"
                  aria-label="Monter l'étape {i + 1}"
                  disabled={i === 0}
                  data-step={step.key}
                  data-f="up"
                  onclick={() => moveStep(i, -1)}
                ><span class="up"><Icon name="chevron-down" size={20} /></span></button>
                <button
                  type="button"
                  class="tool"
                  aria-label="Descendre l'étape {i + 1}"
                  disabled={i === steps.length - 1}
                  data-step={step.key}
                  data-f="down"
                  onclick={() => moveStep(i, 1)}
                ><Icon name="chevron-down" size={20} /></button>
                <button
                  type="button"
                  class="tool tool-del"
                  aria-label="Retirer l'étape {i + 1}"
                  data-step={step.key}
                  data-f="del"
                  onclick={() => removeStep(i)}
                ><Icon name="trash" size={18} /></button>
              </div>
              <textarea
                class="input textarea"
                placeholder={i === 0 ? 'Ex : Préchauffer le four à 200 °C.' : 'Décris cette étape…'}
                rows="2"
                autocapitalize="sentences"
                enterkeyhint="enter"
                aria-label="Étape {i + 1}"
                data-step={step.key}
                data-f="text"
                bind:value={step.instruction}
                use:autogrow={step.instruction}
              ></textarea>
            </li>
          {/each}
        </ol>

        <button type="button" class="btn-add" onclick={addStep}>
          <Icon name="plus" size={18} strokeWidth={2.5} /> Ajouter une étape
        </button>
      </section>

      <!-- ── Barre d'enregistrement ── -->
      <div class="save-bar" class:hidden={keyboardOpen}>
        {#if error}
          <p class="form-error" role="alert">{error}</p>
        {/if}
        <div class="save-row">
          {#if errorCount > 0}
            <button type="button" class="status status-err" onclick={revealFirstError}>
              {statusText}
            </button>
          {:else}
            <p class="status" aria-live="polite">{statusText}</p>
          {/if}
          <button
            type="submit"
            class="btn save-btn"
            class:inactive={titleMissing}
            aria-disabled={titleMissing ? 'true' : undefined}
            disabled={saving || processingPhoto}
          >
            {#if saving}
              <span class="spinner spinner-sm" aria-hidden="true"></span> {pendingImage ? 'Envoi…' : 'Enregistrement…'}
            {:else}
              <Icon name="check" /> {isEdit ? 'Enregistrer' : 'Créer la recette'}
            {/if}
          </button>
        </div>
      </div>
    </form>
  {/if}

  <p class="visually-hidden" aria-live="polite">{announce}</p>
</div>

{#if leaveAction}
  <ConfirmDialog
    title="Quitter sans enregistrer ?"
    confirmLabel="Quitter"
    cancelLabel="Rester"
    danger
    onconfirm={confirmLeave}
    oncancel={() => (leaveAction = null)}
  >
    Tes modifications {isEdit ? 'de cette recette' : 'sur cette nouvelle recette'} seront perdues.
  </ConfirmDialog>
{/if}

<style>
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    padding-bottom: 12px;
    max-width: 640px;
    margin: 0 auto;
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    margin: -6px 0 4px -4px;
    padding: 0 8px 0 4px;
    color: var(--primary);
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    touch-action: manipulation;
  }

  h1 {
    font-size: 28px;
    padding-right: 48px; /* place pour l'avatar */
    margin-bottom: 16px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── Cartes ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 700;
    color: var(--text);
    margin: 0;
  }

  .count {
    min-width: 28px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .count:empty { display: none; }

  /* ── Champs ── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .label-text {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .req { color: var(--accent); }

  /* Qui peut voir la recette */
  .vis-options {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }
  .vis-option {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 44px;
    padding: 12px 14px;
    border: 1.5px solid var(--border);
    border-radius: var(--radius-md, 14px);
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    touch-action: manipulation;
  }
  .vis-option.selected {
    border-color: var(--primary);
    background: rgba(92, 200, 216, 0.12);
  }
  .vis-option input {
    margin-top: 3px;
    width: 18px;
    height: 18px;
    accent-color: var(--primary);
    flex-shrink: 0;
  }
  .vis-option input:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  .vis-text { display: grid; gap: 2px; }
  .vis-name { font-weight: 600; color: var(--text); }
  .vis-hint { font-size: 13px; color: var(--text-secondary); }

  /* Champs : la mise au point fait défiler en gardant de la place
     au-dessus de la barre d'enregistrement et de la barre d'onglets */
  .input,
  .stepper-input,
  .rayon-select {
    scroll-margin: 80px 0 150px;
  }

  .input { padding: 12px 14px; }

  .field-err {
    font-size: 13px;
    font-weight: 600;
    color: #FF8A8E; /* rouge éclairci : lisible sur la photo */
  }

  .row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  /* Pas de flèches des champs nombre : on a le stepper */
  input[type='number'] { -moz-appearance: textfield; appearance: textfield; }
  input[type='number']::-webkit-inner-spin-button,
  input[type='number']::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

  /* ── Stepper portions ── */
  .stepper {
    display: flex;
    align-items: stretch;
    height: 48px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--border-strong);
    background: var(--bg);
    overflow: hidden;
  }

  .stepper:focus-within { border-color: var(--primary); }
  .stepper.error { border-color: var(--error); }

  .stepper-btn {
    flex: 0 0 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--primary);
    cursor: pointer;
    touch-action: manipulation;
  }

  .stepper-btn:disabled { color: var(--text-placeholder); cursor: default; }
  .stepper-btn:active:not(:disabled) { background: var(--primary-light); }
  .stepper-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }

  .stepper-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--text);
    font-family: var(--font-body);
    font-size: 17px;
    font-weight: 700;
    text-align: center;
    outline: none;
  }

  /* ── Chip select (catégories) ── */
  .chip-select {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chip-option {
    min-height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1.5px solid var(--border-strong);
    background: transparent;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
  }

  .chip-option.selected {
    background: var(--primary);
    border-color: var(--primary);
    color: var(--on-primary);
  }

  .chip-option:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* ── Ingrédients ── */
  .col-heads {
    display: grid;
    grid-template-columns: 56px 76px 1fr;
    gap: 6px;
    margin-bottom: -8px;
    padding: 0 2px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .ing-list,
  .step-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .ing {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }

  .ing:first-child { padding-top: 0; }

  .ing-line {
    position: relative;
    display: grid;
    grid-template-columns: 56px 76px 1fr;
    gap: 6px;
  }

  .cell {
    min-width: 0;
    height: 46px;
    padding: 0 9px;
    font-size: 16px; /* ≥ 16 px : pas de zoom automatique sur iOS */
  }

  .ing-tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .rayon {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    height: 44px;
    margin-right: 4px;
    border-radius: 999px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
  }

  .rayon:focus-within { border-color: var(--primary); }

  .rayon-select {
    width: 100%;
    height: 100%;
    min-width: 0;
    padding: 0 30px 0 12px;
    border: none;
    border-radius: inherit;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    outline: none;
    touch-action: manipulation;
  }

  /* L'option choisie affiche l'émoji du rayon + son nom */
  .rayon:not(.unset) .rayon-select { color: var(--text); }
  .rayon.unset { border-style: dashed; }
  .rayon.unset .rayon-select { font-weight: 500; }

  .rayon-select option { background: var(--bg); color: var(--text); }

  .rayon-chev {
    position: absolute;
    right: 10px;
    display: flex;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .tool {
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    touch-action: manipulation;
    transition: background-color 0.15s, color 0.15s, opacity 0.15s;
  }

  .tool:disabled { opacity: 0.28; cursor: default; }
  .tool:active:not(:disabled) { background: var(--surface-hover); color: var(--text); }
  .tool-del:active:not(:disabled) { background: var(--error-bg); color: #FF8A8E; }
  .tool:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }

  .up { display: flex; transform: rotate(180deg); }

  .fresh { animation: row-in 0.22s ease-out; }

  @keyframes row-in {
    from { opacity: 0; transform: translateY(-6px); }
  }

  /* ── Autocomplétion ── */
  .autocomplete {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 30;
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }

  .autocomplete-item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--text);
    font-size: 15px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .autocomplete-item.active,
  .autocomplete-item:active {
    background: var(--primary-light);
  }

  .ac-emoji { font-size: 16px; }
  .ac-name { font-weight: 600; flex: 1; min-width: 0; }
  .ac-unit { color: var(--text-secondary); font-size: 13px; }

  /* ── Étapes ── */
  .step-list { gap: 14px; }

  .step {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .step-head {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .step-badge {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--on-primary);
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .step-label {
    flex: 1;
    margin-left: 8px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .textarea {
    display: block;
    resize: none;
    overflow: hidden;
    min-height: 76px;
    line-height: 1.45;
    font-family: var(--font-body);
  }

  /* ── Ajouter ── */
  .btn-add {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 48px;
    border-radius: var(--radius-lg);
    border: 1.5px dashed var(--border-strong);
    background: transparent;
    color: var(--primary);
    font-size: 15px;
    font-weight: 700;
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.12s, border-color 0.15s;
  }

  .btn-add:active { transform: scale(0.98); }
  .btn-add:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* ── Barre d'enregistrement ── */
  .save-bar {
    position: sticky;
    /* juste au-dessus de la barre d'onglets (56 px + zone de sécurité) */
    bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 8px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
    padding: 8px 8px 8px 14px;
    border-radius: var(--radius-xl);
    background: rgba(9, 24, 50, 0.95);
    border: 1px solid var(--border-strong);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .save-bar.hidden {
    transform: translateY(16px);
    opacity: 0;
    pointer-events: none;
  }

  .save-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 1.3;
    color: var(--text-secondary);
  }

  .status-err {
    min-height: 44px;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    font-family: var(--font-body);
    font-weight: 700;
    color: #FF8A8E;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .save-btn {
    flex: 0 0 auto;
    min-height: 48px;
    padding: 0 18px;
    border-radius: var(--radius-lg);
    background: var(--accent);
    color: #FFFFFF;
    font-size: 15px;
    white-space: nowrap;
    touch-action: manipulation;
    box-shadow: 0 6px 18px var(--accent-shadow);
  }

  .save-btn.inactive,
  .save-btn:disabled {
    background: rgba(255, 255, 255, 0.12);
    color: var(--text-secondary);
    box-shadow: none;
  }

  .save-btn:disabled { cursor: progress; }

  .form-error {
    color: var(--text);
    background: var(--error-bg);
    border: 1px solid rgba(229, 72, 77, 0.5);
    padding: 8px 12px;
    margin-right: 6px;
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .load-error { align-items: flex-start; }
  .load-error p { color: var(--text); }

  /* ── Photo ── */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  .photo-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: var(--radius-lg);
    overflow: hidden;
    background: var(--bg);
  }

  .photo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .photo-busy {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: rgba(9, 24, 50, 0.72);
    color: var(--text);
    font-size: 14px;
    font-weight: 500;
  }

  .photo-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--tap);
    border: 1.5px dashed var(--border-strong);
    background: rgba(16, 38, 74, 0.6);
    color: var(--text-secondary);
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color 0.15s, color 0.15s;
  }

  /* Pas de photo : inutile d'occuper tout le 16/9 sur grand écran */
  .photo-empty { aspect-ratio: auto; height: clamp(150px, 42vw, 220px); }

  .photo-empty:active:not(:disabled) {
    border-color: var(--primary);
    color: var(--primary);
  }

  .photo-empty:disabled {
    cursor: progress;
  }

  .photo-empty:focus-visible,
  .photo-btn:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .photo-empty-icon {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--primary-light);
    color: var(--primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .photo-empty-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .photo-empty-sub {
    font-size: 13px;
  }

  .photo-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .photo-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    border: 1.5px solid var(--primary);
    background: transparent;
    color: var(--primary);
    font-size: 15px;
    font-weight: 600;
    font-family: var(--font-body);
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.12s;
  }

  .photo-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .photo-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .photo-btn-danger {
    border-color: var(--border-strong);
    color: var(--text-secondary);
  }

  .photo-hint {
    margin-top: -4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* ── Survol (souris uniquement) ── */
  @media (hover: hover) and (pointer: fine) {
    .photo-empty:hover:not(:disabled) {
      border-color: var(--primary);
      color: var(--primary);
    }
    .photo-btn-danger:hover:not(:disabled) {
      border-color: var(--error);
      color: var(--error);
    }
    .chip-option:hover:not(.selected) {
      border-color: var(--primary);
      color: var(--primary);
    }
    .tool:hover:not(:disabled) { background: var(--surface-hover); color: var(--text); }
    .tool-del:hover:not(:disabled) { background: var(--error-bg); color: #FF8A8E; }
    .stepper-btn:hover:not(:disabled) { background: var(--primary-light); }
    .autocomplete-item:hover { background: var(--primary-light); }
    .btn-add:hover { border-color: var(--primary); }
    .save-btn:not(.inactive):not(:disabled):hover { opacity: 0.92; }
  }

  /* ── Grand écran : un peu plus d'air ── */
  @media (min-width: 720px) {
    .card { padding: 20px; }
    .col-heads,
    .ing-line { grid-template-columns: 90px 110px 1fr; }
  }

  /* ── Loading ── */
  .center-msg {
    display: flex;
    justify-content: center;
    padding: 48px 16px;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .spinner-sm {
    width: 16px;
    height: 16px;
    border-width: 2px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .save-bar { transition: opacity 0.01s; }
    .save-bar.hidden { transform: none; }
  }
</style>
