// Plateau d'Empire IDF : 40 cases (11 par côté, coins compris), villes d'Île-de-France
// regroupées par département, du moins cher au plus cher. Disposition classique des jeux de
// plateau : une gare au milieu de chaque côté, deux départements par côté (2 villes pour le
// premier et le dernier, 3 pour les autres).
const GROUPS = [
  { name: "Val-d'Oise (95)", color: "#a1887f" },
  { name: "Seine-Saint-Denis (93)", color: "#4fc3f7" },
  { name: "Seine-et-Marne (77)", color: "#f06292" },
  { name: "Essonne (91)", color: "#ffb74d" },
  { name: "Val-de-Marne (94)", color: "#e57373" },
  { name: "Yvelines (78)", color: "#fff176" },
  { name: "Hauts-de-Seine (92)", color: "#81c784" },
  { name: "Paris (75)", color: "#7986cb" },
];

// short : nom affiché sur le plateau (les cases sont petites). icon : icône Lucide qui évoque
// la ville (les vrais logos des mairies sont protégés).
const P = (name, short, icon, group, price) => ({ type: "prop", name, short, icon, group, price });
const GARE = (name, short) => ({ type: "rer", name, short, icon: "train-front", price: 200 });
// Services : le loyer dépend des dés (× 4, ou × 10 si on possède les deux).
const SERVICE = (name, short, icon) => ({ type: "util", name, short, icon, price: 150 });
// Deux paquets de cartes : Chance (surprises) et Les potes (les blagues de la bande).
const CHANCE = { type: "event", deck: "chance", name: "Chance", short: "Chance", icon: "sparkles" };
const POTES = { type: "event", deck: "potes", name: "Les potes", short: "Potes", icon: "users" };
const SPACES = [
  { type: "start", name: "Départ", short: "Départ" },
  // côté bas
  P("Argenteuil", "Argenteuil", "palette", 0, 60),
  POTES,
  P("Herblay-sur-Seine", "Herblay", "sailboat", 0, 60),
  { type: "tax", name: "Taxe foncière", short: "Taxe", amount: 150 },
  GARE("Gare du Nord", "Gare du Nord"),
  P("Bondy", "Bondy", "mic", 1, 100),
  CHANCE,
  P("Saint-Denis", "St-Denis", "trophy", 1, 100),
  P("Montreuil", "Montreuil", "apple", 1, 120),
  { type: "jail", name: "Prison de Fleury-Mérogis", short: "Prison" },
  // côté gauche
  P("Meaux", "Meaux", "wheat", 2, 140),
  SERVICE("Antenne 5G", "Antenne 5G", "radio-tower"),
  P("Melun", "Melun", "shield", 2, 140),
  P("Chessy", "Chessy", "ferris-wheel", 2, 160),
  GARE("Gare Montparnasse", "Montparnasse"),
  P("Évry-Courcouronnes", "Évry", "church", 3, 180),
  POTES,
  P("Massy", "Massy", "train-track", 3, 180),
  P("Orsay", "Orsay", "atom", 3, 200),
  { type: "pause", name: "Pause terrasse", short: "Pause" },
  // côté haut
  P("L'Haÿ-les-Roses", "L'Haÿ", "flower", 4, 220),
  CHANCE,
  P("Cachan", "Cachan", "graduation-cap", 4, 220),
  P("Vincennes", "Vincennes", "castle", 4, 240),
  GARE("Châtelet-Les Halles", "Châtelet"),
  P("Poissy", "Poissy", "car", 5, 260),
  P("Saint-Germain-en-Laye", "St-Germain", "trees", 5, 260),
  SERVICE("Data center", "Data center", "server"),
  P("Versailles", "Versailles", "crown", 5, 280),
  { type: "control", name: "Garde à vue", short: "Garde à vue" },
  // côté droit
  P("Clamart", "Clamart", "tree-pine", 6, 300),
  P("Issy-les-Moulineaux", "Issy", "laptop", 6, 300),
  POTES,
  P("Neuilly-sur-Seine", "Neuilly", "gem", 6, 320),
  GARE("Gare Saint-Lazare", "St-Lazare"),
  CHANCE,
  P("Paris 16e", "Paris 16e", "building-2", 7, 350),
  { type: "tax", name: "Impôt sur la fortune", short: "ISF", amount: 100 },
  P("Paris 7e", "Paris 7e", "landmark", 7, 400),
].map((s) => ({ ...s })); // copies : chaque case de cartes est un objet à part (index propre)

