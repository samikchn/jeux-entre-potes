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

// Compositions conseillées. Pour chacune : les loups selon le nombre de joueurs, puis les rôles
// de `extras` dans l'ordre, tant qu'il reste assez de Villageois. `min` : joueurs minimum.
const PRESETS = [
  {
    id: "decouverte", emoji: "🌱", name: "Découverte", desc: "Peu de rôles, idéal pour une 1re partie.",
    villagers: 0.4, extras: ["voyante", "sorciere", "chasseur"],
  },
  {
    id: "classique", emoji: "🏡", name: "Classique", desc: "Les rôles incontournables.",
    villagers: 0.17, extras: ["voyante", "sorciere", "chasseur", "cupidon", "garde", "renard", "ancien", "montreur", "idiot", "corbeau"],
    special: (n, c) => n >= 9 && swapWolf(c, "grandloup"),
  },
  {
    id: "enquete", emoji: "🔎", name: "Enquête", desc: "Plein d'indices : voyante, renard, ours, corbeau.",
    villagers: 0.2, extras: ["voyante", "renard", "montreur", "corbeau", "ancien", "garde", "chasseur", "idiot"],
  },
  {
    id: "meute", emoji: "🐺", name: "Meute sauvage", desc: "Des loups plus dangereux.",
    villagers: 0.2, extras: ["voyante", "sorciere", "garde", "chasseur", "chevalier", "ancien", "renard"],
    special: (n, c) => {
      swapWolf(c, "grandloup");
      if (n >= 7) swapWolf(c, "infect");
    },
  },
  {
    id: "intrigues", emoji: "💘", name: "Intrigues", desc: "Amours, trahisons et transformations.",
    villagers: 0.2, extras: ["cupidon", "voyante", "enfant", "idiot", "sorciere", "chevalier", "chasseur", "corbeau"],
  },
  {
    id: "chaos", emoji: "🔥", name: "Chaos", desc: "Les solitaires s'en mêlent : chacun pour soi !",
    min: 7, villagers: 0.1, extras: ["pyromane", "voyante", "sorciere", "loupblanc", "flute", "cupidon", "chasseur", "garde", "enfant", "renard"],
  },
];

const wolvesFor = (n) => (n <= 5 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : 4);

// Remplace un Loup-garou simple par un loup spécial.
function swapWolf(comp, role) {
  if (comp.loup > 1 || (comp.loup === 1 && !comp[role])) {
    comp.loup--;
    comp[role] = 1;
  }
}

function buildPreset(preset, n) {
  if (n < (preset.min || 4)) return null;
  const comp = { loup: wolvesFor(n) };
  preset.special?.(n, comp);
  const minVillagers = Math.round(n * preset.villagers);
  const count = () => Object.values(comp).reduce((s, c) => s + c, 0);
  for (const role of preset.extras) {
    if (n - count() <= minVillagers) break;
    comp[role] = 1;
    if (LG.compositionError(n, comp)) delete comp[role];
  }
  for (const r of Object.keys(comp)) if (!comp[r]) delete comp[r];
  return LG.compositionError(n, comp) ? null : comp;
}

// Compositions disponibles pour n joueurs (celles qui ne marchent pas à ce nombre sont retirées).
function compositionsFor(n) {
  return PRESETS.map((p) => ({ ...p, comp: buildPreset(p, n) })).filter((p) => p.comp);
}

function suggestedComposition(n) {
  const list = compositionsFor(n);
  return (list.find((p) => p.id === "classique") || list[0])?.comp || { loup: 1 };
}
