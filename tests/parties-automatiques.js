// Parties automatiques sur les trois moteurs de jeu : cherche les plantages et les blocages.
// Usage : node fuzz.js <dossier du projet> [nombre de parties]
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = process.argv[2], N = +(process.argv[3] || 300);
const load = (...files) => {
  const ctx = vm.createContext({ console, Math, Date, JSON, Object, Array, Number, String, Set, Map });
  // `const X = ...` au niveau du script n'est pas visible hors du script : on les expose à la fin
  const code = files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n;\n");
  const names = [...code.matchAll(/^const (\w+) =/gm)].map((m) => m[1]);
  vm.runInContext(code + `\n;this.__x = {${names.join(",")}};`, ctx);
  return ctx.__x;
};
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const errors = {};
const note = (game, e) => { const k = game + " : " + String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e); errors[k] = (errors[k] || 0) + 1; };

// ---------- Empire ----------
{
  const { EM, SPACES } = load("empire/board.js", "empire/engine.js");
  let ended = 0, stuck = 0;
  for (let n = 0; n < N; n++) {
    const np = 2 + rnd(5);
    const players = Array.from({ length: np }, (_, i) => ({ id: "p" + i, name: "J" + i, bot: true }));
    const g = EM.newGame(players, { mode: n % 2 ? "tours" : "faillite", maxRounds: 10 + rnd(30), events: n % 3 === 0 });
    let now = 1e6, steps = 0;
    try {
      while (g.stage !== "end" && steps++ < 60000) {
        now += 900;
        // Un joueur au hasard fait parfois n'importe quoi (abandon, offres bizarres, actions hors tour)
        if (Math.random() < 0.004) EM.act(g, pick(g.players).id, "bankrupt", {}, now);
        if (Math.random() < 0.02) EM.act(g, pick(g.players).id, "bid", { amount: pick([NaN, -5, 1e9, "abc", undefined, 30, 55.5]) }, now);
        if (Math.random() < 0.02) EM.act(g, pick(g.players).id, "propose", pick([{}, { to: "p0" }, { to: "p1", give: { props: [1], cash: -3 }, get: { props: "x", cash: NaN } }, { to: "zz", give: { props: [], cash: 10 }, get: { props: [], cash: 0 } }]), now);
        if (Math.random() < 0.02) EM.act(g, pick(g.players).id, pick(["sellProp", "sellLevel", "build"]), { space: pick([rnd(SPACES.length), -1, 999, "a", undefined]) }, now);
        if (Math.random() < 0.01) EM.act(g, pick(g.players).id, pick(["payDebt", "endTurn", "buy", "auction", "roll", "jailPay", "jailCard", "respond", "cancelTrade"]), {}, now);
        const a = EM.tick(g, now), b = EM.botStep(g, now);
        // invariants
        for (const p of g.players) if (!Number.isFinite(p.cash) || p.cash < 0) throw new Error("argent invalide : " + p.cash);
        if (!Number.isFinite(g.pot) || g.pot < 0) throw new Error("cagnotte invalide : " + g.pot);
        if (g.stage === "debt" && !g.debt) throw new Error("étape dette sans dette");
        if (g.stage !== "auction" && g.auction) throw new Error("enchère fantôme (étape " + g.stage + ")");
        if (g.auction && !Number.isFinite(g.auction.bid)) throw new Error("enchère invalide : " + g.auction.bid);
        if (EM.current(g).bankrupt && g.stage !== "end") throw new Error("le joueur du tour est en faillite");
        if (!a && !b && g.stage !== "auction" && g.stage !== "end") { stuck++; note("Empire", "partie bloquée à l'étape " + g.stage); break; }
      }
      if (g.stage === "end") ended++; else if (steps >= 60000) note("Empire", "partie sans fin");
    } catch (e) { note("Empire", e); }
  }
  console.log(`Empire : ${ended}/${N} parties terminées`);
}

