<script lang="ts">
  // Aide : à quoi sert Lichouz et comment s'en servir, onglet par onglet,
  // + « Ma famille » expliqué selon le rôle de la personne, + FAQ.
  // Sections dépliables (<details>) : lisibles au clavier et au lecteur d'écran.
  import Icon from '../components/Icon.svelte'
  import type { IconName } from '../components/Icon.svelte'
  import { profileState } from '../lib/profile.svelte'
  import { href } from '../lib/router.svelte'
  import { markWelcomeSeen } from '../lib/bienvenue'

  // Ouvrir l'aide vaut « bienvenue vue »
  $effect(() => {
    const id = profileState.profile?.id
    if (id) markWelcomeSeen(id)
  })

  const ctx = $derived(profileState.context)
  const myRole = $derived(
    ctx?.isSuperAdmin ? 'super-admin'
      : ctx?.isFounder ? 'fondateur'
      : profileState.profile?.role === 'admin' ? 'admin'
      : 'membre',
  )

  interface Section { id: string; icon: IconName; title: string }
  const sections: Section[] = [
    { id: 'accueil', icon: 'home', title: 'Accueil' },
    { id: 'recettes', icon: 'book', title: 'Recettes' },
    { id: 'semaine', icon: 'calendar', title: 'Semaine' },
    { id: 'courses', icon: 'cart', title: 'Courses' },
    { id: 'historique', icon: 'archive', title: 'Historique' },
    { id: 'frigo', icon: 'chef', title: 'Qu’est-ce qu’on mange ?' },
    { id: 'famille', icon: 'users', title: 'Ma famille et les rôles' },
    { id: 'telephone', icon: 'settings', title: 'Sur ton téléphone' },
  ]
</script>

