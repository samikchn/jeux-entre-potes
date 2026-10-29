// Tous les rôles disponibles. `max` : nombre maximum dans une partie (1 par défaut).
const ROLES = {
  loup: { name: "Loup-garou", emoji: "🐺", team: "loups", max: 6, desc: "Chaque nuit, les loups dévorent un joueur. Ils gagnent quand il ne reste que des loups." },
  grandloup: { name: "Grand méchant loup", emoji: "😈", team: "loups", desc: "Un loup qui, tant qu'aucun loup n'est mort, dévore une 2e victime chaque nuit." },
  infect: { name: "Infect père des loups", emoji: "🦠", team: "loups", desc: "Un loup qui, une fois par partie, peut transformer la victime des loups en loup-garou au lieu de la tuer." },
  loupblanc: { name: "Loup blanc", emoji: "🤍", team: "solo", desc: "Chasse avec les loups, mais une nuit sur deux il peut tuer un loup. Il gagne s'il est le dernier survivant." },

  voyante: { name: "Voyante", emoji: "🔮", team: "village", desc: "Chaque nuit, découvre le rôle d'un joueur." },
  sorciere: { name: "Sorcière", emoji: "🧪", team: "village", desc: "Une potion de vie pour sauver une victime des loups, une potion de mort pour tuer. Une seule fois chacune." },
  chasseur: { name: "Chasseur", emoji: "🏹", team: "village", desc: "En mourant, il élimine immédiatement un joueur de son choix." },
  cupidon: { name: "Cupidon", emoji: "💘", team: "village", desc: "La 1re nuit, il lie deux amoureux. Si l'un meurt, l'autre meurt de chagrin. S'ils sont les deux derniers, ils gagnent." },
  garde: { name: "Garde", emoji: "🛡️", team: "village", desc: "Chaque nuit, protège un joueur des loups (lui-même possible, jamais deux fois de suite le même)." },
  renard: { name: "Renard", emoji: "🦊", team: "village", desc: "Chaque nuit, flaire un joueur et ses deux voisins : il apprend si l'un d'eux est un loup. Si aucun ne l'est, il perd son flair." },
  montreur: { name: "Montreur d'ours", emoji: "🐻", team: "village", desc: "Chaque matin, son ours grogne si l'un de ses deux voisins est un loup." },
  ancien: { name: "Ancien", emoji: "👴", team: "village", desc: "Survit à la 1re attaque des loups. S'il est éliminé par le vote, les villageois perdent leurs pouvoirs." },
  idiot: { name: "Idiot du village", emoji: "🤪", team: "village", desc: "S'il est éliminé par le vote, il est épargné une fois mais ne vote plus." },
  corbeau: { name: "Corbeau", emoji: "🐦", team: "village", desc: "Chaque nuit, peut désigner un joueur qui aura 2 voix de plus contre lui au vote du jour." },
  chevalier: { name: "Chevalier à l'épée rouillée", emoji: "⚔️", team: "village", desc: "S'il est dévoré, le premier loup à sa gauche meurt du tétanos la nuit suivante." },
  enfant: { name: "Enfant sauvage", emoji: "🧒", team: "village", desc: "La 1re nuit, il choisit un modèle. Si son modèle meurt, il devient loup-garou." },
  villageois: { name: "Villageois", emoji: "🧑‍🌾", team: "village", max: 99, desc: "Pas de pouvoir : observe, débat et démasque les loups !" },

  pyromane: { name: "Pyromane", emoji: "🔥", team: "solo", desc: "Chaque nuit, asperge un joueur d'essence ou met le feu à tous les joueurs aspergés. Gagne s'il est le dernier survivant." },
  flute: { name: "Joueur de flûte", emoji: "🎶", team: "solo", desc: "Chaque nuit, charme deux joueurs. Gagne quand tous les autres joueurs en vie sont charmés." },
};

const TEAM_LABEL = { loups: "Loups", village: "Village", solo: "Solitaires" };

// Composition conseillée selon le nombre de joueurs (les Villageois complètent).
function suggestedComposition(n) {
  const comp = { loup: n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4 };
  const extras = [
    [4, "voyante"], [5, "sorciere"], [6, "chasseur"], [7, "cupidon"], [8, "garde"],
    [10, "renard"], [11, "ancien"], [12, "montreur"], [13, "idiot"], [14, "corbeau"],
  ];
  for (const [min, role] of extras) if (n >= min) comp[role] = 1;
  if (n >= 9) {
    comp.loup--;
    comp.grandloup = 1;
  }
  return comp;
}
