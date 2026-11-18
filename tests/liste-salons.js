// Vérifie la liste des salons (js/common.js) avec des données normales et des données piégées.
const fs = require("fs"), vm = require("vm"), path = require("path");
const store = { "uc-id": "moi12345" };
const ctx = vm.createContext({
  console, Math, Date, JSON, Object, Number, String, Array, encodeURIComponent,
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) },
  document: { addEventListener() {}, createElement: () => ({}), body: { appendChild() {}, dataset: {} } },
  navigator: {}, window: {}, confirm: () => true,
});
vm.runInContext(fs.readFileSync(path.join(process.argv[2], "js/common.js"), "utf8") + ";this.C = Common;", ctx);
const C = ctx.C;
const ok = { game: "empire", code: "ABCD", host: "Sami <b>", hostId: "moi12345", players: 3, status: "playing", at: 1 };
const html = C.roomsView([
  ok,
  { ...ok, code: "');alert(1);('", hostId: "x" },
  { ...ok, code: "WXYZ", players: "<img src=x onerror=alert(1)>", hostId: "x" },
  { ...ok, game: "constructor", code: "QQQQ" },
  { ...ok, game: "undercover", code: "EFGH", players: 1, status: "lobby", hostId: "x" },
], { root: "../" });
const checks = {
  "salon normal affiché": html.includes("Empire IDF · ABCD") && html.includes("3 joueurs · partie en cours"),
  "nom de l'hôte échappé": html.includes("Sami &lt;b&gt;") && !html.includes("Sami <b>"),
  "bouton Supprimer sur mon salon": html.includes("Common.askClose('empire', 'ABCD')"),
  "code piégé écarté": !html.includes("alert(1)"),
  "nombre de joueurs piégé neutralisé": !html.includes("<img") && html.includes("Empire IDF · WXYZ"),
  "jeu inconnu écarté": !html.includes("QQQQ"),
  "autre jeu affiché": html.includes("Undercover · EFGH") && html.includes("1 joueur · en attente"),
  "lien Rejoindre": html.includes('href="../empire/?salon=ABCD"'),
};
let bad = 0;
for (const [k, v] of Object.entries(checks)) { console.log((v ? "OK   " : "ECHEC") + " " + k); if (!v) bad++; }
process.exit(bad ? 1 : 0);