<div class="page">
  <header class="head">
    <h1>Aide</h1>
    <p class="head-sub">Lichouz en quelques minutes.</p>
  </header>

  <section class="card intro" aria-labelledby="intro-title">
    <h2 id="intro-title" class="section-title">Lichouz, c’est quoi ?</h2>
    <p>
      L’appli des repas et des courses de la famille. Tout ce que tu fais est visible
      tout de suite par les autres membres de ta famille, et seulement par eux.
    </p>
    <ol class="cycle">
      <li><strong>Recettes</strong> : on garde nos recettes et on pioche dans le catalogue.</li>
      <li><strong>Semaine</strong> : on place les recettes sur les repas de la semaine.</li>
      <li><strong>Courses</strong> : la liste se calcule depuis la semaine ; on coche ensemble, en direct.</li>
      <li><strong>Historique</strong> : les listes terminées sont rangées.</li>
    </ol>
  </section>

  <div class="sections">
    {#each sections as s (s.id)}
      <details class="card fold" id={`aide-${s.id}`}>
        <summary>
          <span class="section-icon"><Icon name={s.icon} size={18} /></span>
          <span class="fold-title">{s.title}</span>
          <span class="chev"><Icon name="chevron-down" size={18} /></span>
        </summary>
        <div class="fold-body">
          {#if s.id === 'accueil'}
            <p>Chaque jour, 5 idées de recettes. Touche une carte pour voir la recette.</p>
            <p>Si un repas est prévu aujourd’hui, l’accueil l’affiche (« Ce soir : … ») avec la personne qui cuisine.</p>
          {:else if s.id === 'recettes'}
            <ul>
              <li><strong>Chercher</strong> : tape quelques lettres, peu importe les accents et l’ordre des mots ; filtre par catégorie.</li>
              <li><strong>Ajouter une recette</strong> : bouton « + », avec ingrédients, étapes et photo prise depuis la galerie.</li>
              <li><strong>Qui la voit ?</strong> « Ma famille seulement » (par défaut), ou « Toutes nos familles » pour la partager avec les familles liées à la tienne. Les recettes du <strong>catalogue commun</strong> sont fournies avec l’appli : on peut les utiliser, pas les modifier.</li>
              <li>Depuis une recette : <strong>Ajouter à ma semaine</strong>, ou <strong>Juste les ingrédients</strong> pour les mettre dans la liste sans la planifier.</li>
            </ul>
          {:else if s.id === 'semaine'}
            <ul>
              <li>Chaque jour a un repas du midi et du soir : touche un repas pour choisir la recette.</li>
              <li><strong>Qui cuisine ?</strong> : la pastille sur un repas ; le filtre <strong>Mes repas</strong> ne montre que les tiens.</li>
              <li>Flèches en haut : semaine précédente ou suivante. Les changements apparaissent chez les autres en direct.</li>
            </ul>
          {:else if s.id === 'courses'}
            <ul>
              <li><strong>Mettre à jour depuis le planning</strong> recalcule la liste en additionnant les ingrédients ; ce qui est déjà coché et ce que tu as ajouté à la main sont gardés.</li>
              <li>Touche un article pour le mettre dans le chariot : tout le monde le voit coché aussitôt. Ça marche aussi sans réseau (envoyé au retour du réseau).</li>
              <li><strong>Ajouter un article</strong> hors recette (« papier toilette »…).</li>
              <li><strong>Habituels</strong> : ce que tu achètes souvent, ajouté en un geste.</li>
              <li><strong>Placard</strong> : ce que tu as toujours à la maison (sel, huile…) ; ces articles vont dans « Sûrement déjà à la maison ». S’il en manque, touche « Il en manque ».</li>
              <li>À la fin : <strong>Terminer les courses</strong> range la liste dans l’historique.</li>
            </ul>
          {:else if s.id === 'historique'}
            <p>Les listes de courses terminées, pour retrouver ce qu’on a acheté et quand.</p>
          {:else if s.id === 'frigo'}
            <p>
              Depuis l’accueil : tape ce qu’il te reste (« courgettes, œufs… »), Lichouz classe les recettes qui
              l’utilisent le mieux (le placard est compté comme disponible). Le calcul se fait dans ton téléphone.
            </p>
          {:else if s.id === 'famille'}
            <p class="you">Ton rôle : <strong>{myRole}</strong>{ctx?.family ? ` · famille « ${ctx.family.name} »` : ''}</p>
            <ul>
              <li><strong>Membre</strong> : utilise tout (recettes, semaine, courses) et voit la liste de la famille.</li>
              <li><strong>Admin</strong> : en plus, invite des personnes avec un lien, passe quelqu’un admin ou membre, renomme la famille et peut retirer quelqu’un.</li>
              <li><strong>Fondateur</strong> : a créé le groupe de familles ; il peut créer jusqu’à 3 familles et gérer chacune (membres, invitations, suppression d’une famille vide).</li>
            </ul>
            <p>
              <strong>Inviter</strong> : dans <a href={href('famille')}>Ma famille</a>, crée un lien et envoie-le
              (SMS, WhatsApp…). Il sert <strong>une seule fois</strong> et expire au bout de <strong>7 jours</strong>.
            </p>
            <p>
              <strong>Retirer quelqu’un</strong> supprime son compte : il ne peut plus se connecter, ses recettes
              restent dans la famille. On peut le réinviter plus tard avec un nouveau lien.
            </p>
          {:else if s.id === 'telephone'}
            <ul>
              <li><strong>Installer l’appli</strong> : sur iPhone, dans Safari, bouton Partager puis « Sur l’écran d’accueil ». Sur Android, dans Chrome, menu ⋮ puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).</li>
              <li>L’appli se met à jour toute seule : elle se recharge quand une nouvelle version sort.</li>
              <li>Sans réseau, la dernière liste de courses reste consultable et les cochages sont envoyés plus tard.</li>
            </ul>
          {/if}
        </div>
      </details>
    {/each}
  </div>

  <section class="card faq" aria-labelledby="faq-title">
    <h2 id="faq-title" class="section-title">Questions fréquentes</h2>
    <dl>
      <dt>J’ai oublié mon mot de passe.</dt>
      <dd>Sur l’écran de connexion, « Mot de passe oublié ? » : tu reçois un e-mail pour en choisir un nouveau.</dd>
      <dt>Le lien d’invitation ne marche pas.</dt>
      <dd>Il a déjà servi, a été annulé ou a plus de 7 jours. Demande un nouveau lien à l’admin de ta famille.</dd>
      <dt>Je ne vois pas une recette qu’un proche a créée.</dt>
      <dd>Elle est sans doute réservée à sa famille. Il peut la passer en « Toutes nos familles » si vos familles sont liées.</dd>
      <dt>La liste ne bouge plus chez moi.</dt>
      <dd>Vérifie le réseau, puis ferme et rouvre l’appli : tout se resynchronise.</dd>
      <dt>Qui voit mes données ?</dt>
      <dd>Seulement les membres de ta famille (et les familles liées pour les recettes partagées). Ton e-mail n’est montré à personne.</dd>
    </dl>
  </section>

  <p class="back"><a href={href('compte')}><Icon name="arrow-left" size={16} /> Retour à Mon compte</a></p>
</div>

<style>
  /* Même mise en page que « Mon compte » */
  .page {
    padding: var(--gutter);
    padding-top: calc(var(--gutter) + env(safe-area-inset-top, 0px));
    max-width: 560px;
    margin: 0 auto;
    padding-bottom: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  @media (min-width: 900px) {
    .page { padding-top: calc(32px + env(safe-area-inset-top, 0px)); }
  }
  .head { margin-bottom: 4px; }
  .head h1 { font-family: var(--font-display); font-size: 28px; }
  .head-sub { margin-top: 4px; font-size: 15px; color: var(--text-secondary); }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 18px;
  }
  .section-title {
    font-family: var(--font-display);
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .intro p, .fold-body p, .faq dd { font-size: 15px; line-height: 1.5; color: var(--text-secondary); }
  .intro strong, .fold-body strong { color: var(--text); }
  .cycle { margin: 12px 0 0; padding-left: 20px; display: grid; gap: 6px; font-size: 15px; line-height: 1.45; color: var(--text-secondary); }

  .sections { display: grid; gap: 10px; }
  .fold { padding: 0; }
  .fold summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 10px 16px;
    cursor: pointer;
    list-style: none;
    border-radius: var(--radius-xl);
    touch-action: manipulation;
  }
  .fold summary::-webkit-details-marker { display: none; }
  .fold summary:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
  .fold-title { flex: 1; font-weight: 600; }
  .chev { display: inline-flex; color: var(--text-secondary); transition: transform 0.2s ease; }
  .fold[open] .chev { transform: rotate(180deg); }
  .fold-body { padding: 0 16px 16px 60px; display: grid; gap: 10px; }
  .fold-body ul { margin: 0; padding-left: 18px; display: grid; gap: 8px; font-size: 15px; line-height: 1.5; color: var(--text-secondary); }
  .fold-body a, .back a { color: var(--primary); font-weight: 600; }
  .you { padding: 8px 12px; background: var(--primary-light); border-radius: 10px; }

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

  .faq dl { margin: 0; display: grid; gap: 4px; }
  .faq dt { font-weight: 600; margin-top: 10px; }
  .faq dt:first-child { margin-top: 0; }
  .faq dd { margin: 0; }

  .back { text-align: center; padding: 8px 0 4px; }
  .back a { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; text-decoration: none; }

  @media (prefers-reduced-motion: reduce) { .chev { transition: none; } }
</style>
