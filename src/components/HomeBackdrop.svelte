<script lang="ts">
  // Fond animé de la page d'accueil — thème « la mer ».
  //   - Motif d'écailles de vagues (seigaiha, motif traditionnel japonais) en bleu,
  //     net sur les côtés, flou au milieu (là où flottent les cartes)
  //   - En bas : 3 couches de vagues qui roulent à des vitesses différentes
  //   - Des bulles qui remontent
  //
  // Performance mobile :
  //   Le flou n'est PAS recalculé à chaque image. Le motif est dessiné deux fois
  //   (une copie nette, une copie floutée une seule fois) et c'est leur conteneur
  //   qui se déplace (transform = GPU). Deux masques fixes décident où l'on voit
  //   la copie nette (côtés) et la copie floue (centre). Les vagues du bas sont
  //   de simples dessins qui glissent (transform), sans aucun recalcul.
  import { seededRandom } from '../lib/random'

  // ── Motif d'écailles ──
  // Rangées de cercles concentriques décalées d'un demi-cercle ; chaque rangée
  // recouvre la moitié basse de la précédente → on ne voit que des arcs.
  const R = 46                     // rayon d'une écaille : grands motifs
  const TILE_W = 2 * R
  const TILE_H = R
  const RINGS = [1, 0.8, 0.6, 0.4, 0.2] // anneaux, de l'extérieur vers l'intérieur

  // Ordre de dessin important : du haut vers le bas (la rangée du dessous passe devant)
  // Il faut aussi dessiner la rangée décalée SUIVANTE (y = 1,5R) : elle passe
  // devant le bas de la rangée C et remonte dans la tuile. Sans elle, chaque
  // rangée est coupée net au bord de la tuile (bandes horizontales).
  const scales: [number, number][] = [
    [0, 0], [TILE_W, 0],               // rangée A
    [R, R / 2],                        // rangée B (décalée)
    [0, R], [TILE_W, R],               // rangée C (= rangée A de la tuile suivante)
    [R, 1.5 * R],                      // rangée B de la tuile suivante (déborde vers le haut)
  ]

  // ── Vagues du bas : une courbe sinusoïdale qui se répète 4 fois sur la largeur ──
  // (deux dessins identiques côte à côte qui glissent de 50 % → boucle invisible)
  function wavePath(amp: number, base: number, periods: number, phase: number): string {
    const W = 1200
    const H = 120
    const steps = 96
    let d = `M 0 ${H} L 0 ${base}`
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W
      const y = base + amp * Math.sin((i / steps) * periods * 2 * Math.PI + phase)
      d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return d + ` L ${W} ${H} Z`
  }

  const waves = [
    { d: wavePath(10, 46, 4, 0), cls: 'wave-back', dur: 19 },
    { d: wavePath(12, 62, 4, 1.4), cls: 'wave-mid', dur: 13 },
    { d: wavePath(9, 80, 4, 2.6), cls: 'wave-front', dur: 9 },
  ]

  // Identifiant unique : évite un conflit si le composant est monté deux fois
  const patternId = `seigaiha-${Math.random().toString(36).slice(2, 8)}`

  // ── Bulles (positions fixes, tirées une fois) ──
  const rand = seededRandom('backdrop-bubbles')
  const bubbles = Array.from({ length: 14 }, () => ({
    left: rand() * 100,
    top: 55 + rand() * 50,
    size: 4 + rand() * 8,
    dur: 9 + rand() * 9,
    delay: -rand() * 18,
    drift: (rand() - 0.5) * 50,
  }))
</script>

