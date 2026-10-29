# 🎲 Jeux entre potes

Application web de jeux à jouer en groupe. Jeux disponibles : **Undercover** et **Loup-Garou**.

Aucune installation, aucun build : que du HTML, CSS et JavaScript.

## Jouer

Le site est publié avec GitHub Pages : https://samikchn.github.io/jeux-entre-potes/

### Undercover

- **Civils** : ils ont tous le même mot.
- **Undercover** : ils ont un mot proche, sans savoir qu'ils sont Undercover.
- **Mr. White** : il n'a pas de mot. S'il est éliminé, il peut gagner en devinant le mot des Civils.

Chacun donne un indice à l'oral à son tour, puis on vote pour éliminer quelqu'un.
Les Civils gagnent quand tous les infiltrés sont éliminés ; les infiltrés gagnent s'il ne reste qu'un Civil.

Deux modes :

- **Un seul téléphone** : on se le passe pour découvrir son mot, les votes se font à l'oral.
- **Chacun son téléphone** : un joueur crée un salon (code à 4 lettres), les autres le rejoignent. L'app gère les mots, l'ordre de parole et les votes. Les indices restent à l'oral.

### Loup-Garou

L'app fait le narrateur : chacun joue sur son téléphone. La nuit, chaque rôle agit en secret sur son écran ; le matin, l'app annonce les morts et leur rôle. Le jour, le village débat et vote à main levée, puis l'hôte indique le joueur éliminé.

L'hôte choisit la composition avant la partie (ou prend la composition conseillée) parmi 19 rôles :

- **Loups** : Loup-garou, Grand méchant loup, Infect père des loups
- **Village** : Villageois, Voyante, Sorcière, Chasseur, Cupidon, Garde, Renard, Montreur d'ours, Ancien, Idiot du village, Corbeau, Chevalier à l'épée rouillée, Enfant sauvage
- **Solitaires** : Loup blanc, Pyromane, Joueur de flûte

La description de chaque rôle est dans le jeu (« Les règles et les rôles ») et dans [`loup-garou/roles.js`](loup-garou/roles.js). Mode « un seul téléphone » : on se passe le téléphone pour découvrir son rôle (caché ensuite), puis au choix :

- **Narrateur : l'app** — une voix (synthèse vocale du navigateur, gratuite) appelle chaque rôle la nuit ; la personne appelée prend le téléphone, agit, puis le repose. Les rôles absents ou morts sont appelés quand même pour ne rien trahir. Le matin, la voix annonce les morts ; le jour, on vote à main levée et on touche le joueur éliminé. Chacun peut revoir discrètement son rôle pendant le débat.
- **Narration par IA (optionnelle)** — avec une clé API Claude enregistrée sur le téléphone de l'hôte, Claude raconte les annonces comme un conteur (`loup-garou/narrator.js`). La clé n'est jamais envoyée ailleurs qu'à l'API d'Anthropic, et n'est pas dans le repo.
- **Narrateur : un joueur** — il ne joue pas ; après la distribution, il ouvre l'espace narrateur (avec confirmation) pour voir les rôles et le script de la nuit.

## Configurer le mode en ligne (Supabase)

Le mode en ligne utilise uniquement le temps réel de Supabase (pas de base de données, pas de table à créer).

1. Créer un compte et un projet gratuit sur [supabase.com](https://supabase.com).
2. Dans *Project Settings > API*, copier l'**URL du projet** et la **clé anon / publishable**.
3. Les coller dans [`js/config.js`](js/config.js), puis commit.

La clé anon est faite pour être publique : pas de souci à la mettre dans le repo.

## Lancer en local

Les pages fonctionnent en ouvrant `index.html` dans un navigateur. Pour un vrai serveur local, n'importe lequel fait l'affaire, par exemple avec l'extension VS Code « Live Server ».

## Organisation du code

```
index.html            Accueil, liste des jeux
css/style.css         Style commun à tous les jeux
js/config.js          Clés Supabase
js/common.js          Outils partagés : affichage, salon en ligne (utilisé par Loup-Garou)
undercover/
  index.html          Page du jeu
  words.js            Paires de mots (ajoutez-en !)
  engine.js           Règles du jeu, sans interface
  app.js              Interface + réseau
loup-garou/
  index.html          Page du jeu
  roles.js            Liste des rôles et composition conseillée
  engine.js           Règles du jeu (nuit, aube, vote, victoire), sans interface
  narrator.js         Voix du narrateur + narration IA optionnelle
  local.js            Partie sur un seul téléphone menée par la voix
  app.js              Interface + réseau
```

En mode en ligne, le téléphone de l'**hôte** garde l'état de la partie et l'envoie aux autres. Si l'hôte recharge la page, il peut reprendre son salon depuis l'accueil.

## Ajouter un jeu

1. Créer un dossier `mon-jeu/` avec son `index.html` (reprendre `css/style.css`).
2. Ajouter une carte vers `mon-jeu/` dans `index.html` à la racine.
3. Pour du multijoueur, utiliser `Common.joinRoom` de `js/common.js` (voir `loup-garou/app.js`).

## Publier sur GitHub Pages

*Settings > Pages > Source : Deploy from a branch*, branche `main`, dossier `/ (root)`.