// Code postal et page Wikipédia (pour la photo affichée quand on s'arrête sur la case).
const CITY_INFO = {
  "Argenteuil": ["95100", "Argenteuil (Val-d'Oise)"],
  "Herblay-sur-Seine": ["95220", "Herblay-sur-Seine"],
  "Bondy": ["93140", "Bondy"],
  "Saint-Denis": ["93200", "Saint-Denis (Seine-Saint-Denis)"],
  "Montreuil": ["93100", "Montreuil (Seine-Saint-Denis)"],
  "Meaux": ["77100", "Meaux"],
  "Melun": ["77000", "Melun"],
  "Chessy": ["77700", "Chessy (Seine-et-Marne)"],
  "Évry-Courcouronnes": ["91000", "Évry-Courcouronnes"],
  "Massy": ["91300", "Massy (Essonne)"],
  "Orsay": ["91400", "Orsay"],
  "L'Haÿ-les-Roses": ["94240", "L'Haÿ-les-Roses"],
  "Cachan": ["94230", "Cachan"],
  "Vincennes": ["94300", "Vincennes"],
  "Poissy": ["78300", "Poissy"],
  "Saint-Germain-en-Laye": ["78100", "Saint-Germain-en-Laye"],
  "Versailles": ["78000", "Versailles"],
  "Clamart": ["92140", "Clamart"],
  "Issy-les-Moulineaux": ["92130", "Issy-les-Moulineaux"],
  "Neuilly-sur-Seine": ["92200", "Neuilly-sur-Seine"],
  "Paris 16e": ["75016", "16e arrondissement de Paris"],
  "Paris 7e": ["75007", "7e arrondissement de Paris"],
  "Gare du Nord": ["75010", "Gare de Paris-Nord"],
  "Gare Montparnasse": ["75015", "Gare de Paris-Montparnasse"],
  "Châtelet-Les Halles": ["75001", "Gare de Châtelet - Les Halles"],
  "Gare Saint-Lazare": ["75008", "Gare de Paris-Saint-Lazare"],
};

const JAIL = 10;
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

// Cartes (originales). deck : paquet « chance » (par défaut) ou « potes ».
const CARDS = [
  { text: "Grève RATP : tu recules de 3 cases.", move: -3 },
  { text: "Tu trouves un billet de 50 € dans le métro.", cash: 50 },
  { text: "Amende de stationnement : paye 60 € à la cagnotte.", cash: -60 },
  { text: "C'est ton anniversaire : chaque joueur t'offre 20 €.", fromEach: 20 },
  { text: "Ravalement de façade : paye 25 € par niveau construit.", perLevel: 25 },
  { text: "Retour à la case Départ (tu touches la prime).", goto: 0 },
  { text: "Visite à Versailles : avance jusque-là.", goto: 29 },
  { text: "Tu files à la gare la plus proche.", nearestRer: true },
  { text: "Garde à vue surprise : direction la prison !", jail: true },
  { text: "Libéré sous caution : garde cette carte pour sortir de prison.", jailCard: true },
  { text: "Les soldes, c'est toi qui vends : reçois 100 €.", cash: 100 },
  { text: "Livraison ratée : paye 30 € à la cagnotte.", cash: -30 },
  { text: "Ta cagnotte en ligne a cartonné : reçois 150 €.", cash: 150 },
  { text: "Panne de voiture sur l'A86 : paye 80 € à la cagnotte.", cash: -80 },
  { text: "Prime de fin d'année : reçois 100 €.", cash: 100 },
  { text: "Tu payes la tournée en terrasse : donne 15 € à chaque joueur.", toEach: 15 },
  { text: "Tu revends ta vieille console sur Leboncoin : reçois 60 €.", cash: 60 },
  { text: "Ton passe Navigo a expiré pendant un contrôle : amende de 35 €.", cash: -35 },
  { text: "Remboursement des impôts : reçois 120 €.", cash: 120 },
  { text: "Ton téléphone tombe dans la Seine : paye 100 €.", cash: -100 },
  { text: "Ta tante te glisse un billet en douce : reçois 40 €.", cash: 40 },
  { text: "Tu gagnes au loto du bar-tabac : reçois 50 €.", cash: 50 },

  // Paquet « Les potes »
  { deck: "potes", text: "Frisko te vomit dessus : pressing en urgence, paye 60 €.", cash: -60 },
  { deck: "potes", text: "On t'a cramé en train d'utiliser ta VM : amende de 100 €.", cash: -100 },
  { deck: "potes", text: "Nora Izri t'envoie un message… tu perds tous tes moyens : paye 50 €.", cash: -50 },
  { deck: "potes", text: "Ton parrainage Boursorama / Revolut est validé : reçois 80 €.", cash: 80 },
  { deck: "potes", text: "Nil devient un fleuve et tu avais investi dessus : reçois 150 €.", cash: 150 },
  { deck: "potes", text: "Anys va chier, l'odeur t'arrive au nez : tu fuis en taxi, paye 40 €.", cash: -40 },
  { deck: "potes", text: "La meuf d'Adrien te taxe ton argent. Dommage : paye 70 €.", cash: -70 },
  { deck: "potes", text: "Merwan t'invite à un afterwork… mais c'est toi qui payes les boissons : 90 €.", cash: -90 },
  { deck: "potes", text: "Les potes te payent ton grec au 129 : reçois 30 €.", cash: 30 },
  { deck: "potes", text: "Soirée chez toi : chaque joueur ramène 20 €.", fromEach: 20 },
  { deck: "potes", text: "Tu perds ton pari sur le match : donne 20 € à chaque joueur.", toEach: 20 },
  { deck: "potes", text: "Tu fais le chauffeur toute la soirée : chacun te file 10 € d'essence.", fromEach: 10 },
  { deck: "potes", text: "Un pote t'a balancé : direction la prison !", jail: true },
];

