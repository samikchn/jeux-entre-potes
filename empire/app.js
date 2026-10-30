// Interface d'Empire IDF (en ligne : l'hôte fait tourner la partie et les robots).

const { esc, toast, avatar } = Common;

const S = {
  mode: null, // "host" | "player"
  me: Common.playerId(),
  name: localStorage.getItem("uc-name") || "",
  code: "",
  hostId: null,
  hostGone: false,
  game: null,
  lobby: [], // joueurs humains connectés
  bots: [], // robots ajoutés par l'hôte
  settings: { mode: "tours", maxRounds: 25 },
  sel: null, // case affichée en détail
  trade: { to: null, give: [], get: [], giveCash: 0, getCash: 0 },
  clockOffset: 0, // horloge de l'hôte - horloge locale (pour le compte à rebours des enchères)
  status: "",
  error: "",
};

let room = null;
const BOT_NAMES = ["Robot Momo", "Robot Lina", "Robot Kev", "Robot Inès", "Robot Yanis"];

// ---------- Rendu ----------

function render() {
  const g = S.game;
  const key = [S.mode, !!g, g?.stage, g?.turn, g?.round].join("|");
  Common.render(document.getElementById("app"), view(), key);
}

const card = (html, cls = "") => `<div class="card ${cls}">${html}</div>`;
const isHost = () => S.mode === "host";
const me = () => S.game && EM.P(S.game, S.me);
const money = (n) => `${Math.round(n)} €`;
const leaveButton = () => `<button class="ghost" onclick="A.leave()">Quitter</button>`;

function view() {
  if (!S.mode) return homeView();
  const warn = S.hostGone ? `<div class="alert">⚠️ L'hôte s'est déconnecté. La partie reprendra dès qu'il revient.</div>` : "";
  if (S.mode === "player" && !S.hostId) {
    return card(`<p class="center">Connexion au salon <b>${esc(S.code)}</b>…</p>${S.status ? `<p class="muted center">${esc(S.status)}</p>` : ""}`) + leaveButton();
  }
  if (!S.game) return warn + lobbyView();
  return warn + gameView();
}

