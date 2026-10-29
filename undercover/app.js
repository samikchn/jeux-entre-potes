// Interface d'Undercover.
// - mode "local"  : un seul téléphone qu'on se passe.
// - mode "host"   : l'hôte garde l'état de la partie et le diffuse via Supabase Realtime.
// - mode "player" : reçoit l'état de l'hôte et lui envoie ses votes.

const S = {
  mode: null,
  me: getId(),
  name: localStorage.getItem("uc-name") || "",
  code: "",
  hostId: null,
  hostGone: false,
  game: null,
  lobby: [], // joueurs connectés (en ligne) ou noms saisis (local)
  settings: { undercover: 1, white: 0, civil: "", under: "" },
  reveal: 0,
  showWord: false,
  status: "",
  error: "",
};

let sb = null;
let channel = null;

const ROLE_ICON = { civil: "🙂", undercover: "🕵️", white: "👻" };

function getId() {
  let id = localStorage.getItem("uc-id");
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    localStorage.setItem("uc-id", id);
  }
  return id;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// ---------- Rendu ----------

function render() {
  const app = document.getElementById("app");
  // Conserve la saisie en cours et les menus ouverts quand l'écran est redessiné.
  const focused = document.activeElement && document.activeElement.id;
  const values = {};
  app.querySelectorAll("input[id]").forEach((el) => (values[el.id] = el.value));
  const open = [...app.querySelectorAll("details[id][open]")].map((el) => el.id);

  app.innerHTML = view();
  // N'anime l'apparition que lors d'un changement d'écran, pas à chaque mise à jour réseau.
  const screen = [S.mode, S.game?.phase, S.game?.round, S.reveal, !!S.game].join("|");
  app.classList.toggle("no-anim", screen === render.last);
  render.last = screen;

  app.querySelectorAll("input[id]").forEach((el) => {
    if (values[el.id] !== undefined) el.value = values[el.id];
  });
  open.forEach((id) => document.getElementById(id)?.setAttribute("open", ""));
  if (focused && document.getElementById(focused)) document.getElementById(focused).focus();
}

function view() {
  if (!S.mode) return homeView();
  const warn = S.hostGone ? `<div class="alert">⚠️ L'hôte s'est déconnecté. La partie reprendra dès qu'il revient.</div>` : "";
  if (S.mode === "player" && !S.hostId) {
    return card(`<p class="center">Connexion au salon <b>${esc(S.code)}</b>…</p>${S.status ? `<p class="muted center">${esc(S.status)}</p>` : ""}`) + leaveButton();
  }
  if (!S.game) return warn + lobbyView();
  if (S.mode !== "local" && !UC.player(S.game, S.me)) {
    return warn + card(`<p class="center">Une partie est en cours dans le salon <b>${esc(S.code)}</b>.<br>Tu joueras à la prochaine !</p>`) + leaveButton();
  }
  const views = { reveal: revealView, play: playView, vote: voteView, guess: guessView, result: resultView, end: endView };
  return warn + views[S.game.phase]();
}

const card = (html) => `<div class="card">${html}</div>`;
const isAdmin = () => S.mode !== "player";
const leaveButton = () => `<button class="ghost" onclick="A.leave()">Quitter</button>`;
const phase = (label) => `<div class="phase-wrap"><span class="phase">${label}</span></div>`;
const roleTag = (role) => `<span class="tag ${role}">${ROLE_ICON[role]} ${UC.ROLE_LABEL[role]}</span>`;

