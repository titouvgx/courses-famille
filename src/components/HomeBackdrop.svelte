<script lang="ts">
  // Fond de la page d'accueil : photo de mer, légèrement floutée.
  // Photo : James Eades — Unsplash (licence Unsplash, usage libre).
  //
  //   - Deux tailles (640 px mobile / 1280 px grand écran), en WebP : ~120 Ko sur téléphone
  //   - Flou appliqué une seule fois à l'image ; seul le conteneur bouge
  //     (zoom très lent façon « Ken Burns », transform = GPU) → fluide sur mobile
  //   - Voile sombre dégradé : titre et cartes restent lisibles
  //   - Couleur de secours bleu nuit tant que la photo n'est pas chargée
  const base = import.meta.env.BASE_URL
  const src640 = `${base}bg/mer-640.webp`
  const src1280 = `${base}bg/mer-1280.webp`

  let loaded = $state(false)
</script>

<div class="backdrop" aria-hidden="true">
  <div class="drift">
    <img
      class="photo"
      class:loaded
      src={src640}
      srcset="{src640} 640w, {src1280} 1280w"
      sizes="100vw"
      alt=""
      decoding="async"
      fetchpriority="high"
      onload={() => (loaded = true)}
    />
  </div>
  <div class="shade"></div>
</div>

<style>
  .backdrop {
    /* fixed : couvre tout l'écran, y compris derrière la tab bar, sans raccord */
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: #0A2342; /* bleu nuit, le temps que la photo arrive */
    pointer-events: none;
  }

  /* Le conteneur qui bouge (zoom + léger glissement, très lent) */
  .drift {
    position: absolute;
    inset: -6%; /* marge : les bords floutés et le mouvement ne laissent jamais de vide */
    will-change: transform;
    animation: ken-burns 38s ease-in-out infinite alternate;
  }

  @keyframes ken-burns {
    from { transform: scale(1) translate3d(0, 0, 0); }
    to   { transform: scale(1.08) translate3d(-1.5%, -2%, 0); }
  }

  .photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    /* Léger flou + un peu plus sombre et saturé : la photo reste « mer » sans voler la vedette */
    filter: blur(4px) brightness(0.85) saturate(1.3);
    opacity: 0;
    transition: opacity 0.8s ease-out;
  }

  .photo.loaded {
    opacity: 1;
  }

  /* Voile : sombre en haut (titre), plus léger au milieu (cartes), sombre en bas (boutons) */
  .shade {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(
        to bottom,
        rgba(4, 14, 40, 0.78) 0%,
        rgba(4, 14, 40, 0.35) 28%,
        rgba(4, 14, 40, 0.25) 60%,
        rgba(4, 14, 40, 0.7) 100%
      );
  }

  /* Grand écran : la photo (en portrait) est plus agrandie → un peu plus de flou */
  @media (min-width: 900px) {
    .photo {
      filter: blur(6px) brightness(0.82) saturate(1.3);
    }
  }
</style>
