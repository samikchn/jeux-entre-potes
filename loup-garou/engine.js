// Règles du Loup-Garou, sans interface. L'hôte est le seul à faire tourner ce code
// pendant une partie en ligne ; les fonctions modifient `g` directement.
//
// Déroulé d'une nuit, en 3 étapes :
//   1. loups (vote de la victime) + rôles indépendants (voyante, garde, renard…)
//   2. suites des loups : grand méchant loup, infect père des loups, loup blanc
//   3. sorcière (elle connaît alors les victimes)
// puis l'aube applique tout, et le jour se termine par le vote du village (à l'oral).
const LG = (() => {
  const WOLF_ROLES = ["loup", "grandloup", "infect", "loupblanc"];

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const P = (g, id) => g.players.find((p) => p.id === id);
  const alive = (g) => g.players.filter((p) => p.alive);
  const roleAlive = (g, role) => alive(g).find((p) => p.role === role);

  function compositionError(n, comp) {
    const specials = Object.entries(comp).reduce((s, [r, c]) => s + (r === "villageois" ? 0 : c), 0);
    const wolves = (comp.loup || 0) + (comp.grandloup || 0) + (comp.infect || 0);
    if (n < 4) return "Il faut au moins 4 joueurs.";
    if (wolves < 1) return "Il faut au moins un loup (Loup-garou, Grand méchant loup ou Infect).";
    if (specials > n) return `Trop de rôles : ${specials} rôles pour ${n} joueurs.`;
    if (wolves + (comp.loupblanc || 0) >= n - wolves) return "Trop de loups par rapport aux autres joueurs.";
    return null;
  }

  function newGame(players, comp) {
    let roles = [];
    for (const [role, count] of Object.entries(comp)) {
      if (role !== "villageois") for (let i = 0; i < count; i++) roles.push(role);
    }
    while (roles.length < players.length) roles.push("villageois");
    roles = shuffle(roles);

    const g = {
      phase: "night",
      night: 1,
      step: 1,
      seats: players.map((p) => p.id), // ordre autour de la table
      players: players.map((p, i) => ({
        id: p.id,
        name: p.name,
        role: roles[i],
        alive: true,
        wolf: WOLF_ROLES.includes(roles[i]),
        lives: roles[i] === "ancien" ? 2 : 1,
        charmed: false,
        doused: false,
        revealed: false,
      })),
      actions: {}, // "<id>:<tâche>" -> choix, pour l'étape en cours
      nd: {}, // résultats de la nuit en cours
      priv: {}, // infos secrètes par joueur
      news: [], // annonces publiques
      deaths: [], // morts depuis la dernière annonce
      lovers: null,
      model: null,
      lastGuard: null,
      potions: { heal: true, kill: true },
      infectUsed: false,
      wolfDied: false,
      foxPower: true,
      powersLost: false,
      rust: null,
      raven: null,
      hunters: [],
      after: null,
      winner: null,
    };
    skipEmptySteps(g);
    return g;
  }

  function tell(g, id, msg) {
    (g.priv[id] = g.priv[id] || []).push(msg);
  }

  // Tâches de nuit attendues pour l'étape en cours.
  function tasks(g) {
    if (g.phase !== "night") return [];
    const t = [];
    const add = (p, kind) => t.push({ pid: p.id, kind, key: p.id + ":" + kind });
    const powers = !g.powersLost;
    if (g.step === 1) {
      for (const p of alive(g)) {
        if (p.wolf && targetsForWolves(g).length) add(p, "wolves");
        if (p.role === "voyante" && powers) add(p, "voyante");
        if (p.role === "garde" && powers) add(p, "garde");
        if (p.role === "corbeau" && powers) add(p, "corbeau");
        if (p.role === "renard" && powers && g.foxPower) add(p, "renard");
        if (p.role === "pyromane") add(p, "pyromane");
        if (p.role === "flute") add(p, "flute");
        if (p.role === "cupidon" && g.night === 1) add(p, "cupidon");
        if (p.role === "enfant" && g.night === 1) add(p, "enfant");
      }
    } else if (g.step === 2) {
      const gml = roleAlive(g, "grandloup");
      if (gml && !g.wolfDied && targetsForWolves(g).some((p) => p.id !== g.nd.victim)) add(gml, "grandloup");
      const inf = roleAlive(g, "infect");
      if (inf && !g.infectUsed && g.nd.victim) add(inf, "infect");
      const white = roleAlive(g, "loupblanc");
      if (white && g.night % 2 === 0 && alive(g).some((p) => p.wolf && p.id !== white.id)) add(white, "loupblanc");
    } else if (g.step === 3) {
      const witch = roleAlive(g, "sorciere");
      if (witch && powers && (g.potions.heal || g.potions.kill)) add(witch, "sorciere");
    }
    return t;
  }

  const pending = (g) => tasks(g).filter((t) => !(t.key in g.actions));
  const targetsForWolves = (g) => alive(g).filter((p) => !p.wolf);

  // Victimes des loups que la sorcière peut sauver.
  function wolfVictims(g) {
    return [g.nd.infected ? null : g.nd.victim, g.nd.extra].filter(Boolean);
  }

  // Un joueur envoie son choix pour une tâche de nuit.
  function act(g, pid, kind, data = {}) {
    const task = tasks(g).find((t) => t.pid === pid && t.kind === kind);
    if (!task) return;
    const me = P(g, pid);
    const target = data.target ? P(g, data.target) : null;
    if (data.target && (!target || !target.alive)) return;

    if (kind === "wolves" && target && target.wolf) return;
    if (kind === "voyante") {
      if (!target || task.key in g.actions) return;
      tell(g, pid, `🔮 Nuit ${g.night} : ${target.name} est ${ROLES[target.role].name}${target.wolf && !ROLES[target.role].team.startsWith("loup") && target.role !== "loupblanc" ? " (devenu loup)" : ""}.`);
    }
    if (kind === "renard") {
      if (!target || task.key in g.actions) return;
      const trio = [target, ...neighbors(g, target.id)];
      const found = trio.some((p) => p.wolf);
      tell(g, pid, `🦊 Nuit ${g.night} : autour de ${target.name}, ${found ? "il y a au moins un loup !" : "aucun loup. Tu perds ton flair."}`);
      if (!found) g.foxPower = false;
    }
    if (kind === "garde" && (!target || target.id === g.lastGuard)) return;
    if (kind === "cupidon") {
      const [a, b] = (data.targets || []).map((id) => P(g, id));
      if (!a || !b || a === b) return;
      g.lovers = [a.id, b.id];
      tell(g, a.id, `💘 Tu es amoureux de ${b.name}. Si l'un meurt, l'autre aussi.`);
      tell(g, b.id, `💘 Tu es amoureux de ${a.name}. Si l'un meurt, l'autre aussi.`);
      tell(g, pid, `💘 Tu as uni ${a.name} et ${b.name}.`);
    }
    if (kind === "enfant") {
      if (!target || target.id === pid) return;
      g.model = target.id;
      tell(g, pid, `🧒 Ton modèle est ${target.name}. S'il meurt, tu deviens loup-garou.`);
    }
    if (kind === "flute") {
      const ids = (data.targets || []).filter((id) => P(g, id)?.alive && id !== pid);
      if (ids.length !== Math.min(2, alive(g).filter((p) => p.id !== pid && !p.charmed).length)) return;
    }
    if (kind === "pyromane" && data.target && target.doused) return;
    if (kind === "grandloup" && target && (target.wolf || target.id === g.nd.victim)) return;
    if (kind === "loupblanc" && target && (!target.wolf || target.id === pid)) return;
    if (kind === "sorciere") {
      if (data.heal && (!g.potions.heal || !wolfVictims(g).includes(data.heal))) return;
      if (data.kill && (!g.potions.kill || !P(g, data.kill)?.alive)) return;
    }

    g.actions[task.key] = data;
    if (!pending(g).length) advance(g);
  }

  // Termine l'étape en cours (appelé aussi par l'hôte pour ne plus attendre).
  function advance(g) {
    if (g.phase !== "night") return;
    if (g.step === 1) {
      g.nd.victim = majority(tasks(g).filter((t) => t.kind === "wolves").map((t) => g.actions[t.key]?.target));
      g.step = 2;
    } else if (g.step === 2) {
      const get = (kind) => Object.entries(g.actions).find(([k]) => k.endsWith(":" + kind))?.[1];
      g.nd.extra = get("grandloup")?.target || null;
      g.nd.white = get("loupblanc")?.target || null;
      if (get("infect")?.yes) g.nd.infected = g.nd.victim;
      g.step = 3;
    } else {
      dawn(g);
      return;
    }
    g.stepActions = { ...(g.stepActions || {}), ...g.actions };
    g.actions = {};
    skipEmptySteps(g);
  }

  function skipEmptySteps(g) {
    if (g.phase === "night" && !tasks(g).length) advance(g);
  }

  function majority(targets) {
    const count = {};
    targets.filter(Boolean).forEach((id) => (count[id] = (count[id] || 0) + 1));
    const max = Math.max(0, ...Object.values(count));
    if (!max) return null;
    const top = Object.keys(count).filter((id) => count[id] === max);
    return top[Math.floor(Math.random() * top.length)];
  }

  // Voisins vivants autour de la table (à gauche puis à droite).
  function neighbors(g, id) {
    const seats = g.seats.filter((s) => s === id || P(g, s).alive);
    const i = seats.indexOf(id);
    if (seats.length < 2) return [];
    const left = P(g, seats[(i + 1) % seats.length]);
    const right = P(g, seats[(i - 1 + seats.length) % seats.length]);
    return left === right ? [left] : [left, right];
  }

  function firstWolfLeft(g, id) {
    const i = g.seats.indexOf(id);
    for (let k = 1; k < g.seats.length; k++) {
      const p = P(g, g.seats[(i + k) % g.seats.length]);
      if (p.alive && p.wolf) return p.id;
    }
    return null;
  }

  function kill(g, id, cause) {
    const p = P(g, id);
    if (!p || !p.alive) return;
    p.alive = false;
    g.deaths.push({ id, cause });
    if (p.wolf) g.wolfDied = true;
    if (cause === "vote" && p.role === "ancien" && !g.powersLost) {
      g.powersLost = true;
      g.news.push("👴 Le village a éliminé l'Ancien : les villageois perdent leurs pouvoirs !");
    }
    if (p.role === "chasseur") g.hunters.push(id);
    if (g.lovers && g.lovers.includes(id)) kill(g, g.lovers.find((l) => l !== id), "chagrin");
    if (g.model === id) {
      const child = roleAlive(g, "enfant");
      if (child && !child.wolf) {
        child.wolf = true;
        tell(g, child.id, "🧒 Ton modèle est mort : tu deviens loup-garou ! Tu chasses avec les loups dès cette nuit.");
      }
    }
  }

  function dawn(g) {
    const all = { ...(g.stepActions || {}), ...g.actions };
    const get = (kind) => Object.entries(all).find(([k]) => k.endsWith(":" + kind))?.[1];
    g.news = [];
    g.deaths = [];

    const guard = get("garde")?.target || null;
    g.lastGuard = guard;
    const witch = get("sorciere") || {};
    if (witch.heal) g.potions.heal = false;
    if (witch.kill) g.potions.kill = false;

    if (g.rust) {
      const rusty = P(g, g.rust);
      if (rusty?.alive) {
        kill(g, g.rust, "tetanos");
      }
      g.rust = null;
    }

    let rustNext = null;
    const attack = (id) => {
      const p = id && P(g, id);
      if (!p || !p.alive || id === guard || id === witch.heal) return;
      if (p.role === "ancien" && p.lives > 1) {
        p.lives--;
        return;
      }
      kill(g, id, "loups");
      if (p.role === "chevalier" && !g.powersLost) rustNext = firstWolfLeft(g, id);
    };

    if (g.nd.infected) {
      const p = P(g, g.nd.infected);
      g.infectUsed = true;
      if (p.alive && !p.wolf) {
        p.wolf = true;
        tell(g, p.id, "🦠 Tu as été infecté cette nuit : tu es maintenant un loup-garou ! Tu gardes ton rôle, mais tu gagnes avec les loups.");
      }
    } else {
      attack(g.nd.victim);
    }
    attack(g.nd.extra);
    if (g.nd.white && g.nd.white !== guard) kill(g, g.nd.white, "loupblanc");
    if (witch.kill) kill(g, witch.kill, "poison");

    const pyro = get("pyromane") || {};
    if (pyro.ignite) {
      alive(g).filter((p) => p.doused).forEach((p) => kill(g, p.id, "feu"));
      g.players.forEach((p) => (p.doused = false));
    } else if (pyro.target) {
      P(g, pyro.target).doused = true;
    }

    const piper = roleAlive(g, "flute");
    for (const id of get("flute")?.targets || []) {
      const p = P(g, id);
      if (p.alive && !p.charmed) {
        p.charmed = true;
        tell(g, id, "🎶 Tu as été charmé par le joueur de flûte.");
      }
    }
    if (piper && (get("flute")?.targets || []).length) g.news.push("🎶 Le joueur de flûte a charmé de nouveaux joueurs.");

    g.rust = rustNext;
    const raven = get("corbeau")?.target;
    g.raven = raven && P(g, raven).alive ? raven : null;

    const tamer = roleAlive(g, "montreur");
    if (tamer && !g.powersLost) {
      g.news.push(neighbors(g, tamer.id).some((p) => p.wolf) ? "🐻 L'ours du montreur grogne !" : "🐻 L'ours du montreur reste calme.");
    }
    if (g.raven) g.news.push(`🐦 Le corbeau accuse ${P(g, g.raven).name} : 2 voix de plus contre lui au vote.`);
    if (!g.deaths.length) g.news.unshift("🌅 Personne n'est mort cette nuit.");

    g.actions = {};
    g.stepActions = {};
    g.nd = {};
    proceed(g, "day");
  }

  // Après des morts : fait tirer les chasseurs, vérifie la victoire, puis passe à la suite.
  function proceed(g, next) {
    if (g.hunters.length) {
      g.phase = "hunter";
      g.after = next;
      return;
    }
    if (checkWin(g)) return;
    if (next === "day") {
      g.phase = "day";
    } else {
      g.phase = "night";
      g.night++;
      g.step = 1;
      skipEmptySteps(g);
    }
  }

  function hunterShoot(g, pid, target) {
    if (g.phase !== "hunter" || g.hunters[0] !== pid) return;
    g.hunters.shift();
    if (target && P(g, target)?.alive) kill(g, target, "chasseur");
    proceed(g, g.after);
  }

  // L'hôte indique qui le village a éliminé (null : personne).
  function dayVote(g, id) {
    if (g.phase !== "day") return;
    g.news = [];
    g.deaths = [];
    const p = id && P(g, id);
    if (!p) {
      g.news.push("Le village n'a éliminé personne.");
    } else if (p.role === "idiot" && !p.revealed && !g.powersLost) {
      p.revealed = true;
      g.news.push(`🤪 ${p.name} est l'Idiot du village : il est épargné, mais ne votera plus.`);
    } else {
      kill(g, id, "vote");
    }
    g.raven = null;
    proceed(g, "night");
  }

  function checkWin(g) {
    const a = alive(g);
    const solo = (role) => a.length === 1 && a[0].role === role;
    let w = null;
    if (!a.length) w = "personne";
    else if (g.lovers && a.length === 2 && a.every((p) => g.lovers.includes(p.id))) w = "amoureux";
    else if (roleAlive(g, "flute") && a.every((p) => p.role === "flute" || p.charmed)) w = "flute";
    else if (solo("loupblanc")) w = "loupblanc";
    else if (solo("pyromane")) w = "pyromane";
    else {
      const threats = a.filter((p) => p.wolf || ["pyromane", "flute"].includes(p.role));
      if (!threats.length) w = "village";
      else if (a.every((p) => p.wolf && p.role !== "loupblanc")) w = "loups";
    }
    if (w) {
      g.winner = w;
      g.phase = "end";
    }
    return !!w;
  }

  const WIN = {
    village: { emoji: "🏡", title: "Le village gagne !" },
    loups: { emoji: "🐺", title: "Les loups-garous gagnent !" },
    amoureux: { emoji: "💘", title: "Les amoureux gagnent !" },
    loupblanc: { emoji: "🤍", title: "Le Loup blanc gagne seul !" },
    pyromane: { emoji: "🔥", title: "Le Pyromane gagne seul !" },
    flute: { emoji: "🎶", title: "Le Joueur de flûte a charmé tout le village !" },
    personne: { emoji: "💀", title: "Tout le monde est mort…" },
  };

  const CAUSE = {
    loups: "dévoré par les loups",
    loupblanc: "tué pendant la nuit",
    poison: "empoisonné",
    feu: "brûlé vif",
    tetanos: "mort du tétanos",
    chagrin: "mort de chagrin",
    chasseur: "abattu par le chasseur",
    vote: "éliminé par le village",
  };

  return {
    WIN, CAUSE, P, alive, neighbors, compositionError, newGame, tasks, pending, wolfVictims,
    targetsForWolves, act, advance, hunterShoot, dayVote,
  };
})();
