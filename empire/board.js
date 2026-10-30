// Plateau d'Empire IDF : 32 cases (9 par côté, coins compris), villes d'Île-de-France
// regroupées par département, du moins cher au plus cher.
const GROUPS = [
  { name: "Val-d'Oise (95)", color: "#a1887f" },
  { name: "Seine-Saint-Denis (93)", color: "#4fc3f7" },
  { name: "Seine-et-Marne (77)", color: "#f06292" },
  { name: "Essonne (91)", color: "#ffb74d" },
  { name: "Val-de-Marne (94)", color: "#e57373" },
  { name: "Yvelines (78)", color: "#fff176" },
  { name: "Hauts-de-Seine (92)", color: "#81c784" },
];

// short : nom affiché sur le plateau (les cases sont petites). icon : icône Lucide qui évoque
// la ville (les vrais logos des mairies sont protégés).
const P = (name, short, icon, group, price) => ({ type: "prop", name, short, icon, group, price });
const GARE = (name, short) => ({ type: "rer", name, short, icon: "train-front", price: 200 });

const SPACES = [
  { type: "start", name: "Départ", short: "Départ" },
  P("Sarcelles", "Sarcelles", "store", 0, 60),
  { type: "event", name: "Événement", short: "Événement" },
  P("Argenteuil", "Argen­teuil", "palette", 0, 60),
  P("Herblay-sur-Seine", "Herblay", "sailboat", 0, 80),
  GARE("Gare du Nord", "G. du Nord"),
  P("Bondy", "Bondy", "mic", 1, 100),
  P("Saint-Denis", "St-Denis", "trophy", 1, 100),
  { type: "jail", name: "Prison de Fleury-Mérogis", short: "Prison" },
  P("Montreuil", "Montreuil", "apple", 1, 120),
  P("Meaux", "Meaux", "wheat", 2, 140),
  { type: "tax", name: "Taxe foncière", short: "Taxe", amount: 150 },
  P("Melun", "Melun", "shield", 2, 140),
  GARE("Gare Montparnasse", "Montpar­nasse"),
  P("Chessy", "Chessy", "ferris-wheel", 2, 160),
  P("Évry-Courcouronnes", "Évry", "church", 3, 180),
  { type: "pause", name: "Pause terrasse", short: "Pause" },
  P("Massy", "Massy", "train-track", 3, 180),
  { type: "event", name: "Événement", short: "Événement" },
  P("Orsay", "Orsay", "atom", 3, 200),
  P("L'Haÿ-les-Roses", "L'Haÿ", "flower", 4, 220),
  GARE("Châtelet-Les Halles", "Châtelet"),
  P("Cachan", "Cachan", "graduation-cap", 4, 220),
  P("Vincennes", "Vincennes", "castle", 4, 240),
  { type: "control", name: "Garde à vue", short: "Garde à vue" },
  P("Poissy", "Poissy", "car", 5, 260),
  P("Saint-Germain-en-Laye", "St-Germain", "trees", 5, 260),
  P("Versailles", "Ver­sailles", "crown", 5, 280),
  GARE("Gare Saint-Lazare", "St-Lazare"),
  P("Clamart", "Clamart", "tree-pine", 6, 300),
  P("Issy-les-Moulineaux", "Issy", "laptop", 6, 300),
  P("Neuilly-sur-Seine", "Neuilly", "gem", 6, 350),
];

const JAIL = 8;
const START_BONUS = 200;
const JAIL_FEE = 50;
const LEVELS = ["Terrain", "Résidence", "Immeuble", "Tour"];
const LEVEL_MULT = [1, 5, 14, 30];

// Prix des constructions et loyer de base de chaque terrain.
SPACES.forEach((s, i) => {
  s.index = i;
  if (s.type === "prop") {
    s.build = Math.round((s.price * 0.6) / 10) * 10;
    s.rent = Math.max(4, Math.round(s.price / 10));
  }
});

// Cartes événements (originales). `run(g, p)` est appliquée par le moteur.
const CARDS = [
  { text: "Grève RATP : tu recules de 3 cases.", move: -3 },
  { text: "Tu trouves un billet de 50 € dans le métro.", cash: 50 },
  { text: "Amende de stationnement : paye 60 € à la cagnotte.", cash: -60 },
  { text: "C'est ton anniversaire : chaque joueur t'offre 20 €.", fromEach: 20 },
  { text: "Ravalement de façade : paye 25 € par niveau construit.", perLevel: 25 },
  { text: "Retour à la case Départ (tu touches la prime).", goto: 0 },
  { text: "Visite à Versailles : avance jusque-là.", goto: 27 },
  { text: "Tu files à la gare la plus proche.", nearestRer: true },
  { text: "Garde à vue surprise : direction la prison !", jail: true },
  { text: "Libéré sous caution : garde cette carte pour sortir de prison.", jailCard: true },
  { text: "Les soldes, c'est toi qui vends : reçois 100 €.", cash: 100 },
  { text: "Livraison ratée : paye 30 € à la cagnotte.", cash: -30 },
  { text: "Ta cagnotte en ligne a cartonné : reçois 150 €.", cash: 150 },
  { text: "Panne de voiture sur l'A86 : paye 80 € à la cagnotte.", cash: -80 },
  { text: "Prime de fin d'année : reçois 100 €.", cash: 100 },
  { text: "Tu payes la tournée en terrasse : donne 15 € à chaque joueur.", toEach: 15 },

  // Cartes de la bande
  { text: "Frisko te vomit dessus : pressing en urgence, paye 60 €.", cash: -60 },
  { text: "On t'a cramé en train d'utiliser ta VM : amende de 100 €.", cash: -100 },
  { text: "Nora Izri t'envoie un message… tu perds tous tes moyens : paye 50 €.", cash: -50 },
  { text: "Ton parrainage Boursorama / Revolut est validé : reçois 80 €.", cash: 80 },
  { text: "Nil devient un fleuve et tu avais investi dessus : reçois 150 €.", cash: 150 },
  { text: "Anys va chier, l'odeur t'arrive au nez : tu fuis en taxi, paye 40 €.", cash: -40 },
  { text: "La meuf d'Adrien te taxe ton argent. Dommage : paye 70 €.", cash: -70 },
  { text: "Merwan t'invite à un afterwork… mais c'est toi qui payes les boissons : 90 €.", cash: -90 },

  // Cartes classiques
  { text: "Tu revends ta vieille console sur Leboncoin : reçois 60 €.", cash: 60 },
  { text: "Ton passe Navigo a expiré pendant un contrôle : amende de 35 €.", cash: -35 },
  { text: "Remboursement des impôts : reçois 120 €.", cash: 120 },
  { text: "Ton téléphone tombe dans la Seine : paye 100 €.", cash: -100 },
  { text: "Ta tante te glisse un billet en douce : reçois 40 €.", cash: 40 },
  { text: "Tu gagnes au loto du bar-tabac : reçois 50 €.", cash: 50 },
];

const PLAYER_COLORS = ["#f87171", "#60a5fa", "#4ade80", "#facc15", "#c084fc", "#fb923c"];
