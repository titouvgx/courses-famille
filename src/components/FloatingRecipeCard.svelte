<script lang="ts">
  import Icon from './Icon.svelte'
  // Carte recette « flottante » de la page d'accueil.
  // Couches imbriquées, chacune avec UNE seule transformation,
  // pour que les animations ne se marchent pas dessus :
  //   .slot     → position + parallaxe (souris uniquement)
  //   .drift-x  → va-et-vient horizontal  ┐ trois durées différentes :
  //   .drift-y  → va-et-vient vertical    ├ la trajectoire ne se répète
  //   .drift-r  → balancement (rotation)  ┘ jamais, ça paraît « vivant »
  //   .card     → apparition + appui / survol
  import { href } from '../lib/router.svelte'
  import { sizedImage } from '../lib/images'
  import type { FloatSlot } from '../lib/floatLayout'
  import type { RecipeWithCategory } from '../lib/types'

  interface Props {
    slot: FloatSlot
    index: number
    /** null = carte fantôme pendant le chargement */
    recipe: RecipeWithCategory | null
    featured?: boolean
  }

  let { slot, index, recipe, featured = false }: Props = $props()

  const imgSrc = $derived(
    recipe?.image_url ? sizedImage(recipe.image_url, slot.w, slot.h) : null,
  )

  function formatTime(min: number | null): string {
    if (!min) return ''
    if (min < 60) return `${min} min`
    const h = Math.floor(min / 60)
    const m = min % 60
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
  }
</script>

<div
  class="slot"
  style:left="{slot.x}px"
  style:top="{slot.y}px"
  style:width="{slot.w}px"
  style:height="{slot.h}px"
  style:--depth={slot.depth}