function hue(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const avatar = (name, big = false) =>
  `<span class="avatar ${big ? "big" : ""}" style="--h:${hue(name)}">${esc([...String(name).trim()][0] || "?")}</span>`;

function homeView() {
  const joinCode = new URLSearchParams(location.search).get("salon") || "";
  const online = window.SUPABASE_URL && window.SUPABASE_ANON_KEY;
  const saved = JSON.parse(localStorage.getItem("uc-host") || "null");
  return `
    <a class="card mode" onclick="A.startLocal()">
      <span class="emoji">📱</span>
      <div><h2>Un seul téléphone</h2><p class="muted">On se le passe pour découvrir son mot, puis on joue à l'oral.</p></div>
    </a>
    ${card(`
      <div class="mode"><span class="emoji">👥</span>
        <div><h2>Chacun son téléphone</h2><p class="muted">Un salon, un code, et chacun voit son mot sur son écran.</p></div>
      </div>
      ${online ? `
        <input id="name" placeholder="Ton prénom" maxlength="20" value="${esc(S.name)}" style="margin-top:14px">
        ${joinCode ? "" : `<button onclick="A.createRoom()">Créer un salon</button>`}
        ${saved && !joinCode ? `<button class="secondary" onclick="A.createRoom(true)">Reprendre mon salon ${esc(saved.code)}</button>` : ""}
        <div class="row">
          <input id="joincode" placeholder="CODE" maxlength="4" style="text-transform:uppercase;letter-spacing:.2em" value="${esc(joinCode)}">
          <button class="${joinCode ? "" : "secondary"}" onclick="A.joinRoom()">Rejoindre</button>
        </div>
      ` : `<p class="muted">Mode en ligne pas encore configuré : renseigne Supabase dans <code>js/config.js</code>.</p>`}
      ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}
    `)}
    ${card(`
      <details id="rules">
        <summary><b>📖 Les règles</b></summary>
        <p>${roleTag("civil")} ont tous le même mot.</p>
        <p>${roleTag("undercover")} ont un mot proche, sans savoir qu'ils sont Undercover.</p>
        <p>${roleTag("white")} n'a pas de mot. S'il est éliminé, il gagne en devinant le mot des Civils.</p>
        <p class="muted">À tour de rôle, chacun donne un indice sur son mot, puis on vote pour éliminer quelqu'un. Les Civils gagnent quand tous les infiltrés sont éliminés ; les infiltrés gagnent s'il ne reste qu'un Civil.</p>
      </details>
    `)}
    <p class="center"><a href="../" class="muted">← Tous les jeux</a></p>
  `;
}

// Nouvelle répartition après un +/−, ou null si aucune n'est jouable.
// Si le changement seul est impossible, l'autre rôle d'infiltré compense
// (ex. à 3 joueurs, + Mr. White remplace l'Undercover).
function countChange(key, delta) {
  const other = key === "white" ? "undercover" : "white";
  const n = S.lobby.length;
  for (const otherDelta of [0, -delta]) {
    const s = { ...S.settings, [key]: S.settings[key] + delta, [other]: S.settings[other] + otherDelta };
    if (UC.countsValid(n, s.undercover, s.white)) return s;
  }
  return null;
}
const canCount = (key, delta) => !!countChange(key, delta);

