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
  game: null,
  lobby: [], // joueurs connectés (en ligne) ou noms saisis (local)
  settings: { undercover: 1, white: 0, civil: "", under: "" },
  reveal: { i: 0, shown: false },
  showWord: false,
  status: "",
  error: "",
};

let sb = null;
let channel = null;

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

// ---------- Rendu ----------

function render() {
  const app = document.getElementById("app");
  // Conserve ce qui est en cours de saisie quand l'écran est redessiné.
  const focused = document.activeElement && document.activeElement.id;
  const values = {};
  app.querySelectorAll("input[id]").forEach((el) => (values[el.id] = el.value));

  app.innerHTML = view();

  app.querySelectorAll("input[id]").forEach((el) => {
    if (values[el.id] !== undefined) el.value = values[el.id];
  });
  if (focused && document.getElementById(focused)) document.getElementById(focused).focus();
}

function view() {
  if (!S.mode) return homeView();
  if (S.mode === "player" && !S.hostId) return card(`<p class="center">Connexion au salon <b>${esc(S.code)}</b>…</p>${S.status ? `<p class="muted center">${esc(S.status)}</p>` : ""}`) + leaveButton();
  if (!S.game) return lobbyView();
  if (S.mode !== "local" && !UC.player(S.game, S.me)) {
    return card(`<p class="center">Une partie est en cours dans le salon <b>${esc(S.code)}</b>.<br>Tu pourras jouer à la prochaine !</p>`) + leaveButton();
  }
  const views = { reveal: revealView, play: playView, vote: voteView, guess: guessView, result: resultView, end: endView };
  return views[S.game.phase]();
}

const card = (html) => `<div class="card">${html}</div>`;
const isAdmin = () => S.mode !== "player";
const leaveButton = () => `<button class="secondary" onclick="A.leave()">Quitter</button>`;

function homeView() {
  const params = new URLSearchParams(location.search);
  const joinCode = params.get("salon") || "";
  const online = window.SUPABASE_URL && window.SUPABASE_ANON_KEY;
  const saved = JSON.parse(localStorage.getItem("uc-host") || "null");
  return `
    ${card(`
      <h2>📱 Un seul téléphone</h2>
      <p class="muted">On se passe le téléphone pour découvrir son mot, puis on joue à l'oral.</p>
      <button onclick="A.startLocal()">Jouer sur ce téléphone</button>
    `)}
    ${card(`
      <h2>👥 Chacun son téléphone</h2>
      ${online ? `
        <input id="name" placeholder="Ton prénom" maxlength="20" value="${esc(S.name)}">
        <button onclick="A.createRoom()">Créer un salon</button>
        ${saved ? `<button class="secondary" onclick="A.createRoom('${esc(saved.code)}')">Reprendre mon salon ${esc(saved.code)}</button>` : ""}
        <div class="row">
          <input id="joincode" placeholder="CODE" maxlength="4" style="text-transform:uppercase" value="${esc(joinCode)}">
          <button onclick="A.joinRoom()">Rejoindre</button>
        </div>
      ` : `<p class="muted">Mode en ligne pas encore configuré : renseigne Supabase dans <code>js/config.js</code>.</p>`}
      ${S.error ? `<p style="color:var(--danger)">${esc(S.error)}</p>` : ""}
    `)}
    <a href="../" class="muted">← Tous les jeux</a>
  `;
}

function countersView(n) {
  const s = S.settings;
  if (!isAdmin()) {
    return `<p class="muted">${s.undercover} Undercover · ${s.white} Mr. White · ${Math.max(0, n - s.undercover - s.white)} Civils</p>`;
  }
  const counter = (label, key) => `
    <div class="counter"><span>${label}</span><div>
      <button class="secondary" onclick="A.count('${key}',-1)">−</button><b>${s[key]}</b>
      <button class="secondary" onclick="A.count('${key}',1)">+</button>
    </div></div>`;
  return `
    ${counter("🕵️ Undercover", "undercover")}
    ${counter("👻 Mr. White", "white")}
    <p class="muted">${Math.max(0, n - s.undercover - s.white)} Civils</p>
    <details>
      <summary class="muted">Choisir nos propres mots (optionnel)</summary>
      <input id="civil" placeholder="Mot des civils" maxlength="30" oninput="S.settings.civil=this.value">
      <input id="under" placeholder="Mot de l'undercover" maxlength="30" oninput="S.settings.under=this.value">
      <p class="muted">Laisse vide pour un mot tiré au hasard. Celui qui les tape ne doit pas jouer… ou accepter de tricher 😄</p>
    </details>`;
}