>
  <div class="drift-x" style:--dx="{slot.dx}px" style:--dur="{slot.durX}s" style:--delay="{slot.delayX}s">
  <div class="drift-y" style:--dy="{slot.dy}px" style:--dur="{slot.durY}s" style:--delay="{slot.delayY}s">
  <div
    class="drift-r"
    style:--rot="{slot.rot}deg"
    style:--wob="{slot.wobble}deg"
    style:--dur="{slot.durR}s"
    style:--delay="{slot.delayR}s"
  >
    {#if recipe}
      <a
        href={href('recette', recipe.id)}
        class="card"
        style:--i={index}
        style:--cat={recipe.recipe_categories?.color ?? 'var(--primary)'}
        aria-label="{recipe.title}{recipe.prep_time_min ? `, ${formatTime(recipe.prep_time_min)}` : ''}"
      >
        {#if imgSrc}
          <img
            src={imgSrc}
            alt=""
            class="card-img"
            width={slot.w}
            height={slot.h}
            decoding="async"
            draggable="false"
          />
        {:else}
          <!-- Pas de photo : grande initiale graphique plutôt qu'un émoji -->
          <span class="card-monogram" aria-hidden="true">{recipe.title.trim().charAt(0)}</span>
        {/if}

        {#if featured}
          <span class="sticker" aria-hidden="true"><Icon name="star" size={12} strokeWidth={2.5} /><span class="sticker-label">Coup de cœur</span></span>
        {/if}

        <div class="card-overlay" aria-hidden="true">
          {#if recipe.recipe_categories}
            <span class="card-badge">{recipe.recipe_categories.name}</span>
          {/if}
          <span class="card-title">{recipe.title}</span>
          {#if recipe.prep_time_min}
            <span class="card-meta"><Icon name="clock" size={12} /> {formatTime(recipe.prep_time_min)}</span>
          {/if}
        </div>
      </a>
    {:else}
      <div class="card skeleton" style:--i={index} aria-hidden="true"></div>
    {/if}
  </div>
  </div>
  </div>
</div>

<style>
  /* ── Couche 1 : position + parallaxe ── */
  .slot {
    position: absolute;
    transform: translate3d(
      calc(var(--px, 0) * var(--depth) * 8px),
      calc(var(--py, 0) * var(--depth) * 6px),
      0
    );
    transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  /* La carte appuyée / survolée passe devant les autres */
  .slot:hover,
  .slot:focus-within,
  .slot:active {
    z-index: 3;
  }

  /* ── Couches 2 à 4 : flottement continu ──
     Chaque couche fait un aller-retour simple (alternate) sur un seul axe,
     avec sa propre durée. Combinés, ça donne un mouvement irrégulier. */
  .drift-x,
  .drift-y,
  .drift-r {
    width: 100%;
    height: 100%;
    animation-duration: var(--dur);
    animation-delay: var(--delay);
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    animation-direction: alternate;
    will-change: transform;
  }

  .drift-x { animation-name: drift-x; }
  .drift-y { animation-name: drift-y; }
  .drift-r { animation-name: drift-r; transform: rotate(var(--rot)); }

  @keyframes drift-x {
    from { transform: translate3d(calc(var(--dx) * -1), 0, 0); }
    to   { transform: translate3d(var(--dx), 0, 0); }
  }

  @keyframes drift-y {
    from { transform: translate3d(0, calc(var(--dy) * -1), 0); }
    to   { transform: translate3d(0, var(--dy), 0); }
  }

  @keyframes drift-r {
    from { transform: rotate(calc(var(--rot) - var(--wob))); }
    to   { transform: rotate(calc(var(--rot) + var(--wob))); }
  }

  /* ── Couche 5 : la carte ── */
  .card {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 20px;
    overflow: hidden;
    background: linear-gradient(145deg, color-mix(in srgb, var(--cat) 40%, var(--surface)), var(--surface));
    box-shadow:
      0 10px 24px -8px rgba(0, 0, 0, 0.3),
      0 0 0 3px var(--bg-raised);
    color: white;
    text-decoration: none;
    animation: pop-in 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) calc(var(--i) * 90ms + 80ms) backwards;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
    /* Mobile : pas de menu « enregistrer l'image » ni de sélection au appui long */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    /* Les textes s'adaptent à la taille de LA CARTE, pas de l'écran */
    container-type: inline-size;
  }

  /* Retour visuel au doigt (fonctionne aussi sur iOS grâce à touch-action) */
  .card:active {
    transform: scale(0.94);
    transition-duration: 0.08s;
  }

  /* Survol : uniquement avec une vraie souris, sinon l'effet « colle » sur mobile */
  @media (hover: hover) and (pointer: fine) {
    .card:hover {
      transform: scale(1.06);
      box-shadow:
        0 18px 36px -10px rgba(0, 0, 0, 0.35),
        0 0 0 3px var(--accent);
    }

    .card:hover .card-img {
      transform: scale(1.08);
    }
  }

  .card:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 3px;
  }

  @keyframes pop-in {
    from { opacity: 0; transform: scale(0.5) translate3d(0, 30px, 0); }
    to   { opacity: 1; transform: scale(1) translate3d(0, 0, 0); }
  }

  .card-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s ease-out;
    pointer-events: none;
  }

  .card-monogram {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 10cqw;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 52cqw; /* proportionnelle à la largeur de la carte */
    line-height: 1;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 6px 6px 0 rgba(0, 0, 0, 0.18);
    /* fines rayures diagonales derrière la lettre */
    background:
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.08) 0 10px, transparent 10px 20px),
      linear-gradient(150deg, var(--cat), color-mix(in srgb, var(--cat) 55%, #000));
  }

  .card-overlay {
    position: absolute;
    inset: auto 0 0 0;
    padding: 32px 10px 10px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.45) 55%, transparent 100%);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .card-badge {
    align-self: flex-start;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--cat);
  }

  .card-title {
    font-family: var(--font-display);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: break-word;
    hyphens: auto;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .card-meta {
    font-size: 11px;
    opacity: 0.9;
  }

  .sticker {
    display: inline-flex;
    align-items: center;
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--accent);
    color: white;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: 0 4px 10px var(--accent-shadow);
    animation: pulse-soft 2.5s ease-in-out infinite;
  }

  .sticker-label {
    margin-left: 4px;
  }

  /* Carte fantôme pendant le chargement : elle flotte déjà */
  .skeleton {
    background: linear-gradient(110deg, var(--surface) 30%, var(--surface-hover) 50%, var(--surface) 70%);
    background-size: 250% 100%;
    box-shadow: 0 0 0 3px var(--bg-raised);
    animation:
      pop-in 0.5s ease-out calc(var(--i) * 80ms) backwards,
      shimmer 1.4s linear infinite;
  }

  @keyframes shimmer {
    from { background-position: 100% 0; }
    to   { background-position: -150% 0; }
  }

  /* Petites cartes (iPhone SE, vieux Android) : on allège pour laisser voir la photo */
  @container (max-width: 140px) {
    .card-overlay { padding: 24px 7px 7px; }
    .card-badge { display: none; }
    .card-title { font-size: 12px; letter-spacing: -0.01em; }
    .card-meta { font-size: 10px; }
    .sticker { padding: 3px 6px; }
    .sticker-label { display: none; }
  }

  /* Grandes cartes (tablette, ordinateur) */
  @container (min-width: 180px) {
    .card-title { font-size: 16px; }
    .card-meta { font-size: 12px; }
  }
</style>