<div class="backdrop" aria-hidden="true" style:--tw="{TILE_W}px" style:--th="{TILE_H}px">
  <!-- Définition du motif, partagée par les deux copies -->
  <svg class="defs" width="0" height="0">
    <defs>
      <pattern id={patternId} width={TILE_W} height={TILE_H} patternUnits="userSpaceOnUse">
        {#each scales as [cx, cy], i (i)}
          {#each RINGS as k, j (j)}
            <circle {cx} {cy} r={R * k} class="ring ring-{j}" />
          {/each}
        {/each}
      </pattern>
    </defs>
  </svg>

  <!-- Copie nette : visible sur les côtés -->
  <div class="layer layer-sharp">
    <div class="mover">
      <svg class="pattern"><rect width="100%" height="100%" fill="url(#{patternId})" /></svg>
    </div>
  </div>

  <!-- Copie floue : visible au centre -->
  <div class="layer layer-blur">
    <div class="mover">
      <svg class="pattern pattern-blur"><rect width="100%" height="100%" fill="url(#{patternId})" /></svg>
    </div>
  </div>

  <!-- Brume au centre : adoucit encore derrière les cartes -->
  <div class="haze"></div>

  <!-- Bulles -->
  {#each bubbles as b, i (i)}
    <span
      class="bubble"
      style:left="{b.left}%"
      style:top="{b.top}%"
      style:width="{b.size}px"
      style:height="{b.size}px"
      style:--dur="{b.dur}s"
      style:--delay="{b.delay}s"
      style:--drift="{b.drift}px"
    ></span>
  {/each}

  <!-- Vagues du bas -->
  <div class="waves">
    {#each waves as w, i (i)}
      <div class="wave-track {w.cls}" style:--dur="{w.dur}s">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none"><path d={w.d} /></svg>
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none"><path d={w.d} /></svg>
      </div>
    {/each}
  </div>

  <!-- Voile en haut : le titre reste lisible -->
  <div class="veil"></div>
</div>

<style>
  /* ── Couleurs : le bleu domine ───────────────────────── */
  .backdrop {
    --bd-base: #1A44BC;
    --bd-ring-0: #12379E;   /* anneau extérieur */
    --bd-ring-1: #1D48C2;
    --bd-ring-2: #3463E0;
    --bd-ring-3: #6188EE;
    --bd-ring-4: #9DB7FA;   /* centre */
    --bd-ring-line: rgba(255, 255, 255, 0.4);
    --bd-haze: rgba(20, 50, 150, 0.35);
    --bd-veil: #F3F7FF;
    --bd-bubble: rgba(255, 255, 255, 0.8);
    --bd-wave-back: #2552CC;
    --bd-wave-mid: #173FAA;
    --bd-wave-front: #0D2C86;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .backdrop {
      --bd-base: #051347;
      --bd-ring-0: #040F3C;
      --bd-ring-1: #081A55;
      --bd-ring-2: #0D2672;
      --bd-ring-3: #163694;
      --bd-ring-4: #2449B5;
      --bd-ring-line: rgba(180, 205, 255, 0.18);
      --bd-haze: rgba(2, 8, 35, 0.5);
      --bd-veil: #030C33;
      --bd-bubble: rgba(190, 210, 255, 0.5);
      --bd-wave-back: #0B2370;
      --bd-wave-mid: #071955;
      --bd-wave-front: #030E3A;
    }
  }

  :global(:root[data-theme='dark']) .backdrop {
    --bd-base: #051347;
    --bd-ring-0: #040F3C;
    --bd-ring-1: #081A55;
    --bd-ring-2: #0D2672;
    --bd-ring-3: #163694;
    --bd-ring-4: #2449B5;
    --bd-ring-line: rgba(180, 205, 255, 0.18);
    --bd-haze: rgba(2, 8, 35, 0.5);
    --bd-veil: #030C33;
    --bd-bubble: rgba(190, 210, 255, 0.5);
    --bd-wave-back: #0B2370;
    --bd-wave-mid: #071955;
    --bd-wave-front: #030E3A;
  }

  .defs {
    position: absolute;
    width: 0;
    height: 0;
  }

  .ring {
    stroke: var(--bd-ring-line);
    stroke-width: 1.5;
  }
  .ring-0 { fill: var(--bd-ring-0); }
  .ring-1 { fill: var(--bd-ring-1); }
  .ring-2 { fill: var(--bd-ring-2); }
  .ring-3 { fill: var(--bd-ring-3); }
  .ring-4 { fill: var(--bd-ring-4); }

  /* ── Conteneur ───────────────────────────────────────── */
  .backdrop {
    /* fixed : couvre tout l'écran, y compris derrière la tab bar, sans raccord */
    position: fixed;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    background: var(--bd-base);
    pointer-events: none;
  }

  .layer {
    position: absolute;
    inset: 0;
  }

  /* Ellipse centrale (fixe à l'écran) : où le motif devient flou */
  .layer-sharp {
    -webkit-mask-image: radial-gradient(ellipse 48% 44% at 50% 52%, transparent 40%, #000 82%);
    mask-image: radial-gradient(ellipse 48% 44% at 50% 52%, transparent 40%, #000 82%);
  }

  .layer-blur {
    -webkit-mask-image: radial-gradient(ellipse 48% 44% at 50% 52%, #000 48%, transparent 90%);
    mask-image: radial-gradient(ellipse 48% 44% at 50% 52%, #000 48%, transparent 90%);
  }

  /* Ce qui glisse : les deux copies bougent ensemble (même animation, même départ) */
  .mover {
    position: absolute;
    top: calc(var(--th) * -1);
    left: calc(var(--tw) * -1);
    width: calc(100% + 2 * var(--tw));
    height: calc(100% + 2 * var(--th));
    will-change: transform;
    animation: pattern-slide 30s linear infinite;
  }

  @keyframes pattern-slide {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(var(--tw), 0, 0); } /* exactement 1 tuile → boucle invisible */
  }

  .pattern {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Flou appliqué une seule fois au dessin ; le déplacement se fait au-dessus */
  .pattern-blur {
    filter: blur(10px);
  }

  .haze {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 45% 40% at 50% 52%, var(--bd-haze) 0%, transparent 100%);
  }

  /* ── Vagues du bas ───────────────────────────────────── */
  .waves {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 150px;
  }

  .wave-track {
    position: absolute;
    left: 0;
    bottom: 0;
    width: 200%;
    display: flex;
    will-change: transform;
    animation: wave-roll var(--dur) linear infinite;
  }

  .wave-track svg {
    width: 50%;
    height: 100%;
    display: block;
  }

  /* Chaque couche roule à sa vitesse ; celle du milieu en sens inverse */
  .wave-back  { height: 100%; opacity: 0.75; }
  .wave-mid   { height: 85%; animation-direction: reverse; opacity: 0.9; }
  .wave-front { height: 65%; }

  .wave-back path  { fill: var(--bd-wave-back); }
  .wave-mid path   { fill: var(--bd-wave-mid); }
  .wave-front path { fill: var(--bd-wave-front); }

  @keyframes wave-roll {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }

  /* ── Bulles ──────────────────────────────────────────── */
  .bubble {
    position: absolute;
    border-radius: 50%;
    border: 1.5px solid var(--bd-bubble);
    background: radial-gradient(
      circle at 35% 30%,
      color-mix(in srgb, var(--bd-bubble) 60%, transparent) 0 18%,
      transparent 30%
    );
    opacity: 0;
    will-change: transform, opacity;
    animation: rise var(--dur) ease-in var(--delay) infinite;
  }

  @keyframes rise {
    0%   { transform: translate3d(0, 0, 0); opacity: 0; }
    12%  { opacity: 0.9; }
    50%  { transform: translate3d(calc(var(--drift) * 0.6), -28vh, 0); }
    85%  { opacity: 0.6; }
    100% { transform: translate3d(var(--drift), -58vh, 0); opacity: 0; }
  }

  /* ── Voile en haut (titre) ───────────────────────────── */
  .veil {
    position: absolute;
    inset: 0 0 auto 0;
    height: 30%;
    background: linear-gradient(
      to bottom,
      var(--bd-veil) 0%,
      color-mix(in srgb, var(--bd-veil) 80%, transparent) 45%,
      transparent 100%
    );
  }

  /* ── Écrans larges ───────────────────────────────────── */
  @media (min-width: 900px) {
    .waves { height: 190px; }

    /* La zone floue s'étire en largeur, les côtés restent nets */
    .layer-sharp {
      -webkit-mask-image: radial-gradient(ellipse 40% 48% at 50% 54%, transparent 48%, #000 90%);
      mask-image: radial-gradient(ellipse 40% 48% at 50% 54%, transparent 48%, #000 90%);
    }
    .layer-blur {
      -webkit-mask-image: radial-gradient(ellipse 40% 48% at 50% 54%, #000 55%, transparent 95%);
      mask-image: radial-gradient(ellipse 40% 48% at 50% 54%, #000 55%, transparent 95%);
    }
  }
</style>
