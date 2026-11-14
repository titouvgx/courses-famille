# Fonctions serveur Supabase

## `accepter-invitation`

Crée le compte d'une personne invitée par lien, puis la rattache à sa famille
(ou crée sa super-famille et sa famille pour un lien « fondateur »). C'est le
seul endroit où la **clé secrète** est utilisée : elle reste dans Supabase
(variable `SUPABASE_SECRET_KEYS`, fournie automatiquement par la plateforme),
jamais dans le dépôt ni dans le site.

La logique (`traiter`) est testée dans `tests/unit/accepter-invitation.test.ts`
avec un faux Supabase, et le fichier est vérifié par `deno check`.

### Déployer depuis le tableau de bord (sans rien installer)

1. Supabase → ton projet → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nom : `accepter-invitation` (exactement).
3. Remplace tout le code par le contenu de `supabase/functions/accepter-invitation/index.ts`, puis **Deploy**.
4. Dans la page de la fonction → **Details / Settings** : désactive **Verify JWT**
   (« Enforce JWT verification »). La personne n'a pas encore de compte : la
   fonction vérifie elle-même le lien d'invitation.
5. (Facultatif) **Edge Functions → Secrets** : `ALLOWED_ORIGINS` =
   `https://titouvgx.github.io,http://localhost:5173` (adresses autorisées à
   appeler la fonction depuis un navigateur ; ce sont les valeurs par défaut).
6. Prérequis : la migration `20261114100000_familles_invitations.sql` exécutée.

### Avec la ligne de commande (alternative)

```bash
supabase functions deploy accepter-invitation --no-verify-jwt --use-api
```

### Vérifier

Dans l'appli : Mon compte → Ma famille → « Inviter quelqu'un » → ouvrir le lien
dans une fenêtre privée → créer un compte de test → il apparaît dans la famille.
Logs : Edge Functions → accepter-invitation → **Logs**.

### Si la création de compte échoue
L'écran « Rejoindre » affiche le code renvoyé :
- **401** : « Verify JWT » est encore activé → le désactiver ;
- **404** : fonction absente ou mal nommée → la (re)déployer sous le nom `accepter-invitation` ;
- **500 / 503** : la fonction plante → Logs. Ne jamais remettre d'import dynamique
  (`await import(variable)`) : Supabase n'emballe que les imports statiques.