function homeView() {
  const joinCode = new URLSearchParams(location.search).get("salon") || "";
  const saved = JSON.parse(localStorage.getItem("em-host") || "null");
  return `
    ${card(`
      <div class="mode"><span class="emoji">🏙️</span>
        <div><h2>Deviens le roi de l'Île-de-France</h2><p class="muted">Achète les villes, complète les départements, construis des tours et ruine tes potes.</p></div>
      </div>
      ${Common.onlineConfigured() ? `
        <input id="name" placeholder="Ton prénom" maxlength="16" value="${esc(S.name)}" style="margin-top:14px">
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
        <p class="muted">Lance les dés et fais le tour du plateau. Achète les villes où tu t'arrêtes (ou mets-les aux enchères). Les autres te payent un loyer quand ils tombent chez toi.</p>
        <p class="muted">Possède tout un département pour doubler les loyers et construire : Résidence, Immeuble, puis Tour. Les 4 lignes de RER rapportent plus si tu en as plusieurs.</p>
        <p class="muted">🎴 Événements : surprises bonnes ou mauvaises. 💰 La taxe va dans la cagnotte, que gagne celui qui s'arrête en terrasse. 🚧 Les Bouchons : tu en sors avec un double, en payant ${EM.JAIL_FEE} €, ou avec un Passe Navigo.</p>
        <p class="muted">📈 Le Grand Paris s'embourgeoise : tous les 10 tours, les loyers augmentent de 20 %.</p>
        <p class="muted">Tu peux échanger villes et argent avec les autres à tout moment. Fin : au nombre de tours choisi (le plus gros patrimoine gagne) ou quand il ne reste qu'un joueur (au plus tard après ${EM.MAX_ROUNDS} tours).</p>
      </details>
    `)}
    <p class="center"><a href="../" class="muted">← Tous les jeux</a></p>`;
}

function allPlayers() {
  return [...S.lobby, ...S.bots];
}

function lobbyView() {
  const players = allPlayers();
  const s = S.settings;
  const opt = (mode, rounds, label) => `
    <button class="${s.mode === mode && (mode === "faillite" || s.maxRounds === rounds) ? "" : "secondary"}" onclick="A.setMode('${mode}', ${rounds})">${label}</button>`;
  return `
    ${card(`
      <p class="muted center" style="margin:0">Code du salon</p>
      <div class="code">${esc(S.code)}</div>
      <button class="secondary" onclick="A.share()">🔗 Inviter des joueurs</button>
    `)}
    ${card(`
      <h2>Joueurs (${players.length}/6)</h2>
      <ul class="players">${players.map((p) => `
        <li>${avatar(p.name)}<span class="name">${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</span>
        ${p.bot ? (isHost() ? `<button class="icon ghost" onclick="A.removeBot('${p.id}')" aria-label="Retirer">✕</button>` : `<span class="tag">🤖</span>`) : ""}
        ${p.id === S.hostId ? `<span class="tag host">👑 hôte</span>` : ""}</li>`).join("")}
      </ul>
      ${isHost() && players.length < 6 ? `<button class="secondary" onclick="A.addBot()">🤖 Ajouter un robot</button>` : ""}
    `)}
    ${card(isHost() ? `
      <h2>Fin de partie</h2>
      <div class="row" style="flex-wrap:wrap">
        ${opt("tours", 15, "⏱️ 15 tours")}${opt("tours", 25, "⏱️ 25 tours")}${opt("tours", 40, "⏱️ 40 tours")}${opt("faillite", 0, "💸 Faillite")}
      </div>
      <p class="muted">${s.mode === "faillite" ? `Le dernier joueur non ruiné gagne (au plus tard après ${EM.MAX_ROUNDS} tours, le plus riche).` : `Après ${s.maxRounds} tours de table, le plus gros patrimoine gagne.`}</p>
    ` : `<p class="muted">${s.mode === "faillite" ? "💸 Jusqu'à la faillite" : `⏱️ ${s.maxRounds} tours`}</p>`)}
    ${isHost()
      ? `<button onclick="A.start()" ${players.length >= 2 ? "" : "disabled"}>🎲 Lancer la partie</button>
         ${players.length < 2 ? `<p class="muted center">Il faut au moins 2 joueurs (ajoute un robot !).</p>` : ""}`
      : `<p class="muted center">En attente du lancement par l'hôte…</p>`}
    ${leaveButton()}`;
}

// ---------- Plateau ----------

// Position de la case i sur la grille 9 × 9 (départ en bas à droite, sens des aiguilles inversé).
function cellPos(i) {
  if (i <= 8) return [9, 9 - i];
  if (i <= 16) return [9 - (i - 8), 1];
  if (i <= 24) return [1, 1 + (i - 16)];
  return [1 + (i - 24), 9];
}

const ICONS = { start: "🏁", jail: "🚧", pause: "☕", control: "🎫", event: "🎴", tax: "💰", rer: "🚆" };

function boardView() {
  const g = S.game;
  const cells = SPACES.map((s, i) => {
    const [row, col] = cellPos(i);
    const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
    const tokens = g.players.filter((p) => !p.bankrupt && p.pos === i)
      .map((p) => `<span class="token" style="background:${p.color}" title="${esc(p.name)}"></span>`).join("");
    const lvl = EM.level(g, i);
    const band = s.type === "prop" ? `<span class="band" style="background:${GROUPS[s.group].color}"></span>` : "";
    const label = s.type === "prop" || s.type === "rer" ? (s.short || s.name.split(/[- ]/)[0]) : (s.short || "");
    return `
      <button class="cell ${s.type} ${S.sel === i ? "sel" : ""}" style="grid-row:${row};grid-column:${col};${owner ? `box-shadow:inset 0 0 0 2px ${owner.color}` : ""}" onclick="A.select(${i})">
        ${band}
        <span class="ic">${ICONS[s.type] || ""}</span>
        <span class="lb">${esc(label)}</span>
        ${lvl ? `<span class="lv">${"▮".repeat(lvl)}</span>` : s.price && !owner ? `<span class="pr">${s.price}</span>` : ""}
        <span class="tk">${tokens}</span>
      </button>`;
  }).join("");
  const cur = EM.current(g);
  const dice = g.dice ? g.dice.map((d) => "⚀⚁⚂⚃⚄⚅"[d - 1]).join(" ") : "🎲";
  return `
    <div class="board">
      ${cells}
      <div class="center-area">
        <div class="dice">${dice}</div>
        <div><b style="color:${cur.color}">${esc(cur.name)}</b></div>
        ${g.card ? `<div class="evt">🎴 ${esc(g.card.text)}</div>` : ""}
        ${g.pot ? `<div class="muted">☕ Cagnotte : ${money(g.pot)}</div>` : ""}
        ${EM.inflation(g) > 1 ? `<div class="muted">📈 Loyers +${Math.round((EM.inflation(g) - 1) * 100)} %</div>` : ""}
      </div>
    </div>`;
}

// ---------- Partie ----------

function gameView() {
  const g = S.game;
  if (g.stage === "end") return endView();
  const roundTxt = g.settings.mode === "tours" ? `Tour ${g.round} / ${g.settings.maxRounds}` : `Tour ${g.round}`;
  return `
    <div class="phase-wrap"><span class="phase">${roundTxt}</span></div>
    ${boardView()}
    ${actionsView()}
    ${tradeIncomingView()}
    ${S.sel !== null ? spaceView(S.sel) : ""}
    ${playersView()}
    ${me() && !me().bankrupt ? myPropsView() + tradeView() : ""}
    ${logView()}
    ${leaveButton()}`;
}

function actionsView() {
  const g = S.game;
  const p = me();
  const cur = EM.current(g);
  const mine = p && cur.id === p.id;
  const s = SPACES[cur.pos];

  if (g.stage === "auction") {
    const a = g.auction;
    const left = Math.max(0, Math.ceil((a.endsAt - (Date.now() + S.clockOffset)) / 1000));
    const leader = a.bidder ? EM.P(g, a.bidder).name : "personne";
    const bidBtn = (inc) => p && !p.bankrupt && p.cash >= a.bid + inc
      ? `<button class="secondary" onclick="A.bid(${a.bid + inc})">${a.bid + inc} €</button>` : "";
    return card(`
      <h2>🔨 Enchères : ${esc(SPACES[a.space].name)}</h2>
      <p>Offre : <b>${money(a.bid)}</b> (${esc(leader)}) · <span class="countdown">⏳ ${left} s</span></p>
      <div class="row">${bidBtn(10)}${bidBtn(50)}${bidBtn(100)}</div>
      <p class="muted">Prix normal : ${money(SPACES[a.space].price)}. Adjugé quand plus personne n'enchérit.</p>`, "task");
  }
  if (!mine) {
    const debt = g.stage === "debt" ? " (il doit trouver de l'argent)" : "";
    return card(`<p class="center">C'est au tour de <b style="color:${cur.color}">${esc(cur.name)}</b>${cur.bot ? " 🤖" : ""}${debt}…</p>`);
  }
  if (g.stage === "debt") {
    return card(`
      <h2>💸 Il te manque de l'argent</h2>
      <p>Tu dois payer <b>${money(g.debt.amount)}</b> et tu as <b>${money(p.cash)}</b>.</p>
      <p class="muted">Revends des constructions ou des villes (dans « Mes villes » plus bas), puis paye.</p>
      <button onclick="A.do('payDebt')" ${p.cash >= g.debt.amount ? "" : "disabled"}>Payer ${money(g.debt.amount)}</button>
      <button class="danger" onclick="A.bankrupt()">Abandonner (faillite)</button>`, "task");
  }
  if (g.stage === "buy") {
    return card(`
      <h2>${ICONS[s.type] || "🏙️"} ${esc(s.name)} est à vendre</h2>
      <p>Prix : <b>${money(s.price)}</b> · Tu as ${money(p.cash)}</p>
      <button onclick="A.do('buy')" ${p.cash >= s.price ? "" : "disabled"}>Acheter ${money(s.price)}</button>
      <button class="secondary" onclick="A.do('auction')">Mettre aux enchères</button>`, "task");
  }
  if (g.stage === "roll") {
    return card(`
      ${p.jail ? `<p>🚧 Tu es coincé dans les Bouchons (essai ${p.jail}/3). Fais un double pour sortir.</p>` : ""}
      <button onclick="A.do('roll')">🎲 Lancer les dés</button>
      ${p.jail && p.cash >= EM.JAIL_FEE ? `<button class="secondary" onclick="A.do('jailPay')">Payer ${EM.JAIL_FEE} € pour sortir</button>` : ""}
      ${p.jail && p.jailCards ? `<button class="secondary" onclick="A.do('jailCard')">Utiliser mon Passe Navigo</button>` : ""}`, "task");
  }
  return card(`<button onclick="A.do('endTurn')">✅ Finir mon tour</button>
    <p class="muted center">Tu peux construire ou échanger avant de finir.</p>`, "task");
}