function rolesView() {
  const n = S.lobby.length;
  const s = S.settings;
  const civils = Math.max(0, n - s.undercover - s.white);
  if (!isAdmin()) {
    return card(`<h2>Rôles</h2><div class="row" style="flex-wrap:wrap">
      <span class="tag civil">🙂 ${civils} Civils</span><span class="tag undercover">🕵️ ${s.undercover} Undercover</span><span class="tag white">👻 ${s.white} Mr. White</span>
    </div>`);
  }
  const stepper = (key, icon, label, hint) => `
    <div class="stepper">
      <span style="font-size:1.6rem">${icon}</span>
      <span class="label">${label}<small>${hint}</small></span>
      <button class="icon secondary" onclick="A.count('${key}',-1)" ${canCount(key, -1) ? "" : "disabled"}>−</button>
      <b>${s[key]}</b>
      <button class="icon secondary" onclick="A.count('${key}',1)" ${canCount(key, 1) ? "" : "disabled"}>+</button>
    </div>`;
  return card(`
    <h2>Rôles</h2>
    ${stepper("undercover", "🕵️", "Undercover", "Un mot proche")}
    ${stepper("white", "👻", "Mr. White", "Pas de mot")}
    <div class="stepper"><span style="font-size:1.6rem">🙂</span><span class="label">Civils<small>Calculé automatiquement</small></span><b>${civils}</b></div>
    ${n >= 3 ? `<p class="muted">Il faut au moins 2 Civils, et jamais moins de Civils que d'infiltrés.</p>` : ""}
    <details id="custom">
      <summary class="muted">✏️ Choisir nos propres mots (optionnel)</summary>
      <input id="civil" placeholder="Mot des Civils" maxlength="30" oninput="S.settings.civil=this.value">
      <input id="under" placeholder="Mot de l'Undercover" maxlength="30" oninput="S.settings.under=this.value">
      <p class="muted">Laisse vide pour un mot tiré au hasard. Celui qui les tape connaît les mots 😄</p>
    </details>`);
}

function lobbyView() {
  const n = S.lobby.length;
  const canStart = UC.countsValid(n, S.settings.undercover, S.settings.white);
  const startBtn = `<button onclick="A.start()" ${canStart ? "" : "disabled"}>🚀 Lancer la partie</button>
    ${n < 3 ? `<p class="muted center">Il faut au moins 3 joueurs (${n}/3).</p>` : ""}`;

  if (S.mode === "local") {
    return `
      ${card(`
        <h2>Joueurs (${n})</h2>
        <ul class="players">${S.lobby.map((p, i) => `
          <li>${avatar(p.name)}<span class="name">${esc(p.name)}</span>
          <button class="icon ghost" onclick="A.removeLocal(${i})" aria-label="Retirer">✕</button></li>`).join("")}
        </ul>
        <div class="row">
          <input id="newname" placeholder="Prénom" maxlength="20" onkeydown="if(event.key==='Enter')A.addLocal()">
          <button onclick="A.addLocal()">Ajouter</button>
        </div>
      `)}
      ${rolesView()}
      ${startBtn}
      ${leaveButton()}`;
  }

  return `
    ${card(`
      <p class="muted center" style="margin:0">Code du salon</p>
      <div class="code">${esc(S.code)}</div>
      <button class="secondary" onclick="A.share()">🔗 Inviter des joueurs</button>
    `)}
    ${card(`
      <h2>Joueurs connectés (${n})</h2>
      <ul class="players">${S.lobby.map((p) => `
        <li>${avatar(p.name)}<span class="name">${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</span>
        ${p.id === S.hostId ? `<span class="tag host">👑 hôte</span>` : ""}</li>`).join("")}
      </ul>
    `)}
    ${rolesView()}
    ${isAdmin() ? startBtn : `<p class="muted center">En attente du lancement par l'hôte…</p>`}
    ${leaveButton()}`;
}

// Carte à retourner pour voir son mot.
function wordCard(p, shown, onclick) {
  const back = p.role === "white"
    ? `<span class="big-emoji" style="font-size:3rem">👻</span><div class="word">Mr. White</div><p class="muted">Tu n'as pas de mot : écoute et bluffe !</p>`
    : `<span class="label">Ton mot</span><div class="word">${esc(p.word)}</div>`;
  return `
    <div class="flip ${shown ? "shown" : ""}" onclick="${onclick}">
      <div class="flip-inner">
        <div class="face front"><span class="big-emoji">🤫</span><b>Touche pour voir ton mot</b><span class="muted">Cache bien l'écran</span></div>
        <div class="face back">${back}</div>
      </div>
    </div>`;
}

function revealView() {
  const g = S.game;
  const p = g.players[S.reveal];
  return `
    ${phase(`Distribution · ${S.reveal + 1} / ${g.players.length}`)}
    ${card(`
      <div class="reveal">${avatar(p.name, true)}<p>Passe le téléphone à</p><div class="who">${esc(p.name)}</div></div>
      ${wordCard(p, false, "this.classList.add('shown')")}
      <button class="after-flip" onclick="A.nextReveal()">J'ai mémorisé, cacher ✓</button>
    `)}
    ${leaveButton()}`;
}

function myWordCard() {
  if (S.mode === "local") return "";
  return wordCard(UC.player(S.game, S.me), S.showWord, "A.toggleWord(this)");
}

function playersList(extra = () => "") {
  return `<ul class="players">${S.game.players.map((p) => `
    <li class="${p.alive ? "" : "dead"}">${avatar(p.name)}<span class="name">${esc(p.name)}</span>${extra(p)}</li>`).join("")}</ul>`;
}

function playView() {
  const g = S.game;
  return `
    ${phase(`Tour ${g.round} · Indices`)}
    ${myWordCard()}
    ${card(`
      <h2>🎤 Ordre de parole</h2>
      <p class="muted">Chacun donne un indice sur son mot, à l'oral.</p>
      <ul class="players">${g.order.map((id, i) => {
        const p = UC.player(g, id);
        return `<li class="${i === 0 ? "first" : ""}"><span class="num">${i + 1}</span>${avatar(p.name)}<span class="name">${esc(p.name)}</span></li>`;
      }).join("")}</ul>
    `)}
    ${isAdmin() ? `<button onclick="A.act(UC.startVote)">🗳️ Passer au vote</button>` : `<p class="muted center">L'hôte lancera le vote.</p>`}
    ${leaveButton()}`;
}

function voteView() {
  const g = S.game;
  const msg = g.message ? `<div class="alert">${esc(g.message)}</div>` : "";
  const targets = UC.alivePlayers(g).filter((p) => !g.candidates || g.candidates.includes(p.id));

  if (S.mode === "local") {
    return `
      ${phase(`Tour ${g.round} · Vote`)}
      ${msg}
      ${card(`
        <h2>🗳️ Qui est éliminé ?</h2>
        <p class="muted">Votez à l'oral, puis touchez le joueur éliminé.</p>
        <div class="grid">${targets.map((p) => `
          <button class="tile" onclick="A.eliminateLocal('${p.id}')">${avatar(p.name, true)}${esc(p.name)}</button>`).join("")}
        </div>
      `)}
      ${leaveButton()}`;
  }

  const me = UC.player(g, S.me);
  const voted = Object.keys(g.votes).length;
  const total = UC.alivePlayers(g).length;
  const mine = g.votes[S.me];
  return `
    ${phase(`Tour ${g.round} · Vote`)}
    ${myWordCard()}
    ${msg}
    ${card(me.alive ? `
      <h2>🗳️ Qui est l'intrus ?</h2>
      <div class="grid">${targets.filter((p) => p.id !== S.me).map((p) => `
        <button class="tile ${mine === p.id ? "selected" : ""}" onclick="A.vote('${p.id}')">${avatar(p.name, true)}${esc(p.name)}</button>`).join("")}
      </div>
      <p class="muted center">${mine ? "Vote enregistré, tu peux encore changer." : "Touche un joueur pour voter."}</p>
    ` : `<p class="center">Tu es éliminé, tu regardes les autres voter 👀</p>`)}
    <div class="progress"><div style="width:${(voted / total) * 100}%"></div></div>
    <p class="muted center">${voted} / ${total} votes</p>
    ${isAdmin() ? `<button class="secondary" onclick="A.act(UC.resolveVote)" ${voted ? "" : "disabled"}>Dépouiller maintenant</button>` : ""}
    ${leaveButton()}`;
}

function guessView() {
  const g = S.game;
  const white = UC.player(g, g.eliminated);
  const canGuess = S.mode === "local" || white.id === S.me;
  return `
    ${phase("Dernière chance")}
    ${card(`
      <div class="reveal">${avatar(white.name, true)}<div class="who">${esc(white.name)}</div><p>était ${roleTag("white")}</p></div>
      ${canGuess ? `
        <p class="center">${S.mode === "local" ? esc(white.name) + ", d" : "D"}evine le mot des Civils pour gagner !</p>
        <input id="guess" placeholder="Le mot des Civils" maxlength="30" onkeydown="if(event.key==='Enter')A.guess()">
        <button onclick="A.guess()">Valider</button>
      ` : `<p class="muted center">Il tente de deviner le mot des Civils…</p>`}
    `)}
    ${isAdmin() && !canGuess ? `<button class="secondary" onclick="A.act((g) => UC.submitWhiteGuess(g, ''))">Passer (Mr. White ne répond pas)</button>` : ""}
    ${leaveButton()}`;
}

function eliminationView() {
  const g = S.game;
  const p = UC.player(g, g.eliminated);
  if (!p) return "";
  let html = `<div class="reveal">${avatar(p.name, true)}<div class="who">${esc(p.name)}</div><p>est éliminé, c'était ${roleTag(p.role)}</p></div>`;
  if (g.whiteGuess !== null) {
    html += `<p class="muted center">Mr. White a proposé « ${esc(g.whiteGuess || "…")} »${g.winner === "white" ? " : bonne réponse !" : " : raté."}</p>`;
  }
  if (g.message) html += `<p class="muted center">${esc(g.message)}</p>`;
  return html;
}

function resultView() {
  return `
    ${phase(`Tour ${S.game.round} · Résultat`)}
    ${card(eliminationView())}
    ${card(`<h2>Encore en jeu</h2>${playersList()}`)}
    ${isAdmin() ? `<button onclick="A.act(UC.nextRound)">▶️ Tour suivant</button>` : `<p class="muted center">L'hôte lancera le tour suivant.</p>`}
    ${leaveButton()}`;
}

function endView() {
  const g = S.game;
  const emoji = { civils: "🎉", infiltres: "🕵️", white: "👻" }[g.winner];
  const title = { civils: "Les Civils gagnent !", infiltres: "Les infiltrés gagnent !", white: "Mr. White gagne !" }[g.winner];
  return `
    <div class="banner ${g.winner}"><div class="emoji">${emoji}</div><h2>${title}</h2></div>
    ${g.eliminated ? card(eliminationView()) : ""}
    ${card(`
      <div class="words">
        <div><span class="muted">🙂 Civils</span><b>${esc(g.civilWord)}</b></div>
        <div><span class="muted">🕵️ Undercover</span><b>${esc(g.underWord)}</b></div>
      </div>
    `)}
    ${card(`<h2>Les rôles</h2>${playersList((p) => roleTag(p.role))}`)}
    ${isAdmin() ? `<button onclick="A.replay()">🔄 Rejouer</button>` : `<p class="muted center">L'hôte peut relancer une partie.</p>`}
    ${leaveButton()}`;
}

// ---------- Actions ----------

const A = {
  startLocal() {
    S.mode = "local";
    S.lobby = JSON.parse(localStorage.getItem("uc-local-names") || "[]").map((name) => ({ id: newId(), name }));
    fixCounts();
    render();
  },

  addLocal() {
    const input = document.getElementById("newname");
    const name = input.value.trim();
    if (!name) return;
    if (S.lobby.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      toast("Ce prénom est déjà pris.");
      return;
    }
    S.lobby.push({ id: newId(), name });
    input.value = "";
    saveLocalNames();
    fixCounts();
    render();
  },

  removeLocal(i) {
    S.lobby.splice(i, 1);
    saveLocalNames();
    fixCounts();
    render();
  },

  count(key, delta) {
    const s = countChange(key, delta);
    if (!s) return;
    S.settings = s;
    act(() => {});
  },

  start() {
    const civil = S.settings.civil.trim();
    const under = S.settings.under.trim();
    if ((civil || under) && !(civil && under)) return toast("Remplis les deux mots, ou aucun.");
    if (civil && civil.toLowerCase() === under.toLowerCase()) return toast("Les deux mots doivent être différents.");
    S.game = UC.newGame(S.lobby, S.settings);
    if (S.mode === "local") {
      S.game.phase = "reveal";
      S.reveal = 0;
    }
    S.showWord = false;
    act(() => {});
  },

  replay() {
    S.game = null;
    S.settings.civil = S.settings.under = "";
    if (S.mode === "host") S.lobby = presenceList();
    fixCounts();
    act(() => {});
  },

  nextReveal() {
    S.reveal++;
    if (S.reveal >= S.game.players.length) S.game.phase = "play";
    render();
  },

  // Retourne la carte sans tout redessiner, pour garder l'animation.
  toggleWord(el) {
    S.showWord = !S.showWord;
    el.classList.toggle("shown", S.showWord);
  },

  act(fn) {
    act(fn);
  },

  eliminateLocal(id) {
    if (confirm("Éliminer " + UC.player(S.game, id).name + " ?")) act((g) => UC.eliminate(g, id));
  },

  vote(target) {
    if (S.mode === "host") hostVote(S.me, target);
    else send("vote", { voter: S.me, target });
  },

  guess() {
    const guess = document.getElementById("guess").value.trim();
    if (!guess) return;
    if (S.mode === "player") {
      send("guess", { id: S.me, guess });
      toast("Réponse envoyée !");
    } else {
      act((g) => UC.submitWhiteGuess(g, guess));
    }
  },

  createRoom(resume) {
    if (!readName()) return;
    S.mode = "host";
    S.hostId = S.me;
    const saved = JSON.parse(localStorage.getItem("uc-host") || "null");
    if (resume && saved) {
      S.code = saved.code;
      S.game = saved.game;
      S.settings = saved.settings;
    } else {
      S.code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
    }
    connect();
    act(() => {});
  },

  joinRoom() {
    if (!readName()) return;
    const code = document.getElementById("joincode").value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      S.error = "Le code fait 4 lettres.";
      render();
      return;
    }
    S.mode = "player";
    S.code = code;
    S.status = "";
    connect();
    render();
    setTimeout(() => {
      if (S.mode === "player" && !S.hostId) {
        S.status = "Toujours rien… Vérifie le code, ou que l'hôte a bien le salon ouvert.";
        render();
      }
    }, 6000);
  },

  share() {
    const link = location.origin + location.pathname + "?salon=" + S.code;
    if (navigator.share) navigator.share({ title: "Undercover", text: "Rejoins ma partie d'Undercover !", url: link }).catch(() => {});
    else navigator.clipboard.writeText(link).then(() => toast("Lien copié !"));
  },

  leave() {
    if (S.game && S.mode !== "player" && !confirm("Quitter la partie ?")) return;
    if (S.mode === "host") localStorage.removeItem("uc-host");
    if (channel) sb.removeChannel(channel);
    channel = null;
    Object.assign(S, { mode: null, code: "", hostId: null, hostGone: false, game: null, lobby: [], error: "", status: "" });
    S.settings = { undercover: 1, white: 0, civil: "", under: "" };
    history.replaceState(null, "", location.pathname);
    render();
  },
};

const newId = () => Math.random().toString(36).slice(2, 10);

function readName() {
  const name = document.getElementById("name").value.trim();
  if (!name) {
    S.error = "Entre ton prénom.";
    render();
    return false;
  }
  S.name = name;
  S.error = "";
  localStorage.setItem("uc-name", name);
  return true;
}

function saveLocalNames() {
  localStorage.setItem("uc-local-names", JSON.stringify(S.lobby.map((p) => p.name)));
}

// Remet la répartition conseillée quand le nombre de joueurs change.
function fixCounts() {
  const n = S.lobby.length;
  if (n !== S.settings.n || !UC.countsValid(n, S.settings.undercover, S.settings.white)) {
    Object.assign(S.settings, UC.defaultCounts(n), { n });
  }
}

// Applique une action sur la partie, puis sauvegarde, diffuse et redessine.
function act(fn) {
  if (S.game) fn(S.game);
  if (S.mode === "host") {
    localStorage.setItem("uc-host", JSON.stringify({ code: S.code, game: S.game, settings: S.settings }));
    broadcastState();
  }
  render();
}

function hostVote(voter, target) {
  act((g) => {
    UC.castVote(g, voter, target);
    if (UC.allVoted(g)) UC.resolveVote(g);
  });
}

// ---------- Réseau (Supabase Realtime, sans base de données) ----------

function connect() {
  sb = sb || supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  channel = sb.channel("undercover-" + S.code, { config: { presence: { key: S.me } } });

  channel
    .on("broadcast", { event: "state" }, ({ payload }) => {
      if (S.mode !== "player") return;
      if (!payload.game) S.showWord = false;
      S.hostId = payload.hostId;
      S.hostGone = false;
      S.game = payload.game;
      S.lobby = payload.lobby;
      S.settings = payload.settings;
      render();
    })
    .on("broadcast", { event: "vote" }, ({ payload }) => {
      if (S.mode === "host" && S.game) hostVote(payload.voter, payload.target);
    })
    .on("broadcast", { event: "guess" }, ({ payload }) => {
      if (S.mode === "host" && S.game && S.game.eliminated === payload.id) act((g) => UC.submitWhiteGuess(g, payload.guess));
    })
    .on("presence", { event: "sync" }, () => {
      if (S.mode === "player") {
        const gone = !!S.hostId && !channel.presenceState()[S.hostId];
        if (gone !== S.hostGone) {
          S.hostGone = gone;
          render();
        }
        return;
      }
      if (!S.game) {
        S.lobby = presenceList();
        fixCounts();
      }
      act(() => {});
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ name: S.name, at: Date.now() });
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        S.status = "Connexion impossible au serveur temps réel.";
        render();
      }
    });
}

function presenceList() {
  const ps = channel ? channel.presenceState() : {};
  return Object.entries(ps)
    .map(([id, metas]) => ({ id, name: metas[0].name, at: metas[0].at }))
    .sort((a, b) => a.at - b.at)
    .map(({ id, name }) => ({ id, name }));
}

function broadcastState() {
  send("state", { hostId: S.me, game: S.game, lobby: S.lobby, settings: S.settings });
}

function send(event, payload) {
  if (channel) channel.send({ type: "broadcast", event, payload });
}

render();