function lobbyView() {
  const n = S.lobby.length;
  const canStart = UC.countsValid(n, S.settings.undercover, S.settings.white);
  if (S.mode === "local") {
    return `
      ${card(`
        <h2>Joueurs (${n})</h2>
        <ul class="list">${S.lobby.map((p, i) => `<li>${esc(p.name)} <button class="small secondary" onclick="A.removeLocal(${i})">✕</button></li>`).join("")}</ul>
        <div class="row">
          <input id="newname" placeholder="Prénom" maxlength="20" onkeydown="if(event.key==='Enter')A.addLocal()">
          <button style="flex:0 0 auto;width:auto" onclick="A.addLocal()">Ajouter</button>
        </div>
      `)}
      ${card(countersView(n))}
      <button onclick="A.start()" ${canStart ? "" : "disabled"}>Lancer la partie</button>
      ${n < 3 ? `<p class="muted center">Il faut au moins 3 joueurs.</p>` : ""}
      ${leaveButton()}`;
  }
  const link = location.origin + location.pathname + "?salon=" + S.code;
  return `
    ${card(`
      <p class="muted center">Code du salon</p>
      <div class="code">${esc(S.code)}</div>
      <button class="secondary" onclick="A.share('${esc(link)}')">Partager le lien</button>
    `)}
    ${card(`
      <h2>Joueurs connectés (${n})</h2>
      <ul class="list">${S.lobby.map((p) => `<li>${esc(p.name)} ${p.id === S.hostId ? `<span class="tag">hôte</span>` : ""}</li>`).join("")}</ul>
    `)}
    ${card(countersView(n))}
    ${isAdmin()
      ? `<button onclick="A.start()" ${canStart ? "" : "disabled"}>Lancer la partie</button>
         ${n < 3 ? `<p class="muted center">Il faut au moins 3 joueurs.</p>` : ""}`
      : `<p class="muted center">En attente du lancement par l'hôte…</p>`}
    ${leaveButton()}`;
}

function revealView() {
  const p = S.game.players[S.reveal.i];
  if (!S.reveal.shown) {
    return card(`
      <p class="center">Passe le téléphone à</p>
      <div class="word" style="color:var(--text)">${esc(p.name)}</div>
      <button onclick="A.showReveal()">Voir mon mot</button>
    `);
  }
  return card(`
    <p class="center">${esc(p.name)}, ton mot :</p>
    ${wordHtml(p)}
    <button onclick="A.nextReveal()">J'ai mémorisé, cacher</button>
  `);
}

function wordHtml(p) {
  return p.role === "white"
    ? `<div class="word">👻 Tu es Mr. White</div><p class="muted center">Tu n'as pas de mot : écoute les autres et bluffe !</p>`
    : `<div class="word">${esc(p.word)}</div>`;
}

function myWordCard() {
  if (S.mode === "local") return "";
  const me = UC.player(S.game, S.me);
  return card(S.showWord
    ? `${wordHtml(me)}<button class="secondary" onclick="A.toggleWord()">Cacher</button>`
    : `<button class="secondary" onclick="A.toggleWord()">👁️ Afficher mon mot</button>`);
}

function playersList(extra = () => "") {
  return `<ul class="list">${S.game.players.map((p) => `<li class="${p.alive ? "" : "dead"}">${esc(p.name)} ${extra(p)}</li>`).join("")}</ul>`;
}

function playView() {
  const g = S.game;
  return `
    ${myWordCard()}
    ${card(`
      <h2>Tour ${g.round} : ordre de parole</h2>
      <p class="muted">Chacun donne un indice sur son mot, à l'oral.</p>
      <ol>${g.order.map((id) => `<li>${esc(UC.player(g, id).name)}</li>`).join("")}</ol>
    `)}
    ${isAdmin() ? `<button onclick="A.act(UC.startVote)">Passer au vote</button>` : `<p class="muted center">L'hôte lancera le vote.</p>`}
    ${leaveButton()}`;
}

function voteView() {
  const g = S.game;
  const msg = g.message ? card(`<p>${esc(g.message)}</p>`) : "";
  const targets = UC.alivePlayers(g).filter((p) => !g.candidates || g.candidates.includes(p.id));

  if (S.mode === "local") {
    return `${msg}${card(`
      <h2>Qui est éliminé ?</h2>
      <p class="muted">Votez à l'oral, puis touchez le joueur éliminé.</p>
      ${targets.map((p) => `<button class="secondary" onclick="A.eliminateLocal('${p.id}')">${esc(p.name)}</button>`).join("")}
    `)}${leaveButton()}`;
  }

  const me = UC.player(g, S.me);
  const voted = Object.keys(g.votes).length;
  const total = UC.alivePlayers(g).length;
  const mine = g.votes[S.me];
  return `
    ${myWordCard()}
    ${msg}
    ${card(me.alive ? `
      <h2>Vote : qui est l'intrus ?</h2>
      ${targets.filter((p) => p.id !== S.me).map((p) => `<button class="vote-btn secondary ${mine === p.id ? "selected" : ""}" onclick="A.vote('${p.id}')">${esc(p.name)}</button>`).join("")}
    ` : `<p class="center">Tu es éliminé, tu regardes les autres voter 👀</p>`)}
    <p class="muted center">${voted} / ${total} votes</p>
    ${isAdmin() ? `<button class="secondary" onclick="A.act(UC.resolveVote)" ${voted ? "" : "disabled"}>Dépouiller maintenant</button>` : ""}
    ${leaveButton()}`;
}

function guessView() {
  const g = S.game;
  const white = UC.player(g, g.eliminated);
  const canGuess = S.mode === "local" || white.id === S.me;
  return `${card(`
    <h2>${esc(white.name)} était Mr. White 👻</h2>
    ${canGuess ? `
      <p>${S.mode === "local" ? esc(white.name) + ", d" : "D"}evine le mot des Civils pour gagner :</p>
      <input id="guess" placeholder="Le mot des civils" maxlength="30">
      <button onclick="A.guess()">Valider</button>
    ` : `<p class="muted">Il tente de deviner le mot des Civils…</p>`}
  `)}
  ${isAdmin() && !canGuess ? `<button class="secondary" onclick="A.act((g) => UC.submitWhiteGuess(g, ''))">Passer (Mr. White ne répond pas)</button>` : ""}
  ${leaveButton()}`;
}

function eliminationText() {
  const g = S.game;
  const p = UC.player(g, g.eliminated);
  if (!p) return "";
  let html = `<p><b>${esc(p.name)}</b> est éliminé : c'était ${p.role === "white" ? "Mr. White 👻" : "un " + UC.ROLE_LABEL[p.role]}.</p>`;
  if (g.whiteGuess !== null) html += `<p class="muted">Mr. White a proposé « ${esc(g.whiteGuess)} »${g.winner === "white" ? " : bonne réponse !" : " : raté."}</p>`;
  if (g.message) html += `<p class="muted">${esc(g.message)}</p>`;
  return html;
}