// Mode événements : au début d'un tour de table, l'Île-de-France est secouée.
// mod : effet temporaire sur les loyers ou les prix (rounds = durée en tours).
const WORLD_EVENTS = [
  { title: "Manif géante", text: "Tout Paris est bloqué : les loyers baissent de 30 % pendant 2 tours.", mod: { kind: "rent", mult: 0.7 }, rounds: 2 },
  { title: "Émeutes dans le 93", text: "Les loyers de Seine-Saint-Denis sont divisés par deux pendant 3 tours.", mod: { kind: "rent", groups: [1], mult: 0.5 }, rounds: 3 },
  { title: "Flambée du prix de l'essence", text: "Chaque joueur paye 50 € à la cagnotte.", payAll: 50 },
  { title: "Tweet de Donald Trump", text: "Les marchés paniquent : chaque joueur perd 10 % de son argent.", cashPct: 0.1 },
  { title: "Baisse des aides aux alternants", text: "Chaque joueur paye 80 € à la cagnotte.", payAll: 80 },
  { title: "Les JO reviennent à Paris", text: "Les loyers des gares doublent pendant 3 tours.", mod: { kind: "rent", type: "rer", mult: 2 }, rounds: 3, good: true },
  { title: "Bulle immobilière", text: "Les villes à vendre coûtent 30 % de plus pendant 3 tours.", mod: { kind: "price", mult: 1.3 }, rounds: 3 },
  { title: "Krach immobilier", text: "Les villes à vendre sont à -30 % pendant 2 tours : c'est le moment d'acheter !", mod: { kind: "price", mult: 0.7 }, rounds: 2, good: true },
  { title: "Grève générale à la RATP", text: "Les gares ne rapportent plus rien pendant 2 tours.", mod: { kind: "rent", type: "rer", mult: 0 }, rounds: 2 },
  { title: "Anniversaire de Disneyland", text: "Les loyers de Seine-et-Marne augmentent de 50 % pendant 3 tours.", mod: { kind: "rent", groups: [2], mult: 1.5 }, rounds: 3, good: true },
  { title: "Gentrification de l'Ouest", text: "Loyers des Hauts-de-Seine et des Yvelines +40 % pendant 3 tours.", mod: { kind: "rent", groups: [5, 6], mult: 1.4 }, rounds: 3, good: true },
  { title: "Panne géante de la fibre", text: "Les services ne rapportent plus rien pendant 2 tours.", mod: { kind: "rent", type: "util", mult: 0 }, rounds: 2 },
  { title: "Fashion Week", text: "Les loyers de Paris augmentent de 50 % pendant 3 tours.", mod: { kind: "rent", groups: [7], mult: 1.5 }, rounds: 3, good: true },
  { title: "Prime de Noël", text: "Chaque joueur reçoit 100 €.", giveAll: 100, good: true },
  { title: "Canicule", text: "Tout le monde file en terrasse : la cagnotte double !", potDouble: true, good: true },
  { title: "Contrôle fiscal général", text: "Chaque joueur paye 5 % de son patrimoine.", worthPct: 0.05 },
];

// Qui t'envoie en prison, et qui t'en sort (affichage seulement).
const JAILERS = ["Bassem", "Netanyahou"];
const LIBERATOR = "Lassalle";

const PLAYER_COLORS = ["#f87171", "#60a5fa", "#4ade80", "#facc15", "#c084fc", "#fb923c"];
