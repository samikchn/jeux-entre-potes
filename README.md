# 🎲 Jeux entre potes

Application web de jeux à jouer en groupe. Premier jeu : **Undercover**.

Aucune installation, aucun build : que du HTML, CSS et JavaScript.

## Jouer

Le site est publié avec GitHub Pages : `https://<pseudo>.github.io/jeux-entre-potes/`

### Undercover

- **Civils** : ils ont tous le même mot.
- **Undercover** : ils ont un mot proche, sans savoir qu'ils sont Undercover.
- **Mr. White** : il n'a pas de mot. S'il est éliminé, il peut gagner en devinant le mot des Civils.

Chacun donne un indice à l'oral à son tour, puis on vote pour éliminer quelqu'un.
Les Civils gagnent quand tous les infiltrés sont éliminés ; les infiltrés gagnent s'il ne reste qu'un Civil.

Deux modes :

- **Un seul téléphone** : on se le passe pour découvrir son mot, les votes se font à l'oral.
- **Chacun son téléphone** : un joueur crée un salon (code à 4 lettres), les autres le rejoignent. L'app gère les mots, l'ordre de parole et les votes. Les indices restent à l'oral.

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
undercover/
  index.html          Page du jeu
  words.js            Paires de mots (ajoutez-en !)
  engine.js           Règles du jeu, sans interface
  app.js              Interface + réseau
```

En mode en ligne, le téléphone de l'**hôte** garde l'état de la partie et l'envoie aux autres. Si l'hôte recharge la page, il peut reprendre son salon depuis l'accueil.

## Ajouter un jeu

1. Créer un dossier `mon-jeu/` avec son `index.html` (reprendre `css/style.css`).
2. Ajouter une carte vers `mon-jeu/` dans `index.html` à la racine.
3. Pour du multijoueur, s'inspirer de la partie « Réseau » de `undercover/app.js`.

## Publier sur GitHub Pages

*Settings > Pages > Source : Deploy from a branch*, branche `main`, dossier `/ (root)`.
