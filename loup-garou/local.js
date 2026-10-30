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
  const st = { screen: null, call: null, real: false, actor: null, viewer: null, result: "", story: "", peek: null, run: 0, seen: {}, secretFor: null,
    autoListen: localStorage.getItem("lg-ecoute") === "1", // écoute continue pendant le débat
    hearing: false, looping: false, addressNext: false, overheard: [], lastOverheard: "",
    showLog: localStorage.getItem("lg-log") === "1" }; // journal en direct
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
    Narrator.stopListening();
    Object.assign(st, { screen: null, peek: null, viewer: null, story: "", busy: null, deadPick: null, heard: "", reply: "" });
  }

  async function say(token, text) {
    await step(token, Narrator.speak(text));
  }

  // ---------- Narrateur IA (mode « ia ») ----------
  // L'IA ne connaît que les informations publiques : elle ne peut donc rien trahir.
  const aiMode = () => S.narration === "ia" && !!Narrator.apiKey();

  function systemPrompt() {
    const game = g();
    const seats = game.seats.map((id) => LG.P(game, id).name).join(", ");
    const counts = {};
    game.players.forEach((p) => (counts[p.role] = (counts[p.role] || 0) + 1));
    const roles = Object.entries(counts).map(([r, c]) => `${c} × ${ROLES[r].name} (${ROLES[r].desc})`).join(" ; ");
    return [
      "Tu es le narrateur, le maître du jeu, d'une partie de Loup-Garou entre amis réunis autour d'une table, avec un seul téléphone posé au centre.",
      "Tes réponses sont lues à voix haute par une synthèse vocale : parle naturellement, en français, en 1 à 4 phrases courtes. Pas d'emoji, pas de liste, pas de mise en forme.",
      "Ton style : conteur mystérieux, drôle et un peu taquin, comme un vrai animateur de soirée. Appelle les joueurs par leur prénom.",
      "Tu ne connais PAS les rôles secrets des joueurs vivants. N'invente jamais un fait de jeu : tu annonces seulement ce que l'application te donne dans les messages [Événement]. Si on te demande qui est loup, réponds avec humour que c'est au village de le découvrir.",
      "L'application gère elle-même les actions secrètes de la nuit, l'ordre des appels et l'élimination (les joueurs touchent l'écran). Toi, tu racontes, tu animes le débat, tu relances les joueurs silencieux, tu réponds aux questions sur les règles et tu rappelles de voter quand le débat traîne.",
      "Les messages [Un joueur dit] sont ce que les joueurs disent au micro (la transcription peut contenir des erreurs).",
      `Joueurs, dans l'ordre autour de la table : ${seats}.`,
      `Composition de la partie (connue de tous) : ${roles}.`,
      game.hideRoles ? "Mode obscur : les rôles des joueurs morts ne sont pas révélés. Ne les révèle jamais." : "",
    ].join("\n");
  }

  // Ajoute un message à la conversation et renvoie la réponse de l'IA (null en cas d'échec).
  async function aiReply(text) {
    st.chat.push({ role: "user", text });
    let history = st.chat.slice(-24);
    while (history.length && history[0].role !== "user") history = history.slice(1);
    // Fusionne les messages consécutifs du même côté (ex. un joueur parle pendant que l'IA
    // réfléchit encore) : l'IA attend une alternance joueurs / narrateur.
    history = history.reduce((acc, m) => {
      const last = acc[acc.length - 1];
      if (last && last.role === m.role) last.text += "\n" + m.text;
      else acc.push({ ...m });
      return acc;
    }, []);
    const reply = await Narrator.ask(systemPrompt(), history);
    if (reply) st.chat.push({ role: "assistant", text: reply });
    else {
      st.chat.pop();
      if (!st.aiWarned) toast("IA indisponible : " + (Narrator.lastError() || "pas de réponse") + ". Le narrateur simple prend le relais.");
      st.aiWarned = true;
    }
    return reply;
  }

  // Lit une annonce : improvisée par l'IA (mode ia), racontée par l'IA (voix + clé), ou texte simple.
  async function announce(token, facts, plain) {
    st.story = "";
    let story = null;
    if (aiMode()) story = await step(token, aiReply("[Événement] " + facts));
    else if (Narrator.apiKey() && S.narration === "voix") story = await step(token, Narrator.tell(facts));
    st.story = story || "";
    render();
    await say(token, story || plain);
  }

  async function intro(token) {
    const names = g().players.map((p) => p.name).join(", ");
    st.chat = [];
    st.aiWarned = false;
    show("dusk");
    // Première phrase lancée directement par l'appui (obligatoire pour la voix sur iPhone),
    // avant d'attendre une éventuelle réponse de l'IA.
    await say(token, "La partie commence.");
    await announce(token,
      `Début de la partie avec ${g().players.length} joueurs : ${names}. Souhaite la bienvenue au village, présente l'ambiance en deux phrases, puis annonce que la première nuit tombe et que tout le monde ferme les yeux.`,
      "Bienvenue au village. La première nuit tombe. Tout le monde ferme les yeux.");
  }

  async function night(token) {
    const game = g();
    if (game.night > 1) {
      show("dusk", { story: "" });
      if (aiMode()) await announce(token, `La nuit ${game.night} tombe. Dis à tout le monde de fermer les yeux, en une ou deux phrases.`, "La nuit tombe sur le village. Tout le monde ferme les yeux.");
      else await say(token, "La nuit tombe sur le village. Tout le monde ferme les yeux.");
    }
    const present = new Set(game.players.map((p) => p.role));
    if (S.discreet) {
      await tableNight(token, present);
    } else {
      for (const call of CALLS) {
        if (call.first && game.night !== 1) continue;
        if (call.even && game.night % 2 !== 0) continue;
        if (!present.has(call.role || call.kind) && !(call.kind === "wolves")) continue;
        await doCall(token, call);
      }
    }
    while (game.phase === "night") LG.advance(game);
    await dawn(token);
  }

  // Nuit discrète : le téléphone fait le tour de la table et TOUT LE MONDE le tient. Ceux qui
  // ont un pouvoir agissent ; les autres font un faux choix. Impossible de deviner qui a joué.
  // Un tour par étape du moteur (les suites des loups et la sorcière dépendent du 1er tour).
  async function tableNight(token, present) {
    const game = g();
    const rounds = [1];
    if (["grandloup", "infect", "loupblanc"].some((r) => present.has(r))) rounds.push(2);
    if (present.has("sorciere")) rounds.push(3);
    for (const [i, stepNo] of rounds.entries()) {
      while (game.phase === "night" && game.step < stepNo) LG.advance(game);
      show("round-intro", { round: i + 1, rounds: rounds.length });
      const go = waitTap();
      await say(token, i === 0
        ? "Le téléphone va faire le tour de la table. Quand tu le reçois, ouvre les yeux, fais ce qu'il t'indique, puis passe-le à ton voisin et referme les yeux."
        : "Encore un tour de table.");
      await step(token, go);
      for (const p of game.seats.map((id) => LG.P(game, id)).filter((q) => q.alive)) {
        show("pass", { passTo: p.id });
        await step(token, waitTap());
        st.actor = p.id;
        const mine = game.phase === "night" ? LG.pending(game).filter((t) => t.pid === p.id) : [];
        for (const t of mine) {
          if (game.phase !== "night" || !LG.pending(game).some((x) => x.key === t.key)) continue;
          show("task", { call: { kind: t.kind }, real: true, result: "" });
          await step(token, waitTap());
          if (st.result) {
            show("result");
            await step(token, waitTap());
          }
        }
        if (!mine.length) {
          show("decoy");
          await step(token, waitTap());
        }
      }
    }
    show("dusk", { story: "" });
    await say(token, "Tout le monde a joué. Fermez tous les yeux.");
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
    // Nuit discrète : chaque loup vote pour lui-même quand il a le téléphone.
    const solo = S.discreet || kind !== "wolves";
    const before = LG.pending(game).filter((t) => t.kind === kind && (!solo || t.pid === st.actor)).map((t) => t.key);
    if (!solo) {
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
      // Mode obscur : le rôle des morts reste secret.
      return g().hideRoles ? `${p.name}, ${LG.CAUSE[cause]}.` : `${p.name}, ${LG.CAUSE[cause]}. Son rôle : ${ROLES[p.role].name}.`;
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
      `Le matin du jour ${game.night}. Morts de la nuit : ${facts.length ? facts.join(" ") : "aucun."} Autres annonces à lire telles quelles : ${news.join(" ") || "aucune."}`,
      plain);
    await step(token, next);
  }

  async function day(token) {
    // Le 1er jour avec Cupidon, on fait toujours le tour : les amoureux doivent se découvrir.
    const firstCupidDay = g().night === 1 && g().players.some((p) => p.role === "cupidon");
    await secretRound(token, firstCupidDay);
    show("day", { peek: null, viewer: null, deadPick: null, deadView: null, heard: "", reply: "" });
    const voted = waitTap();
    const alive = LG.alive(g()).map((p) => p.name).join(", ");
    if (aiMode()) {
      await announce(token,
        `Le débat du jour ${g().night} commence. Encore en vie : ${alive}. Lance le débat en interpellant un ou deux joueurs par leur prénom, et rappelle qu'à la fin on vote à main levée puis qu'on touche le joueur éliminé sur l'écran.`,
        "Débattez, puis votez à main levée. Touchez ensuite le joueur éliminé sur l'écran.");
    } else {
      await say(token, "Débattez, puis votez à main levée. Touchez ensuite le joueur éliminé sur l'écran.");
    }
    if (aiMode() && st.autoListen) listenLoop(token);
    const id = await step(token, voted);
    Narrator.stopListening();
    const game = g();
    LG.dayVote(game, id || null);
    const facts = deathFacts(game.deaths);
    show("verdict", { story: "" });
    const next = waitTap();
    await announce(token,
      `Résultat du vote du village : ${facts.length ? facts.join(" ") : "personne n'est éliminé."} ${game.news.join(" ")}`,
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
    await announce(token, `Fin de la partie : ${LG.WIN[game.winner].title} Tu peux maintenant révéler tous les rôles : ${roles}. Conclus l'histoire du village avec un mot pour les gagnants.`, LG.WIN[game.winner].title);
  }

  // Écoute continue pendant le débat : le narrateur entend toute la discussion, la garde en
  // mémoire, et ne répond que si on l'interpelle (« narrateur… ») ou après un appui sur 🎤.
  async function listenLoop(token) {
    if (st.looping || !Narrator.canListen()) return;
    st.looping = true;
    while (token === st.run && st.screen === "day" && st.autoListen && aiMode()) {
      // On n'écoute pas pendant que le narrateur réfléchit ou parle (il s'entendrait).
      if (st.busy || (window.speechSynthesis && speechSynthesis.speaking)) {
        await sleep(300);
        continue;
      }
      st.hearing = true;
      render();
      const heard = await Narrator.listen();
      st.hearing = false;
      if (token !== st.run || st.screen !== "day" || !st.autoListen) break;
      if (!heard) {
        if (/refusé|not-allowed|service-not-allowed/.test(Narrator.lastError())) {
          st.autoListen = false;
          toast("L'écoute continue n'est pas autorisée sur ce téléphone : utilise le bouton 🎤.");
          break;
        }
        await sleep(300); // silence ou coupure : on relance l'écoute
        continue;
      }
      const addressed = st.addressNext || /narrat|ma[iî]tre du jeu/i.test(heard);
      st.addressNext = false;
      Narrator.log(addressed ? "➡️ phrase adressée au narrateur : il répond" : "📝 pas pour le narrateur : gardé en mémoire");
      if (!addressed) {
        st.overheard = [...(st.overheard || []), heard].slice(-12);
        st.lastOverheard = heard;
        render();
        continue;
      }
      st.heard = heard;
      const context = st.overheard?.length ? `[Ce qui s'est dit autour de la table] ${st.overheard.join(" / ")}\n` : "";
      st.overheard = [];
      await converse(token, `${context}[Un joueur dit] ${heard}`);
    }
    st.looping = false;
    st.hearing = false;
    render();
  }

  function toggleListen() {
    st.autoListen = !st.autoListen;
    localStorage.setItem("lg-ecoute", st.autoListen ? "1" : "0");
    if (st.autoListen && st.screen === "day") listenLoop(st.run);
    else Narrator.stopListening();
    render();
  }

  // Pendant le débat : un joueur parle au narrateur IA (appuyer pour parler).
  async function talk() {
    if (st.autoListen && st.looping) {
      // Écoute continue déjà active : la prochaine phrase entendue lui est adressée.
      st.addressNext = true;
      toast("🎤 Je t'écoute, parle maintenant.");
      return render();
    }
    if (st.busy) {
      if (st.busy === "listening") Narrator.stopListening();
      return;
    }
    if (!Narrator.canListen()) return toast("Ce navigateur ne sait pas écouter le micro.");
    const token = st.run;
    st.busy = "listening";
    render();
    const heard = await Narrator.listen();
    if (token !== st.run) return;
    if (!heard) {
      st.busy = null;
      render();
      return toast(Narrator.lastError() || "Je n'ai rien entendu, réessaie.");
    }
    st.heard = heard;
    await converse(token, `[Un joueur dit] ${heard}`);
  }

  // Le narrateur relance le débat de lui-même.
  async function nudge() {
    if (st.busy) return;
    const alive = LG.alive(g()).map((p) => p.name).join(", ");
    st.heard = "";
    await converse(st.run, `[Relance] Le débat ralentit. Relance-le avec une question ou une provocation à un joueur précis parmi : ${alive}.`);
  }

  async function converse(token, text) {
    st.busy = "thinking";
    render();
    const reply = await aiReply(text);
    if (token !== st.run) return;
    st.reply = reply || "";
    st.busy = reply ? "speaking" : null;
    render();
    if (reply) await Narrator.speak(reply);
    if (token !== st.run) return;
    st.busy = null;
    render();
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
      case "round-intro":
        return head + pill(`🌙 Nuit ${game.night}`) + card(`<div class="center"><div style="font-size:3rem">🔄</div>
          <h2>Tour de table ${st.rounds > 1 ? `${st.round} / ${st.rounds}` : ""}</h2>
          <p>Chacun prend le téléphone à son tour, même sans pouvoir : personne ne peut deviner qui agit.</p></div>
          <button onclick="Auto.tap(true)">C'est parti</button>`);
      case "pass": {
        const p = LG.P(game, st.passTo);
        return head + pill(`🌙 Nuit ${game.night}`) + card(`<div class="reveal">${avatar(p.name, true)}<p>Ferme les yeux et passe le téléphone à</p><div class="who">${esc(p.name)}</div></div>
          <button onclick="Auto.tap(true)">C'est moi</button>`);
      }
      case "decoy": {
        const p = LG.P(game, st.actor);
        return head + pill(`🌙 Nuit ${game.night}`) + card(`
          <h2>🌙 ${esc(p.name)}</h2>
          <p>Rien à faire pour toi cette nuit. Pour brouiller les pistes, touche le joueur que tu soupçonnes le plus.</p>
          ${tiles(LG.alive(game).filter((q) => q.id !== p.id), "Auto.tap")}`, "task");
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
    // Nuit discrète : chaque loup vote seul et voit les votes déjà faits par la meute.
    const votes = LG.tasks(game).filter((t) => t.kind === "wolves" && game.actions[t.key]?.target)
      .map((t) => `${esc(LG.P(game, t.pid).name)} → ${esc(LG.P(game, game.actions[t.key].target).name)}`);
    return card(`
      <h2>🐺 Les Loups-garous</h2>
      <p>La meute : <b>${pack}</b></p>
      ${S.discreet
        ? `${votes.length ? `<p>Votes de la meute : ${votes.join(", ")}</p>` : ""}<p class="muted">Vote pour la victime. En cas d'égalité entre les loups, tirage au sort.</p>`
        : `<p class="muted">Mettez-vous d'accord en silence, puis touchez la victime.</p>`}
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
    if (st.deadPick) {
      const p = LG.P(game, st.deadPick);
      if (!st.deadView) {
        return card(`<p class="center">Tu es bien <b>${esc(p.name)}</b>, mort ?<br><span class="muted">Tous les rôles vont s'afficher : les vivants ne regardent pas !</span></p>
          <button onclick="Auto.deadConfirm()">Oui, voir les rôles</button>
          <button class="secondary" onclick="Auto.deadPick(null)">Annuler</button>`);
      }
      return card(`<h2>💀 Tous les rôles</h2><ul class="players">${game.players.map((q) => `
          <li class="${q.alive ? "" : "dead"}">${avatar(q.name)}<span class="name">${esc(q.name)}${game.lovers?.includes(q.id) ? " 💘" : ""}${q.wolf && ROLES[q.role].team === "village" ? " 🐺" : ""}</span>${teamTag(q.role)}</li>`).join("")}
        </ul>`) + `<button onclick="Auto.deadPick(null)">🙈 Cacher et rendre le téléphone</button>`;
    }
    const dead = game.players.filter((p) => !p.alive);
    return `
      ${newsView("🌅 Cette nuit…")}
      ${aiMode() ? aiTalkView() : ""}
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
      ${dead.length ? card(`
        <details id="deadroles">
          <summary><b>💀 Rôles (réservé aux morts)</b></summary>
          <p class="muted">Les joueurs morts peuvent voir tous les rôles. Touche ton prénom.</p>
          ${tiles(dead, "Auto.deadPick")}
        </details>`) : ""}
      ${seatsView()}
      ${leaveButton()}`;
  }

  function aiTalkView() {
    const auto = st.autoListen;
    const status = st.busy === "thinking" ? "🤔 Le narrateur réfléchit…"
      : st.busy === "speaking" ? "🗣️ Le narrateur parle…"
      : st.busy === "listening" || st.hearing ? (st.addressNext ? "🔴 Je t'écoute…" : "🔴 Le narrateur écoute")
      : auto ? "🟡 Écoute en pause" : "⚪ Le narrateur n'écoute pas";
    const label = auto
      ? "🎤 Je parle au narrateur"
      : { listening: "⏹️ J'ai fini de parler", thinking: "🤔 Il réfléchit…", speaking: "🗣️ Il parle…" }[st.busy] || "🎤 Parler au narrateur";
    return card(`
      <h2>🤖 Le narrateur</h2>
      <p class="listen-status ${st.busy === "listening" || st.hearing ? "on" : ""}">${status}</p>
      ${st.lastOverheard && auto ? `<p class="muted" style="font-size:.8rem">Entendu : « ${esc(st.lastOverheard)} »</p>` : ""}
      ${st.heard ? `<p class="muted">Vous : « ${esc(st.heard)} »</p>` : ""}
      ${st.reply || st.story ? `<p class="story">« ${esc(st.reply || st.story)} »</p>` : ""}
      <button onclick="Auto.talk()" ${st.busy === "thinking" || st.busy === "speaking" ? "disabled" : ""}>${label}</button>
      <button class="secondary" onclick="Auto.nudge()" ${st.busy ? "disabled" : ""}>🎙️ Relancer le débat</button>
      <button class="tile ${auto ? "selected" : ""}" style="width:100%;align-items:flex-start;text-align:left;margin-top:10px" onclick="Auto.toggleListen()">
        <b>🎧 Écoute continue ${auto ? "activée" : "désactivée"}</b>
        <span class="muted" style="font-weight:400;font-size:.8rem">${auto
          ? "Il écoute toute la discussion et répond quand on dit « narrateur… » (ou après 🎤)."
          : "Il n'écoute que quand tu appuies sur 🎤 : appuie, parle, puis appuie à nouveau."}</span>
      </button>
      <button class="secondary" onclick="Auto.toggleLog()">🧾 ${st.showLog ? "Masquer" : "Afficher"} le journal en direct</button>
      ${st.showLog ? logView() : ""}`);
  }

  // Journal en direct : ce que fait le narrateur (écoute, IA, voix), pour comprendre un blocage.
  function logView() {
    const lines = Narrator.logLines().slice(-15).reverse();
    return `<div class="live-log">${lines.length ? lines.map((l) => `<div class="${l.includes("✖") ? "err" : ""}">${esc(l)}</div>`).join("") : "<div>Rien pour l'instant.</div>"}</div>`;
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
    deadPick(id) {
      st.deadPick = id;
      st.deadView = false;
      render();
    },
    deadConfirm() {
      st.deadView = true;
      render();
    },
    talk,
    nudge,
    toggleListen,
    toggleLog() {
      st.showLog = !st.showLog;
      localStorage.setItem("lg-log", st.showLog ? "1" : "0");
      render();
    },
    showLog: () => st.showLog,
    mute() {
      Narrator.toggleMute();
      render();
    },
  };
})();