function resultView() {
  return `
    ${myWordCard()}
    ${card(`<h2>Résultat du vote</h2>${eliminationText()}`)}
    ${card(`<h2>En jeu</h2>${playersList()}`)}
    ${isAdmin() ? `<button onclick="A.act(UC.nextRound)">Tour suivant</button>` : `<p class="muted center">L'hôte lancera le tour suivant.</p>`}
    ${leaveButton()}`;
}

function endView() {
  const g = S.game;
  return `
    ${card(`<h2>${UC.WINNER_LABEL[g.winner]}</h2>${eliminationText()}
      <p>Mot des Civils : <b>${esc(g.civilWord)}</b><br>Mot de l'Undercover : <b>${esc(g.underWord)}</b></p>`)}
    ${card(playersList((p) => `<span class="tag">${UC.ROLE_LABEL[p.role]}</span>`))}
    ${isAdmin() ? `<button onclick="A.replay()">Rejouer</button>` : `<p class="muted center">L'hôte peut relancer une partie.</p>`}
    ${leaveButton()}`;
}

// ---------- Actions ----------

const A = {
  startLocal() {
    S.mode = "local";
    S.lobby = JSON.parse(localStorage.getItem("uc-local-names") || "[]").map((name, i) => ({ id: "p" + i, name }));
    fixCounts();
    render();
  },

  addLocal() {
    const input = document.getElementById("newname");
    const name = input.value.trim();
    if (!name) return;
    S.lobby.push({ id: Math.random().toString(36).slice(2, 10), name });
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
    const s = { ...S.settings, [key]: S.settings[key] + delta };
    if (s[key] < 0 || (key === "white" && s.white > 1)) return;
    if (!UC.countsValid(S.lobby.length, s.undercover, s.white)) return;
    S.settings = s;
    act(() => {});
  },

  start() {
    const { civil, under } = S.settings;
    if ((civil.trim() || under.trim()) && !(civil.trim() && under.trim())) {
      alert("Remplis les deux mots, ou aucun.");
      return;
    }
    S.game = UC.newGame(S.lobby, S.settings);
    if (S.mode === "local") {
      S.game.phase = "reveal";
      S.reveal = { i: 0, shown: false };
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

  showReveal() {
    S.reveal.shown = true;
    render();
  },

  nextReveal() {
    S.reveal = { i: S.reveal.i + 1, shown: false };
    if (S.reveal.i >= S.game.players.length) S.game.phase = "play";
    render();
  },

  toggleWord() {
    S.showWord = !S.showWord;
    render();
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
    if (S.mode === "player") send("guess", { id: S.me, guess });
    else act((g) => UC.submitWhiteGuess(g, guess));
  },

  createRoom(code) {
    if (!readName()) return;
    S.mode = "host";
    S.hostId = S.me;
    const saved = JSON.parse(localStorage.getItem("uc-host") || "null");
    if (code && saved) {
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
    if (code.length !== 4) {
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

  share(link) {
    if (navigator.share) navigator.share({ title: "Undercover", url: link }).catch(() => {});
    else navigator.clipboard.writeText(link).then(() => alert("Lien copié !"));
  },

  leave() {
    if (S.game && S.mode !== "player" && !confirm("Quitter la partie ?")) return;
    if (S.mode === "host") localStorage.removeItem("uc-host");
    if (channel) sb.removeChannel(channel);
    channel = null;
    Object.assign(S, { mode: null, code: "", hostId: null, game: null, lobby: [], error: "", status: "" });
    S.settings = { undercover: 1, white: 0, civil: "", under: "" };
    history.replaceState(null, "", location.pathname);
    render();
  },
};

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
      if (S.mode !== "host") return;
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