function spaceView(i) {
  const g = S.game;
  const s = SPACES[i];
  const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
  let body = "";
  if (s.type === "prop") {
    body = `<p class="muted">${esc(GROUPS[s.group].name)} · Prix ${money(s.price)} · Construction ${money(s.build)}</p>
      <p>Loyer : ${s.rent} € · département complet ${s.rent * 2} €<br>${LEVELS.slice(1).map((l, k) => `${l} : ${s.rent * LEVEL_MULT[k + 1]} €`).join(" · ")}</p>`;
  } else if (s.type === "rer") {
    body = `<p class="muted">Prix ${money(s.price)}</p><p>Loyer : 25 / 50 / 100 / 200 € selon le nombre de RER possédés.</p>`;
  } else {
    const txt = {
      start: `Touche ${START_BONUS} € à chaque passage.`,
      jail: "Les Bouchons : sors avec un double, en payant, ou avec un Passe Navigo.",
      pause: "Celui qui s'arrête ici gagne la cagnotte.",
      control: "Contrôle ! Direction les Bouchons.",
      event: "Tire une carte événement.",
      tax: `Paye ${s.amount} € à la cagnotte.`,
    }[s.type];
    body = `<p>${txt}</p>`;
  }
  return card(`
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${ICONS[s.type] || "🏙️"} ${esc(s.name)}</h2>
    <button class="icon ghost" onclick="A.select(null)">✕</button></div>
    ${body}
    ${owner ? `<p>Propriétaire : <b style="color:${owner.color}">${esc(owner.name)}</b>${EM.level(g, i) ? ` · ${LEVELS[EM.level(g, i)]}` : ""} · loyer actuel ${money(EM.rent(g, i))}</p>` : ""}`);
}