// ---------- Loup-Garou ----------
{
  const { LG, ROLES } = load("loup-garou/roles.js", "loup-garou/engine.js");
  const special = Object.keys(ROLES).filter((r) => r !== "villageois");
  let ended = 0, tried = 0;
  for (let n = 0; n < N * 3; n++) {
    const np = 4 + rnd(12);
    const comp = { loup: 1 + rnd(2) };
    for (const r of special) if (r !== "loup" && Math.random() < 0.45) comp[r] = 1;
    if (LG.compositionError(np, comp)) continue;
    tried++;
    const players = Array.from({ length: np }, (_, i) => ({ id: "p" + i, name: "J" + i }));
    try {
      const g = LG.newGame(players, comp);
      let steps = 0;
      while (g.phase !== "end" && steps++ < 3000) {
        const alive = LG.alive(g);
        if (g.phase === "night") {
          const todo = LG.pending(g);
          if (!todo.length) { LG.advance(g); continue; }
          const t = pick(todo), others = alive.filter((p) => p.id !== t.pid);
          const tg = () => pick(alive).id;
          let data = { target: tg() };
          if (t.kind === "cupidon") data = { targets: [tg(), tg()] };
          if (t.kind === "flute") data = { targets: [pick(others)?.id, pick(others)?.id].filter(Boolean) };
          if (t.kind === "infect") data = { yes: Math.random() < 0.5 };
          if (t.kind === "pyromane") data = pick([{}, { target: tg() }, { ignite: true }]);
          if (t.kind === "sorciere") data = pick([{}, { heal: LG.wolfVictims(g)[0] }, { kill: tg() }]);
          if (Math.random() < 0.1) data = {};
          const before = LG.pending(g).length;
          LG.act(g, t.pid, t.kind, data);
          // choix refusé plusieurs fois : l'hôte passe (bouton « ne plus attendre »)
          if (g.phase === "night" && LG.pending(g).length === before && Math.random() < 0.3) LG.advance(g);
        } else if (g.phase === "hunter") {
          LG.hunterShoot(g, g.hunters[0], Math.random() < 0.8 ? pick(alive)?.id : null);
        } else if (g.phase === "day") {
          LG.dayVote(g, pick([null, pick(alive).id, pick(g.players).id, "inconnu"]));
        } else throw new Error("phase inconnue : " + g.phase);
        if (g.lovers && new Set(g.lovers.map((id) => LG.P(g, id).alive)).size > 1 && g.phase !== "hunter") throw new Error("un seul amoureux est mort");
      }
      if (g.phase === "end") ended++; else note("Loup-Garou", "partie sans fin (" + g.phase + ")");
    } catch (e) { note("Loup-Garou", e); }
  }
  console.log(`Loup-Garou : ${ended}/${tried} parties terminées`);
}

// ---------- Undercover ----------
{
  const { UC } = load("undercover/words.js", "undercover/engine.js");
  let ended = 0, tried = 0;
  for (let n = 0; n < N * 3; n++) {
    const np = 3 + rnd(10), c = Math.random() < 0.5 ? UC.defaultCounts(np) : { undercover: rnd(4), white: rnd(2) };
    if (!UC.countsValid(np, c.undercover, c.white)) continue;
    tried++;
    try {
      const s = UC.newGame(Array.from({ length: np }, (_, i) => ({ id: "p" + i, name: "J" + i })), c);
      if (UC.player(s, s.order[0]).role === "white") throw new Error("Mr. White parle en premier");
      let steps = 0;
      while (s.phase !== "end" && steps++ < 2000) {
        const alive = UC.alivePlayers(s);
        if (s.phase === "play") UC.startVote(s);
        else if (s.phase === "vote") {
          for (const p of alive) UC.castVote(s, p.id, pick(s.candidates || alive.map((x) => x.id)));
          if (UC.allVoted(s) || Math.random() < 0.3) UC.resolveVote(s);
        } else if (s.phase === "guess") UC.submitWhiteGuess(s, Math.random() < 0.3 ? s.civilWord.toUpperCase() + " " : "nimporte");
        else if (s.phase === "result") UC.nextRound(s);
        else throw new Error("phase inconnue : " + s.phase);
      }
      if (s.phase === "end" && s.winner) ended++; else note("Undercover", "partie sans fin (" + s.phase + ")");
    } catch (e) { note("Undercover", e); }
  }
  console.log(`Undercover : ${ended}/${tried} parties terminées`);
}

const list = Object.entries(errors).sort((a, b) => b[1] - a[1]);
console.log(list.length ? "\nPROBLÈMES :\n" + list.map(([k, v]) => `  ${v}×  ${k}`).join("\n") : "\nAucun problème trouvé.");
