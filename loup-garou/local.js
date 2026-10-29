// Partie sur un seul téléphone avec le narrateur vocal : la nuit, l'app appelle chaque rôle
// à voix haute ; la personne concernée prend le téléphone, agit, puis le repose.
// Un rôle absent ou mort est quand même appelé (avec une attente) pour ne rien trahir.
const Auto = (() => {
  // Appels de la nuit, dans l'ordre. `step` : étape du moteur (voir engine.js).
  const CALLS = [
    { kind: "cupidon", step: 1, first: true, wake: "Cupidon se réveille. Prends le téléphone et choisis les deux amoureux.", sleep: "Cupidon se rendort." },
    { kind: "enfant", step: 1, first: true, wake: "L'Enfant sauvage se réveille et choisit son modèle.", sleep: "L'Enfant sauvage se rendort." },
    { kind: "garde", step: 1, wake: "Le Garde se réveille et choisit qui protéger cette nuit.", sleep: "Le Garde se rendort." },
    { kind: "voyante", step: 1, wake: "La Voyante se réveille. Prends le téléphone et désigne le joueur dont tu veux connaître le rôle.", sleep: "La Voyante se rendort." },
    { kind: "renard", step: 1, wake: "Le Renard se réveille et flaire un joueur.", sleep: "Le Renard se rendort." },
    { kind: "corbeau", step: 1, wake: "Le Corbeau se réveille et peut désigner un suspect.", sleep: "Le Corbeau se rendort." },
    { kind: "pyromane", step: 1, wake: "Le Pyromane se réveille.", sleep: "Le Pyromane se rendort." },
    { kind: "flute", step: 1, wake: "Le Joueur de flûte se réveille et charme deux joueurs.", sleep: "Le Joueur de flûte se rendort." },
    { kind: "wolves", role: "loup", step: 1, emoji: "🐺", name: "Les Loups-garous", wake: "Les Loups-garous se réveillent, se reconnaissent, et choisissent ensemble une victime. Un seul loup prend le téléphone.", sleep: "Les Loups-garous se rendorment." },
    { kind: "grandloup", step: 2, wake: "Le Grand méchant loup se réveille et peut choisir une deuxième victime.", sleep: "Le Grand méchant loup se rendort." },
    { kind: "infect", step: 2, wake: "L'Infect père des loups se réveille.", sleep: "L'Infect père des loups se rendort." },
    { kind: "loupblanc", step: 2, even: true, wake: "Le Loup blanc se réveille.", sleep: "Le Loup blanc se rendort." },
    { kind: "sorciere", step: 3, wake: "La Sorcière se réveille. Prends le téléphone : tu vas voir la victime de cette nuit.", sleep: "La Sorcière se rendort." },
  ];

  // seen : nombre d'infos secrètes (game.priv) déjà montrées à chaque joueur.
  const st = { screen: null, call: null, real: false, actor: null, viewer: null, result: "", story: "", peek: null, run: 0, seen: {}, secretFor: null };
  let resolveTap = null;

  const g = () => S.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitTap = () => new Promise((r) => (resolveTap = r));
  function tap(value) {
    const r = resolveTap;
    resolveTap = null;
    if (r) r(value);
  }
  function show(screen, extra = {}) {
    Object.assign(st, { screen }, extra);
    render();
  }

  // Chaque attente vérifie que la partie n'a pas été quittée entre-temps.
  class Stopped extends Error {}
  async function step(token, promise) {
    const v = await promise;
    if (token !== st.run) throw new Stopped();
    return v;
  }

  async function start() {
    const token = ++st.run;
    st.seen = {};
    try {
      await intro(token);
      while (g().phase !== "end") {
        if (g().phase === "night") await night(token);
        else if (g().phase === "hunter") await hunter(token);
        else await day(token);
      }
      await ending(token);
    } catch (e) {
      if (!(e instanceof Stopped)) throw e;
    }
  }

  function stop() {
    st.run++;
    tap(null);
    Narrator.stop();
    Object.assign(st, { screen: null, peek: null, viewer: null, story: "" });
  }

  async function say(token, text) {
    await step(token, Narrator.speak(text));
  }

  // Lit l'annonce, racontée par l'IA si une clé est enregistrée.
  async function announce(token, facts, plain) {
    st.story = "";
    const story = Narrator.apiKey() ? await step(token, Narrator.tell(facts)) : null;
    st.story = story || "";
    render();
    await say(token, story || plain);
  }

  async function intro(token) {
    const names = g().players.map((p) => p.name).join(", ");
    show("dusk");
    // Première phrase lancée directement par l'appui (obligatoire pour la voix sur iPhone),
    // avant d'attendre une éventuelle réponse de l'IA.
    await say(token, "La partie commence.");
    await announce(token,
      `Début de la partie avec ${g().players.length} joueurs : ${names}. Souhaite la bienvenue au village et annonce que la première nuit tombe et que tout le monde ferme les yeux.`,
      "Bienvenue au village. La première nuit tombe. Tout le monde ferme les yeux.");
  }

  async function night(token) {
    const game = g();
    if (game.night > 1) {
      show("dusk", { story: "" });
      await say(token, "La nuit tombe sur le village. Tout le monde ferme les yeux.");
    }
    const present = new Set(game.players.map((p) => p.role));
    for (const call of CALLS) {
      if (call.first && game.night !== 1) continue;
      if (call.even && game.night % 2 !== 0) continue;
      if (!present.has(call.role || call.kind) && !(call.kind === "wolves")) continue;
      await doCall(token, call);
    }
    while (game.phase === "night") LG.advance(game);
    await dawn(token);
  }

  const unseen = (pid) => (g().priv[pid] || []).slice(st.seen[pid] || 0);
  const markSeen = (pid) => (st.seen[pid] = (g().priv[pid] || []).length);

  // Tour de table : chacun prend le téléphone à son tour et lit son message secret (amoureux,
  // infection…). Tout le monde passe, même sans message, pour ne rien trahir.
  async function secretRound(token, force) {
    const game = g();
    const players = game.seats.map((id) => LG.P(game, id)).filter((p) => p.alive);
    if (game.phase !== "day") return;
    if (!force && !players.some((p) => unseen(p.id).length)) return;
    show("secret-intro");
    const ready = waitTap();
    await say(token, "Avant le débat, passez-vous le téléphone dans l'ordre de la table. Chacun lit son message secret, puis le donne à son voisin.");
    await step(token, ready);
    for (const p of players) {
      show("secret-pass", { secretFor: p.id });
      await step(token, waitTap());
      show("secret");
      await step(token, waitTap());
      markSeen(p.id);
    }
    show("secret-done");
    await say(token, "Tout le monde a lu son message. Le débat peut commencer.");
  }

  function tasksFor(kind) {
    return LG.pending(g()).filter((t) => t.kind === kind);
  }

  async function doCall(token, call) {
    const game = g();
    while (game.phase === "night" && game.step < call.step) LG.advance(game);
    let real;
    if (call.kind === "amoureux") real = !!game.lovers;
    else real = game.phase === "night" && tasksFor(call.kind).length > 0;
    st.actor = real && call.kind !== "amoureux" ? tasksFor(call.kind)[0].pid : null;

    show("call", { call, real, result: "" });
    const ready = waitTap(); // un appui pendant la voix compte aussi
    await say(token, call.wake);

    if (call.kind === "amoureux") {
      if (real) show("lovers");
      await step(token, Promise.race([sleep(9000), ready]));
    } else if (real) {
      await step(token, ready); // « J'ai le téléphone »
      show("task");
      await step(token, waitTap()); // action envoyée
      if (st.result) {
        show("result");
        await step(token, waitTap());
      }
    } else {
      // Rôle absent, mort ou sans pouvoir : on fait semblant d'attendre.
      const tapped = await step(token, Promise.race([sleep(6000 + Math.random() * 6000), ready]));
      if (tapped) {
        show("nopower");
        await step(token, sleep(2500));
      }
    }
    show("call", { real: false });
    await say(token, call.sleep);
  }

  // Applique le choix fait sur l'écran par la personne qui a le téléphone.
  function act(kind, data) {
    const game = g();
    const before = LG.pending(game).filter((t) => t.kind === kind).map((t) => t.key);
    if (kind === "wolves") {
      for (const t of LG.tasks(game).filter((t) => t.kind === "wolves")) LG.act(game, t.pid, "wolves", data);
    } else {
      LG.act(game, st.actor, kind, data);
    }
    const stillPending = LG.pending(game).some((t) => before.includes(t.key)) && game.phase === "night";
    if (stillPending) {
      toast("Choix impossible, essaie encore.");
      return render();
    }
    // Montre tout ce que cette personne n'a pas encore lu (résultat du pouvoir, mais aussi
    // par exemple son message d'amoureux), puisqu'elle est seule avec le téléphone.
    st.result = st.actor && kind !== "wolves" ? unseen(st.actor).join(" ") : "";
    if (kind === "cupidon" && !st.result) st.result = "💘 C'est fait.";
    if (st.actor && kind !== "wolves") markSeen(st.actor);
    tap(true);
  }

  function deathFacts(deaths) {
    return deaths.map(({ id, cause }) => {
      const p = LG.P(g(), id);
      return `${p.name}, ${LG.CAUSE[cause]}. Son rôle : ${ROLES[p.role].name}.`;
    });
  }

  async function dawn(token) {
    const game = g();
    const facts = deathFacts(game.deaths);
    const news = game.news.slice();
    show("dawn", { story: "" });
    const next = waitTap();
    const plain = ["Le village se réveille.", ...facts, ...news].join(" ");
    await announce(token,
      `Le matin du jour ${game.night}. Morts de la nuit : ${facts.length ? facts.join(" ") : "aucun"}. Autres annonces à lire telles quelles : ${news.join(" ") || "aucune"}.`,
      plain);
    await step(token, next);
  }

  async function day(token) {
    // Le 1er jour avec Cupidon, on fait toujours le tour : les amoureux doivent se découvrir.
    const firstCupidDay = g().night === 1 && g().players.some((p) => p.role === "cupidon");
    await secretRound(token, firstCupidDay);
    show("day", { peek: null, viewer: null });
    const voted = waitTap();
    await say(token, "Débattez, puis votez à main levée. Touchez ensuite le joueur éliminé sur l'écran.");
    const id = await step(token, voted);
    const game = g();
    LG.dayVote(game, id || null);
    const facts = deathFacts(game.deaths);
    show("verdict", { story: "" });
    const next = waitTap();
    await announce(token,
      `Résultat du vote du village : ${facts.length ? facts.join(" ") : "personne n'est éliminé"}. ${game.news.join(" ")}`,
      [...facts, ...game.news].join(" ") || "Personne n'est éliminé.");
    await step(token, next);
  }

  async function hunter(token) {
    const game = g();
    const h = LG.P(game, game.hunters[0]);
    st.actor = h.id;
    const before = game.deaths.length;
    show("hunter");
    const shot = waitTap();
    await say(token, `${h.name} était Chasseur. Avant de mourir, prends le téléphone et désigne ta cible.`);
    const target = await step(token, shot);
    LG.hunterShoot(game, h.id, target || null);
    const facts = deathFacts(game.deaths.slice(before));
    if (facts.length) {
      show("verdict", { story: "" });
      const next = waitTap();
      await announce(token, `Le chasseur ${h.name} a tiré. ${facts.join(" ")}`, facts.join(" "));
      await step(token, next);
    }
  }

  async function ending(token) {
    const game = g();
    show("end", { story: "" });
    const roles = game.players.map((p) => `${p.name} : ${ROLES[p.role].name}`).join(", ");
    await announce(token, `Fin de la partie : ${LG.WIN[game.winner].title} Rôles : ${roles}. Conclus l'histoire du village.`, LG.WIN[game.winner].title);
  }

  // ---------- Écrans ----------

  function callInfo(call) {
    if (call.emoji) return { emoji: call.emoji, name: call.name };
    return { emoji: ROLES[call.kind].emoji, name: ROLES[call.kind].name };
  }

  const muteButton = () =>
    `<div class="row" style="justify-content:flex-end"><button class="icon secondary" onclick="Auto.mute()" aria-label="Son">${Narrator.isMuted() ? "🔇" : "🔊"}</button></div>`;
  const storyView = () => (st.story ? `<p class="story">« ${esc(st.story)} »</p>` : "");

  function view() {
    const game = g();
    const head = muteButton();
    const pill = (txt) => `<div class="phase-wrap"><span class="phase">${txt}</span></div>`;
    switch (st.screen) {
      case "dusk":
        return head + pill(`🌙 Nuit ${game.night}`) + card(`<div class="center"><div style="font-size:3rem">🌙</div><p>Posez le téléphone au centre. Tout le monde ferme les yeux…</p>${storyView()}</div>`);
      case "call": {
        const info = st.call ? callInfo(st.call) : { emoji: "🌙", name: "" };
        return head + pill(`🌙 Nuit ${game.night}`) + card(`
          <div class="center"><div style="font-size:3.5rem">${info.emoji}</div><h2>${esc(info.name)}</h2>
          <p class="muted">Les autres, gardez les yeux fermés.</p></div>
          <button onclick="Auto.tap(true)">✋ J'ai le téléphone</button>`);
      }
      case "nopower":
        return head + card(`<p class="center">Ce rôle ne peut pas agir cette nuit.<br>Repose le téléphone et ferme les yeux.</p>`);
      case "secret-intro":
        return head + pill(`☀️ Jour ${game.night}`) + card(`<div class="center"><div style="font-size:3rem">📨</div>
          <h2>Messages secrets</h2><p>Passez-vous le téléphone dans l'ordre de la table. Chacun lit son message, puis le donne à son voisin.</p></div>
          <button onclick="Auto.tap(true)">C'est parti</button>`);
      case "secret-pass": {
        const p = LG.P(game, st.secretFor);
        return head + card(`<div class="reveal">${avatar(p.name, true)}<p>Passe le téléphone à</p><div class="who">${esc(p.name)}</div></div>
          <button onclick="Auto.tap(true)">C'est moi, voir mon message</button>`);
      }
      case "secret": {
        const p = LG.P(game, st.secretFor);
        const msgs = unseen(p.id);
        return head + card(`<h2>🤫 ${esc(p.name)}, ton message</h2>
          ${msgs.length ? msgs.map((m) => `<p class="secret">${esc(m)}</p>`).join("") : `<p>Rien de nouveau pour toi.</p><p class="muted">Fais comme si tu lisais quelque chose 😉</p>`}
          <button onclick="Auto.tap(true)">Cacher et passer au suivant</button>`);
      }
      case "secret-done":
        return head + card(`<p class="center">✅ Tout le monde a lu son message.</p>`);
      case "task":
        return head + pill(`🌙 Nuit ${game.night}`) + (st.call.kind === "wolves" ? wolvesView() : taskView(LG.tasks(game).find((t) => t.pid === st.actor && t.kind === st.call.kind)));
      case "result":
        return head + card(`<h2>🤫 Pour toi seul</h2><p class="secret">${esc(st.result)}</p>
          <button onclick="Auto.tap(true)">J'ai fini, je repose le téléphone</button>`);
      case "dawn":
        return head + pill(`☀️ Jour ${game.night}`) + newsView("🌅 Cette nuit…") + (st.story ? card(storyView()) : "") +
          `<button onclick="Auto.tap(true)">Continuer</button>`;
      case "day":
        return head + pill(`☀️ Jour ${game.night}`) + dayView();
      case "verdict":
        return head + newsView("🗳️ Résultat") + (st.story ? card(storyView()) : "") + `<button onclick="Auto.tap(true)">Continuer</button>`;
      case "hunter": {
        const h = LG.P(game, game.hunters[0]);
        return head + card(`<h2>🏹 ${esc(h.name)}, qui emportes-tu avec toi ?</h2>${tiles(LG.alive(game), "Auto.tap")}`) +
          `<button class="secondary" onclick="Auto.tap(null)">Ne tirer sur personne</button>`;
      }
      case "end":
        return head + endView() + (st.story ? card(storyView()) : "");
    }
    return head + card(`<p class="center">…</p>`);
  }

  function wolvesView() {
    const game = g();
    const pack = LG.alive(game).filter((p) => p.wolf).map((p) => esc(p.name)).join(", ");
    return card(`
      <h2>🐺 Les Loups-garous</h2>
      <p>La meute : <b>${pack}</b></p>
      <p class="muted">Mettez-vous d'accord en silence, puis touchez la victime.</p>
      ${tiles(LG.targetsForWolves(game), "Auto.wolfPick")}`, "task");
  }

  function dayView() {
    const game = g();
    if (st.peek) {
      const p = LG.P(game, st.peek);
      if (st.viewer !== p.id) {
        return card(`<p class="center">Tu es bien <b>${esc(p.name)}</b> ?<br><span class="muted">Les autres, ne regardez pas l'écran.</span></p>
          <button onclick="Auto.peekConfirm()">Oui, montrer mon rôle</button>
          <button class="secondary" onclick="Auto.peek(null)">Annuler</button>`);
      }
      return roleCard(p, false, "this.classList.toggle('shown')") + secretsView() +
        `<button onclick="Auto.peek(null)">🙈 Cacher et rendre le téléphone</button>`;
    }
    return `
      ${newsView("🌅 Cette nuit…")}
      ${card(`
        <h2>🗳️ Qui le village élimine-t-il ?</h2>
        <p class="muted">Débattez, votez à main levée, puis touchez le joueur éliminé.</p>
        ${tiles(LG.alive(game), "Auto.vote")}
        <button class="secondary" onclick="Auto.vote(null)">Personne</button>`)}
      ${card(`
        <details id="peek">
          <summary><b>🔄 Revoir mon rôle</b></summary>
          <p class="muted">Prends le téléphone discrètement et touche ton prénom.</p>
          ${tiles(LG.alive(game), "Auto.peek")}
        </details>`)}
      ${seatsView()}
      ${leaveButton()}`;
  }

  return {
    start,
    stop,
    view,
    act,
    actor: () => st.actor,
    viewer: () => st.viewer,
    screen: () => st.screen,
    unseenCount: (pid) => unseen(pid).length,
    isRealCall: () => st.real,
    tap(v) {
      tap(v);
    },
    wolfPick(id) {
      if (confirm(`Dévorer ${LG.P(g(), id).name} ?`)) act("wolves", { target: id });
    },
    vote(id) {
      const label = id ? LG.P(g(), id).name + " est éliminé" : "Personne n'est éliminé";
      if (confirm(label + " ?")) tap(id);
    },
    peek(id) {
      st.peek = id;
      st.viewer = null;
      render();
    },
    peekConfirm() {
      st.viewer = st.peek;
      markSeen(st.viewer);
      render();
    },
    mute() {
      Narrator.toggleMute();
      render();
    },
  };
})();