function playersView() {
  const g = S.game;
  const cur = EM.current(g);
  return card(`<h2>Joueurs</h2><ul class="players">${g.players.map((p) => `
    <li class="${p.bankrupt ? "dead" : ""}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="name">${p.id === cur.id ? "▶ " : ""}${esc(p.name)}${p.bot ? " 🤖" : ""}${p.jail ? " 🚧" : ""}
        <small class="muted" style="display:block;font-weight:400">${esc(SPACES[p.pos].name)} · patrimoine ${money(EM.netWorth(g, p))}</small></span>
      <b>${money(p.cash)}</b>
    </li>`).join("")}</ul>`);
}

function myPropsView() {
  const g = S.game;
  const p = me();
  const props = EM.owned(g, p.id).sort((a, b) => a - b);
  const mine = EM.current(g).id === p.id;
  const canAct = (mine && ["roll", "done"].includes(g.stage)) || g.debt?.pid === p.id;
  const canBuildNow = mine && ["roll", "done"].includes(g.stage);
  return card(`
    <h2>🏙️ Mes villes · ${money(p.cash)}${p.jailCards ? ` · 🎫 ×${p.jailCards}` : ""}</h2>
    ${props.length ? `<ul class="players">${props.map((i) => {
      const s = SPACES[i];
      const lvl = EM.level(g, i);
      const color = s.type === "prop" ? GROUPS[s.group].color : "#94a3b8";
      return `<li>
        <span class="dot" style="background:${color}"></span>
        <span class="name" onclick="A.select(${i})">${esc(s.name)}<small class="muted" style="display:block;font-weight:400">${LEVELS[lvl]} · loyer ${money(EM.rent(g, i))}</small></span>
        ${canBuildNow && EM.canBuild(g, p.id, i) && p.cash >= s.build ? `<button class="icon secondary" title="Construire (${s.build} €)" onclick="A.do('build', {space: ${i}})">🏗️</button>` : ""}
        ${canAct && lvl ? `<button class="icon secondary" title="Revendre une construction" onclick="A.do('sellLevel', {space: ${i}})">➖</button>` : ""}
        ${canAct && !lvl ? `<button class="icon secondary" title="Revendre à la banque (${s.price / 2} €)" onclick="A.sellProp(${i})">💲</button>` : ""}
      </li>`;
    }).join("")}</ul>` : `<p class="muted">Tu n'as encore aucune ville.</p>`}
    <p class="muted" style="font-size:.8rem">🏗️ construire (département complet) · ➖ revendre une construction (moitié prix) · 💲 revendre la ville à la banque (moitié prix)</p>`);
}

// ---------- Échanges ----------

function tradeIncomingView() {
  const g = S.game;
  const t = g.trade;
  if (!t) return "";
  const names = (ids) => ids.map((i) => esc(SPACES[i].name)).join(", ");
  const side = (o) => [o.props.length ? names(o.props) : "", o.cash ? money(o.cash) : ""].filter(Boolean).join(" + ") || "rien";
  const from = EM.P(g, t.from);
  const to = EM.P(g, t.to);
  if (t.to === S.me) {
    return card(`
      <h2>🤝 ${esc(from.name)} te propose un échange</h2>
      <p>Tu reçois : <b>${side(t.give)}</b><br>Tu donnes : <b>${side(t.get)}</b></p>
      <div class="row"><button onclick="A.do('respond', {accept: true})">Accepter</button><button class="secondary" onclick="A.do('respond', {accept: false})">Refuser</button></div>`, "task");
  }
  if (t.from === S.me) {
    return card(`<p>🤝 Échange proposé à <b>${esc(to.name)}</b> : tu donnes ${side(t.give)}, tu reçois ${side(t.get)}. En attente…</p>
      <button class="secondary" onclick="A.do('cancelTrade')">Annuler</button>`);
  }
  return card(`<p class="muted">🤝 ${esc(from.name)} propose un échange à ${esc(to.name)}…</p>`);
}

function tradeView() {
  const g = S.game;
  if (g.trade || g.stage === "auction") return "";
  const t = S.trade;
  const others = EM.active(g).filter((p) => p.id !== S.me);
  const tradable = (pid) => EM.owned(g, pid).filter((i) => !(SPACES[i].type === "prop" && EM.groupSpaces(SPACES[i].group).some((j) => EM.level(g, j))));
  const chips = (ids, list) => ids.length
    ? ids.map((i) => `<button class="chip ${t[list].includes(i) ? "on" : ""}" onclick="A.tradeToggle('${list}', ${i})">${esc(SPACES[i].name)}</button>`).join("")
    : `<span class="muted">aucune</span>`;
  const partner = t.to && EM.P(g, t.to);
  return card(`
    <details id="trade">
      <summary><b>🤝 Proposer un échange</b></summary>
      <div class="row" style="flex-wrap:wrap;margin-top:8px">${others.map((p) => `
        <button class="${t.to === p.id ? "" : "secondary"}" onclick="A.tradeWith('${p.id}')">${esc(p.name)}</button>`).join("")}</div>
      ${partner ? `
        <h3>Tu donnes</h3><div class="chips">${chips(tradable(S.me), "give")}</div>
        <input id="giveCash" type="number" min="0" step="10" placeholder="+ argent (€)" value="${t.giveCash || ""}" oninput="S.trade.giveCash=+this.value||0">
        <h3>Tu demandes à ${esc(partner.name)}</h3><div class="chips">${chips(tradable(partner.id), "get")}</div>
        <input id="getCash" type="number" min="0" step="10" placeholder="+ argent (€)" value="${t.getCash || ""}" oninput="S.trade.getCash=+this.value||0">
        <button onclick="A.propose()">Proposer l'échange</button>` : ""}
    </details>`);
}

function logView() {
  const g = S.game;
  return card(`<details id="log" open><summary><b>📜 Journal</b></summary>
    <div class="live-log">${g.log.slice(-12).reverse().map((l) => `<div>${esc(l)}</div>`).join("")}</div></details>`);
}

function endView() {
  const g = S.game;
  const w = EM.P(g, g.winner);
  const ranking = g.players.slice().sort((a, b) => EM.netWorth(g, b) - EM.netWorth(g, a));
  return `
    <div class="banner civils"><div class="emoji">🏆</div><h2>${esc(w.name)} gagne !</h2></div>
    ${boardView()}
    ${card(`<h2>Classement</h2><ol>${ranking.map((p) => `<li><b style="color:${p.color}">${esc(p.name)}</b> : ${p.bankrupt ? "faillite" : money(EM.netWorth(g, p))}</li>`).join("")}</ol>`)}
    ${isHost() ? `<button onclick="A.replay()">🔄 Rejouer</button>` : `<p class="muted center">L'hôte peut relancer une partie.</p>`}
    ${leaveButton()}`;
}

// ---------- Actions ----------

const A = {
  do(type, data = {}) {
    if (S.mode === "host") act((g) => EM.act(g, S.me, type, data, Date.now()));
    else room.send("act", { pid: S.me, type, data });
  },

  bid(amount) {
    A.do("bid", { amount });
  },

  bankrupt() {
    if (confirm("Abandonner la partie ? Tout ce que tu possèdes sera perdu.")) A.do("bankrupt");
  },

  sellProp(i) {
    if (confirm(`Revendre ${SPACES[i].name} à la banque pour ${SPACES[i].price / 2} € ?`)) A.do("sellProp", { space: i });
  },

  select(i) {
    S.sel = S.sel === i ? null : i;
    render();
  },

  tradeWith(pid) {
    S.trade = { to: pid, give: [], get: [], giveCash: 0, getCash: 0 };
    render();
  },

  tradeToggle(list, i) {
    const l = S.trade[list];
    S.trade[list] = l.includes(i) ? l.filter((x) => x !== i) : [...l, i];
    render();
  },

  propose() {
    const t = S.trade;
    const offer = { to: t.to, give: { props: t.give, cash: t.giveCash || 0 }, get: { props: t.get, cash: t.getCash || 0 } };
    if (!EM.tradeValid(S.game, { from: S.me, ...offer })) return toast("Échange impossible : vérifie les villes et l'argent.");
    A.do("propose", offer);
    S.trade = { to: null, give: [], get: [], giveCash: 0, getCash: 0 };
  },

  addBot() {
    if (allPlayers().length >= 6) return;
    const used = S.bots.map((b) => b.name);
    const name = BOT_NAMES.find((n) => !used.includes(n)) || "Robot";
    S.bots.push({ id: "bot-" + Math.random().toString(36).slice(2, 8), name, bot: true });
    act();
  },

  removeBot(id) {
    S.bots = S.bots.filter((b) => b.id !== id);
    act();
  },

  setMode(mode, rounds) {
    S.settings = { mode, maxRounds: rounds || S.settings.maxRounds };
    act();
  },

  start() {
    if (allPlayers().length < 2) return;
    S.game = EM.newGame(allPlayers(), S.settings);
    S.sel = null;
    act();
  },

  replay() {
    S.game = null;
    S.lobby = room.presence();
    act();
  },

  createRoom(resume) {
    if (!readName()) return;
    S.mode = "host";
    S.hostId = S.me;
    const saved = JSON.parse(localStorage.getItem("em-host") || "null");
    if (resume && saved) Object.assign(S, { code: saved.code, game: saved.game, bots: saved.bots || [], settings: saved.settings || S.settings });
    else S.code = Common.randomCode();
    connect();
    startHostLoop();
    act();
  },

  joinRoom() {
    if (!readName()) return;
    const code = document.getElementById("joincode").value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) {
      S.error = "Le code fait 4 lettres.";
      return render();
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
    if (navigator.share) navigator.share({ title: "Empire IDF", text: "Rejoins ma partie d'Empire IDF !", url: link }).catch(() => {});
    else navigator.clipboard.writeText(link).then(() => toast("Lien copié !"));
  },

  leave() {
    if (S.game && S.mode === "host" && S.game.stage !== "end" && !confirm("Quitter la partie ?")) return;
    if (S.mode === "host") localStorage.removeItem("em-host");
    room?.leave();
    room = null;
    clearInterval(hostTimer);
    Object.assign(S, { mode: null, code: "", hostId: null, hostGone: false, game: null, lobby: [], bots: [], error: "", status: "", sel: null });
    history.replaceState(null, "", location.pathname);
    render();
  },
};

function readName() {
  const n = document.getElementById("name").value.trim();
  if (!n) {
    S.error = "Entre ton prénom.";
    render();
    return false;
  }
  S.name = n;
  S.error = "";
  localStorage.setItem("uc-name", n);
  return true;
}

// Applique une action, puis sauvegarde, diffuse et redessine (côté hôte).
function act(fn) {
  if (S.game && fn) fn(S.game);
  if (S.mode === "host") {
    localStorage.setItem("em-host", JSON.stringify({ code: S.code, game: S.game, bots: S.bots, settings: S.settings }));
    room?.send("state", { hostId: S.me, game: S.game, lobby: S.lobby, bots: S.bots, settings: S.settings, now: Date.now() });
  }
  render();
}

// L'hôte fait avancer les enchères et joue pour les robots, une action à la fois.
let hostTimer = null;
function startHostLoop() {
  clearInterval(hostTimer);
  hostTimer = setInterval(() => {
    const g = S.game;
    if (S.mode !== "host" || !g || g.stage === "end") return;
    let changed = EM.tick(g, Date.now());
    if (EM.botStep(g, Date.now())) changed = true;
    if (changed) act();
    else if (g.stage === "auction") render(); // compte à rebours
  }, 800);
}

// ---------- Réseau ----------

function connect() {
  room = Common.joinRoom("empire-" + S.code, S.me, S.name, {
    events: ["state", "act"],
    message(event, payload) {
      if (event === "state" && S.mode === "player") {
        Object.assign(S, {
          hostId: payload.hostId, hostGone: false, game: payload.game, lobby: payload.lobby,
          bots: payload.bots, settings: payload.settings, clockOffset: payload.now - Date.now(),
        });
        render();
      }
      if (event === "act" && S.mode === "host" && S.game) {
        act((g) => EM.act(g, payload.pid, payload.type, payload.data, Date.now()));
      }
    },
    presence(list) {
      if (S.mode === "player") {
        const gone = !!S.hostId && !list.some((p) => p.id === S.hostId);
        if (gone !== S.hostGone) {
          S.hostGone = gone;
          render();
        }
        return;
      }
      if (!S.game) S.lobby = list.slice(0, 6 - S.bots.length);
      act();
    },
    status(text) {
      S.status = text;
      render();
    },
  });
}

// Compte à rebours des enchères côté joueurs.
setInterval(() => {
  if (S.mode === "player" && S.game?.stage === "auction") render();
}, 1000);

render();
