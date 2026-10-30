// Interface d'Empire IDF (en ligne : l'hôte fait tourner la partie et les robots).

const { esc, toast } = Common;

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
  sel: null, // case affichée dans la fiche
  tab: "villes",
  trade: { to: null, give: [], get: [], giveCash: 0, getCash: 0 },
  clockOffset: 0, // horloge de l'hôte - horloge locale (compte à rebours des enchères)
  status: "",
  error: "",
};

let room = null;
const BOT_NAMES = ["Robot Momo", "Robot Lina", "Robot Kev", "Robot Inès", "Robot Yanis"];

// Icônes vectorielles (Lucide) : identiques sur tous les téléphones, contrairement aux emojis.
const ic = (name, cls = "") => `<i data-lucide="${name}" class="ic ${cls}"></i>`;
const SPACE_ICON = { start: "flag", jail: "lock", pause: "coffee", control: "siren", event: "sparkles", tax: "landmark", rer: "train-front" };
const LEVEL_ICON = ["", "house", "building", "building-2"];

// ---------- Rendu ----------

function render() {
  const g = S.game;
  const key = [S.mode, !!g, g?.stage, g?.turn].join("|");
  Common.render(document.getElementById("app"), view(), key);
  window.lucide?.createIcons();
  if (g) Anim.afterRender();
}

const card = (html, cls = "") => `<div class="card ${cls}">${html}</div>`;
const isHost = () => S.mode === "host";
const me = () => S.game && EM.P(S.game, S.me);
const money = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const leaveButton = () => `<button class="ghost btn-ic" onclick="A.leave()">${ic("log-out")} Quitter</button>`;
const spaceColor = (s) => (s.type === "prop" ? GROUPS[s.group].color : s.type === "rer" ? "#93c5fd" : "#e5e7eb");

function view() {
  if (!S.mode) return homeView();
  const warn = S.hostGone ? `<div class="alert">L'hôte s'est déconnecté. La partie reprendra dès qu'il revient.</div>` : "";
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
      <div class="mode"><span class="emoji" style="color:#facc15">${ic("building-2")}</span>
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
        <summary><b>Les règles</b></summary>
        <p class="muted">Lance les dés et fais le tour du plateau. Achète les villes où tu t'arrêtes, ou mets-les aux enchères. Les autres te payent un loyer quand ils tombent chez toi.</p>
        <p class="muted">Possède tout un département pour doubler les loyers et construire : Résidence, Immeuble, puis Tour. Les 4 lignes de RER rapportent plus si tu en as plusieurs.</p>
        <p class="muted">Cases spéciales : Événement (cartes surprises), Taxe foncière (va dans la cagnotte), Pause terrasse (rafle la cagnotte), Garde à vue (direction la prison de Fleury). En prison, tu sors avec un double, en payant ${EM.JAIL_FEE} € ou avec une carte « Libéré sous caution ».</p>
        <p class="muted">Le Grand Paris s'embourgeoise : tous les 10 tours, les loyers augmentent de 20 %. Échanges de villes et d'argent à tout moment. Fin au nombre de tours choisi (le plus gros patrimoine gagne) ou à la faillite (au plus tard après ${EM.MAX_ROUNDS} tours).</p>
      </details>
    `)}
    <p class="center"><a href="../" class="muted">← Tous les jeux</a></p>`;
}

const allPlayers = () => [...S.lobby, ...S.bots];

function lobbyView() {
  const players = allPlayers();
  const s = S.settings;
  const opt = (mode, rounds, label) => `
    <button class="${s.mode === mode && (mode === "faillite" || s.maxRounds === rounds) ? "" : "secondary"}" onclick="A.setMode('${mode}', ${rounds})">${label}</button>`;
  return `
    ${card(`
      <p class="muted center" style="margin:0">Code du salon</p>
      <div class="code">${esc(S.code)}</div>
      <button class="secondary btn-ic" onclick="A.share()">${ic("share-2")} Inviter des joueurs</button>
    `)}
    ${card(`
      <h2 class="btn-ic" style="justify-content:flex-start">${ic("users")} Joueurs (${players.length}/6)</h2>
      <ul class="em-list">${players.map((p, i) => `
        <li><span class="em-chip" style="--pc:${PLAYER_COLORS[i % 6]};padding:0;border:0;background:none"><span class="av">${esc(p.name[0] || "?")}</span></span>
        <span class="tx"><b>${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</b><small>${p.bot ? "Robot" : p.id === S.hostId ? "Hôte" : "Joueur"}</small></span>
        ${p.bot && isHost() ? `<button class="icon ghost" onclick="A.removeBot('${p.id}')" aria-label="Retirer">${ic("x")}</button>` : p.bot ? ic("bot") : ""}</li>`).join("")}
      </ul>
      ${isHost() && players.length < 6 ? `<button class="secondary btn-ic" onclick="A.addBot()">${ic("bot")} Ajouter un robot</button>` : ""}
    `)}
    ${card(isHost() ? `
      <h2>Fin de partie</h2>
      <div class="row" style="flex-wrap:wrap">
        ${opt("tours", 15, "15 tours")}${opt("tours", 25, "25 tours")}${opt("tours", 40, "40 tours")}${opt("faillite", 0, "Faillite")}
      </div>
      <p class="muted">${s.mode === "faillite" ? `Le dernier joueur non ruiné gagne (au plus tard après ${EM.MAX_ROUNDS} tours, le plus riche).` : `Après ${s.maxRounds} tours de table, le plus gros patrimoine gagne.`}</p>
    ` : `<p class="muted">${s.mode === "faillite" ? "Jusqu'à la faillite" : `${s.maxRounds} tours`}</p>`)}
    ${isHost()
      ? `<button class="btn-ic" onclick="A.start()" ${players.length >= 2 ? "" : "disabled"}>${ic("dices")} Lancer la partie</button>
         ${players.length < 2 ? `<p class="muted center">Il faut au moins 2 joueurs (ajoute un robot !).</p>` : ""}`
      : `<p class="muted center">En attente du lancement par l'hôte…</p>`}
    ${leaveButton()}`;
}

// ---------- Plateau ----------

// Position de la case i sur la grille 9 × 9 (départ en bas à droite).
function cellPos(i) {
  if (i <= 8) return [9, 9 - i];
  if (i <= 16) return [9 - (i - 8), 1];
  if (i <= 24) return [1, 1 + (i - 16)];
  return [1 + (i - 24), 9];
}

function cellView(s, i) {
  const g = S.game;
  const [row, col] = cellPos(i);
  const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
  const lvl = EM.level(g, i);
  const corner = ["start", "jail", "pause", "control"].includes(s.type);
  const label = s.short || (s.type === "prop" || s.type === "rer" ? s.name.split(/[- ]/)[0] : s.name);
  const bought = Anim.justBought(i);
  return `
    <button class="em-cell ${s.type} ${corner ? "corner" : ""} ${S.sel === i ? "sel" : ""} ${bought ? "bought" : ""}"
      style="grid-row:${row};grid-column:${col};${owner ? `--oc:${owner.color}` : ""}" onclick="A.select(${i})">
      ${s.type === "prop" ? `<span class="band" style="background:${GROUPS[s.group].color}"></span>` : ""}
      <span class="body">
        ${SPACE_ICON[s.type] ? `<span class="big">${ic(SPACE_ICON[s.type])}</span>` : ""}
        <span class="nm">${esc(label)}</span>
        ${lvl ? `<span class="lv">${ic(LEVEL_ICON[lvl])}</span>` : s.price && !owner ? `<span class="pr">${s.price} €</span>` : ""}
      </span>
      ${owner ? `<span class="own" style="background:${owner.color}"></span>` : ""}
    </button>`;
}

function boardView() {
  const g = S.game;
  return `
    <div class="em-board" id="board">
      ${SPACES.map(cellView).join("")}
      <div class="em-center">
        <div class="em-logo">EMPIRE IDF</div>
        ${centerView()}
      </div>
      <div class="em-pawns">${g.players.filter((p) => !p.bankrupt).map((p) => `
        <div class="pawn ${EM.current(g).id === p.id ? "turn" : ""}" id="pawn-${p.id}" style="--pc:${p.color};${Anim.pawnStyle(p)}">${esc(p.name[0] || "?")}</div>`).join("")}
      </div>
    </div>`;
}

function diceView() {
  const faces = Anim.diceFaces();
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return `<div class="em-dice ${Anim.rolling() ? "rolling" : Anim.justLanded() ? "landed" : ""}" id="dice">${faces.map((f) => `
    <div class="die">${Array.from({ length: 9 }, (_, k) => `<span class="${PIPS[f].includes(k) ? "on" : ""}"></span>`).join("")}</div>`).join("")}</div>`;
}

// Le centre du plateau montre la situation et LE bouton à toucher.
function centerView() {
  const g = S.game;
  if (g.stage === "end") {
    const w = EM.P(g, g.winner);
    return `<div class="em-trophy">${ic("crown")}</div><div class="em-status"><b style="color:${w.color}">${esc(w.name)}</b> gagne !</div>`;
  }
  const p = me();
  const cur = EM.current(g);
  const mine = p && cur.id === p.id;
  const s = SPACES[cur.pos];
  const extras = [
    g.pot ? `${ic("coffee")} Cagnotte ${money(g.pot)}` : "",
    EM.inflation(g) > 1 ? `${ic("trending-up")} Loyers +${Math.round((EM.inflation(g) - 1) * 100)} %` : "",
  ].filter(Boolean).join(" · ");
  const foot = extras ? `<div class="em-mini">${extras}</div>` : "";

  if (g.stage === "auction") {
    const a = g.auction;
    const left = Math.max(0, (a.endsAt - (Date.now() + S.clockOffset)) / 1000);
    const leader = a.bidder ? EM.P(g, a.bidder) : null;
    const bidBtn = (inc) => p && !p.bankrupt && p.cash >= a.bid + inc
      ? `<button class="secondary" onclick="A.bid(${a.bid + inc})">+${inc}</button>` : "";
    return `
      <div class="em-status btn-ic">${ic("gavel")} Enchères : <b>${esc(SPACES[a.space].name)}</b></div>
      <div class="em-bid">${money(a.bid)}</div>
      <div class="em-mini">${leader ? `Meilleure offre : <b style="color:${leader.color}">${esc(leader.name)}</b>` : "Aucune offre"} · prix ${money(SPACES[a.space].price)}</div>
      <div class="em-timer"><div style="width:${Math.min(100, (left / 8) * 100)}%"></div></div>
      <div class="row">${bidBtn(10)}${bidBtn(50)}${bidBtn(100)}</div>`;
  }

  const dice = diceView();
  if (Anim.rolling()) return `${dice}<div class="em-status">${esc(cur.name)} lance les dés…</div>`;
  if (!mine) {
    const what = g.stage === "debt" ? "cherche de l'argent pour payer" : g.stage === "buy" ? `hésite à acheter ${esc(s.name)}` : "joue";
    return `${dice}<div class="em-status"><b style="color:${cur.color}">${esc(cur.name)}</b> ${what}…</div>${foot}`;
  }
  if (g.stage === "debt") {
    return `${dice}
      <div class="em-status">Tu dois payer <b>${money(g.debt.amount)}</b>, tu as ${money(p.cash)}.</div>
      <div class="em-mini">Revends des constructions ou des villes dans l'onglet « Mes villes ».</div>
      <button onclick="A.do('payDebt')" ${p.cash >= g.debt.amount ? "" : "disabled"}>Payer</button>
      <button class="secondary" onclick="A.bankrupt()">Faillite</button>`;
  }
  if (g.stage === "buy") {
    return `
      <div class="em-deed"><div class="hd" style="background:${spaceColor(s)}">${esc(s.name)}</div>
        <div class="bd">${s.type === "prop" ? esc(GROUPS[s.group].name) : "Ligne de RER"}<br><b>${money(s.price)}</b></div></div>
      <div class="row">
        <button onclick="A.do('buy')" ${p.cash >= s.price ? "" : "disabled"}>Acheter</button>
        <button class="secondary" onclick="A.do('auction')">Enchères</button>
      </div>`;
  }
  if (g.stage === "roll") {
    return `${dice}
      ${p.jail ? `<div class="em-status btn-ic">${ic("lock")} En prison (essai ${p.jail}/3) : fais un double !</div>` : `<div class="em-status">À toi de jouer !</div>`}
      <button class="btn-ic" onclick="A.do('roll')">${ic("dices")} Lancer les dés</button>
      ${p.jail && (p.cash >= EM.JAIL_FEE || p.jailCards) ? `<div class="row">
        ${p.cash >= EM.JAIL_FEE ? `<button class="secondary" onclick="A.do('jailPay')">Payer ${EM.JAIL_FEE} €</button>` : ""}
        ${p.jailCards ? `<button class="secondary" onclick="A.do('jailCard')">Caution</button>` : ""}</div>` : foot}`;
  }
  return `${dice}<div class="em-status">${esc(s.name)}</div>
    <button class="btn-ic" onclick="A.do('endTurn')">Finir mon tour</button>
    <div class="em-mini">Construis ou échange avant de finir.</div>`;
}

// ---------- Partie ----------

function playersBar() {
  const g = S.game;
  const cur = EM.current(g);
  return `<div class="em-players">${g.players.map((p) => `
    <div class="em-chip ${p.id === cur.id ? "turn" : ""} ${p.bankrupt ? "out" : ""}" style="--pc:${p.color}" data-chip="${p.id}">
      <span class="av">${esc(p.name[0] || "?")}</span>
      <span><span class="nm">${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</span><br><span class="cs">${money(p.cash)}</span></span>
      ${p.jail ? `<span class="badge">${ic("lock")}</span>` : p.bot ? `<span class="badge" style="color:#93c5fd">${ic("bot")}</span>` : ""}
    </div>`).join("")}</div>`;
}

function gameView() {
  const g = S.game;
  const roundTxt = g.stage === "end" ? "Partie terminée" : g.settings.mode === "tours" ? `Tour ${g.round} / ${g.settings.maxRounds}` : `Tour ${g.round}`;
  const tabs = [["villes", "building-2", "Mes villes"], ["joueurs", "users", "Joueurs"], ["echanges", "arrow-left-right", "Échanges"], ["journal", "scroll-text", "Journal"]];
  const body = { villes: myPropsView, joueurs: playersView, echanges: tradeView, journal: logView }[S.tab]();
  return `
    <div class="phase-wrap"><span class="phase">${roundTxt}</span></div>
    ${playersBar()}
    ${boardView()}
    ${g.stage === "end" ? endView() : ""}
    <div class="em-tabs">${tabs.map(([id, icon, label]) => `
      <button class="${S.tab === id ? "on" : ""}" onclick="A.tab('${id}')">${ic(icon)}<br>${label}</button>`).join("")}</div>
    ${card(body)}
    ${leaveButton()}
    ${S.sel !== null ? spaceSheet(S.sel) : ""}
    ${tradeIncomingView()}`;
}

function spaceSheet(i) {
  const g = S.game;
  const s = SPACES[i];
  const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
  let rows = "";
  if (s.type === "prop") {
    rows = `<tr><td>Loyer</td><td>${s.rent} €</td></tr><tr><td>Département complet</td><td>${s.rent * 2} €</td></tr>
      ${LEVELS.slice(1).map((l, k) => `<tr><td>${ic(LEVEL_ICON[k + 1])} ${l}</td><td>${s.rent * LEVEL_MULT[k + 1]} €</td></tr>`).join("")}
      <tr><td>Prix d'une construction</td><td>${s.build} €</td></tr>`;
  } else if (s.type === "rer") {
    rows = [1, 2, 3, 4].map((n) => `<tr><td>${n} RER possédé${n > 1 ? "s" : ""}</td><td>${25 * 2 ** (n - 1)} €</td></tr>`).join("");
  } else {
    const txt = {
      start: `Touche ${START_BONUS} € à chaque passage.`,
      jail: `Prison de Fleury : sors avec un double, en payant ${EM.JAIL_FEE} € ou avec une carte « Libéré sous caution ». Si tu ne fais que passer, rien ne se passe.`,
      pause: "Celui qui s'arrête ici rafle la cagnotte.",
      control: "Garde à vue : direction la prison !",
      event: "Tire une carte Événement : bonne ou mauvaise surprise.",
      tax: `Paye ${s.amount} € à la cagnotte.`,
    }[s.type];
    rows = `<tr><td colspan="2" style="text-align:left;font-weight:400">${txt}</td></tr>`;
  }
  const inflation = EM.inflation(g) > 1 && (s.type === "prop" || s.type === "rer") ? `<p class="muted">Loyers actuels +${Math.round((EM.inflation(g) - 1) * 100)} % (inflation).</p>` : "";
  return `
    <div class="em-sheet-bg" onclick="if(event.target===this)A.select(null)">
      <div class="em-sheet">
        <div class="deed-hd" style="background:${spaceColor(s)}">
          <small>${s.type === "prop" ? esc(GROUPS[s.group].name) : s.type === "rer" ? "Ligne de RER" : "Case spéciale"}</small>
          <h2>${esc(s.name)}</h2>
          ${s.price ? `<b>${money(s.price)}</b>` : ""}
        </div>
        <table>${rows}</table>
        ${inflation}
        ${owner ? `<p>Propriétaire : <b style="color:${owner.color}">${esc(owner.name)}</b>${EM.level(g, i) ? ` · ${LEVELS[EM.level(g, i)]}` : ""} · loyer actuel <b>${money(EM.rent(g, i))}</b></p>` : s.price ? `<p class="muted">Libre : à vendre.</p>` : ""}
        <button class="secondary" onclick="A.select(null)">Fermer</button>
      </div>
    </div>`;
}

function playersView() {
  const g = S.game;
  return `<ul class="em-list">${g.players.map((p) => `
    <li style="${p.bankrupt ? "opacity:.4" : ""}">
      <span class="sw" style="background:${p.color}"></span>
      <span class="tx"><b>${esc(p.name)}${p.bot ? " · robot" : ""}${p.jail ? " · en prison" : ""}${p.bankrupt ? " · faillite" : ""}</b>
        <small>${esc(SPACES[p.pos].name)} · ${EM.owned(g, p.id).length} propriété(s) · patrimoine ${money(EM.netWorth(g, p))}</small></span>
      <b>${money(p.cash)}</b>
    </li>`).join("")}</ul>`;
}

function myPropsView() {
  const g = S.game;
  const p = me();
  if (!p || p.bankrupt) return `<p class="muted">Tu ne joues plus dans cette partie.</p>`;
  const props = EM.owned(g, p.id).sort((a, b) => a - b);
  const mine = EM.current(g).id === p.id;
  const canAct = (mine && ["roll", "done"].includes(g.stage)) || g.debt?.pid === p.id;
  const canBuildNow = mine && ["roll", "done"].includes(g.stage);
  if (!props.length) return `<p class="muted">Tu n'as encore aucune propriété. Arrête-toi sur une ville libre pour l'acheter.</p>`;
  return `
    <ul class="em-list">${props.map((i) => {
      const s = SPACES[i];
      const lvl = EM.level(g, i);
      const full = s.type === "prop" && EM.ownsGroup(g, p.id, s.group);
      return `<li>
        <span class="sw" style="background:${spaceColor(s)}"></span>
        <span class="tx" onclick="A.select(${i})"><b>${esc(s.name)}</b>
          <small>${lvl ? LEVELS[lvl] : full ? "Département complet" : s.type === "rer" ? "RER" : "Terrain"} · loyer ${money(EM.rent(g, i))}</small></span>
        ${canBuildNow && EM.canBuild(g, p.id, i) && p.cash >= s.build ? `<button class="icon" title="Construire (${s.build} €)" onclick="A.do('build', {space: ${i}})">${ic("hammer")}</button>` : ""}
        ${canAct && lvl ? `<button class="icon secondary" title="Revendre une construction" onclick="A.do('sellLevel', {space: ${i}})">${ic("house")}</button>` : ""}
        ${canAct && !lvl ? `<button class="icon secondary" title="Revendre à la banque (${s.price / 2} €)" onclick="A.sellProp(${i})">${ic("wallet")}</button>` : ""}
      </li>`;
    }).join("")}</ul>
    <p class="muted" style="font-size:.78rem">Marteau : construire (département complet, à ton tour). Maison : revendre une construction. Porte-monnaie : revendre à la banque. Le tout à moitié prix.</p>
    ${p.jailCards ? `<p class="muted">Cartes « Libéré sous caution » : ${p.jailCards}</p>` : ""}`;
}

// ---------- Échanges ----------

const tradeSide = (o) => [o.props.map((i) => esc(SPACES[i].name)).join(", "), o.cash ? money(o.cash) : ""].filter(Boolean).join(" + ") || "rien";

function tradeIncomingView() {
  const t = S.game.trade;
  if (!t || t.to !== S.me) return "";
  const from = EM.P(S.game, t.from);
  return `
    <div class="em-sheet-bg">
      <div class="em-sheet">
        <h2 class="btn-ic" style="justify-content:flex-start">${ic("handshake")} ${esc(from.name)} te propose un échange</h2>
        <table><tr><td>Tu reçois</td><td>${tradeSide(t.give)}</td></tr><tr><td>Tu donnes</td><td>${tradeSide(t.get)}</td></tr></table>
        <div class="row" style="margin-top:12px"><button onclick="A.do('respond', {accept: true})">Accepter</button>
          <button class="secondary" onclick="A.do('respond', {accept: false})">Refuser</button></div>
      </div>
    </div>`;
}

function tradeView() {
  const g = S.game;
  const t = g.trade;
  if (t) {
    const from = EM.P(g, t.from);
    const to = EM.P(g, t.to);
    return t.from === S.me
      ? `<p>Échange proposé à <b>${esc(to.name)}</b> : tu donnes ${tradeSide(t.give)}, tu reçois ${tradeSide(t.get)}. En attente de sa réponse…</p>
         <button class="secondary" onclick="A.do('cancelTrade')">Annuler</button>`
      : `<p class="muted">${esc(from.name)} propose un échange à ${esc(to.name)}…</p>`;
  }
  if (!me() || me().bankrupt) return `<p class="muted">Tu ne joues plus dans cette partie.</p>`;
  if (g.stage === "auction" || g.stage === "end") return `<p class="muted">Pas d'échange pendant les enchères.</p>`;
  const d = S.trade;
  const others = EM.active(g).filter((p) => p.id !== S.me);
  const tradable = (pid) => EM.owned(g, pid).filter((i) => !(SPACES[i].type === "prop" && EM.groupSpaces(SPACES[i].group).some((j) => EM.level(g, j))));
  const chips = (ids, list) => ids.length
    ? ids.map((i) => `<button class="chip ${d[list].includes(i) ? "on" : ""}" onclick="A.tradeToggle('${list}', ${i})">${esc(SPACES[i].name)}</button>`).join("")
    : `<span class="muted">aucune</span>`;
  const partner = d.to && EM.P(g, d.to);
  return `
    <p class="muted">Avec qui veux-tu échanger ?</p>
    <div class="row" style="flex-wrap:wrap">${others.map((p) => `
      <button class="${d.to === p.id ? "" : "secondary"}" onclick="A.tradeWith('${p.id}')">${esc(p.name)}</button>`).join("")}</div>
    ${partner ? `
      <h3>Tu donnes</h3><div class="chips">${chips(tradable(S.me), "give")}</div>
      <input id="giveCash" type="number" min="0" step="10" placeholder="+ argent (€)" value="${d.giveCash || ""}" oninput="S.trade.giveCash=+this.value||0">
      <h3>Tu demandes à ${esc(partner.name)}</h3><div class="chips">${chips(tradable(partner.id), "get")}</div>
      <input id="getCash" type="number" min="0" step="10" placeholder="+ argent (€)" value="${d.getCash || ""}" oninput="S.trade.getCash=+this.value||0">
      <button class="btn-ic" onclick="A.propose()">${ic("handshake")} Proposer l'échange</button>` : ""}`;
}

function logView() {
  return `<div class="em-log">${S.game.log.slice(-15).reverse().map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
}

function endView() {
  const g = S.game;
  const ranking = g.players.slice().sort((a, b) => EM.netWorth(g, b) - EM.netWorth(g, a));
  return card(`
    <h2>Classement</h2>
    <ul class="em-list">${ranking.map((p, k) => `<li><b style="width:22px">${k + 1}</b><span class="sw" style="background:${p.color}"></span>
      <span class="tx"><b>${esc(p.name)}</b></span><b>${p.bankrupt ? "faillite" : money(EM.netWorth(g, p))}</b></li>`).join("")}</ul>
    ${isHost() ? `<button onclick="A.replay()">Rejouer</button>` : `<p class="muted center">L'hôte peut relancer une partie.</p>`}`);
}

// ---------- Animations ----------
// Tout est déduit de l'état reçu : dés (rollId), pions (positions), argent, cartes (cardId),
// achats. Rien ne change les règles : seulement ce qu'on voit, et quand.
const Anim = (() => {
  const st = { rollId: null, cardId: null, rollingUntil: 0, landedUntil: 0, faces: [5, 2], shown: {}, cash: {}, owners: null, bought: {}, turnKey: null, mover: null, roller: null };
  const ROLL_MS = 800;

  const rolling = () => Date.now() < st.rollingUntil;
  const justLanded = () => Date.now() < st.landedUntil;
  const diceFaces = () => st.faces;
  const justBought = (i) => Date.now() - (st.bought[i] || 0) < 1100;
  const busy = () => rolling() || !!st.mover;

  function cellCenter(i) {
    const [row, col] = cellPos(i);
    return [((col - 0.5) / 9) * 100, ((row - 0.5) / 9) * 100];
  }

  // Plusieurs pions sur la même case : on les décale un peu.
  function pawnStyle(p) {
    const g = S.game;
    const pos = st.shown[p.id] ?? p.pos;
    const here = g.players.filter((q) => !q.bankrupt && (st.shown[q.id] ?? q.pos) === pos);
    const k = here.findIndex((q) => q.id === p.id);
    const off = here.length > 1 ? [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.6], [0, 1.6]][k % 6] : [0, 0];
    const [x, y] = cellCenter(pos);
    return `left:calc(${x}% + ${off[0] * 7}px);top:calc(${y}% + ${off[1] * 7}px)`;
  }

  function placePawns() {
    for (const p of S.game.players) {
      const el = document.getElementById("pawn-" + p.id);
      if (el) el.setAttribute("style", `--pc:${p.color};${pawnStyle(p)}`);
    }
  }

  // Avance les pions case par case jusqu'à leur vraie position.
  function stepPawns() {
    const g = S.game;
    if (!g) return;
    let moving = false;
    for (const p of g.players) {
      if (p.bankrupt || st.shown[p.id] === undefined || st.shown[p.id] === p.pos) continue;
      const dist = (p.pos - st.shown[p.id] + SPACES.length) % SPACES.length;
      st.shown[p.id] = dist <= 12 ? (st.shown[p.id] + 1) % SPACES.length : p.pos; // téléportation si recul ou prison
      moving = true;
      const el = document.getElementById("pawn-" + p.id);
      if (el) {
        el.classList.remove("hop");
        void el.offsetWidth;
        el.classList.add("hop");
      }
    }
    placePawns();
    if (!moving) {
      clearInterval(st.mover);
      st.mover = null;
      showCard();
    }
  }

  function startMoving() {
    if (!st.mover) st.mover = setInterval(stepPawns, 150);
  }

  function rollDice(final) {
    st.rollingUntil = Date.now() + ROLL_MS;
    clearInterval(st.roller);
    st.roller = setInterval(() => {
      st.faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      const el = document.getElementById("dice");
      if (!el) return;
      el.outerHTML = diceView();
      if (!rolling()) {
        clearInterval(st.roller);
        st.faces = final;
        st.landedUntil = Date.now() + 400;
        render();
        startMoving();
      }
    }, 90);
  }

  let pendingCard = null;
  function showCard() {
    if (!pendingCard) return;
    const c = pendingCard;
    pendingCard = null;
    const el = document.createElement("div");
    el.className = "em-cardpop" + (c.good ? "" : " bad");
    el.innerHTML = `<div class="big">${ic("sparkles")}</div><div class="k">ÉVÉNEMENT</div><div class="t">${esc(c.text)}</div>`;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
    window.lucide?.createIcons();
    setTimeout(() => el.remove(), 3800);
  }

  function floatMoney(pid, diff) {
    const chip = document.querySelector(`[data-chip="${pid}"]`);
    if (!chip) return;
    const r = chip.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "em-money " + (diff > 0 ? "plus" : "minus");
    el.textContent = (diff > 0 ? "+" : "−") + money(Math.abs(diff));
    el.style.left = r.left + r.width / 2 - 30 + "px";
    el.style.top = r.top + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  function banner(text) {
    const el = document.createElement("div");
    el.className = "em-banner";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  // Appelé après chaque rendu : repère ce qui a changé depuis la dernière fois.
  function afterRender() {
    const g = S.game;
    if (!g) return;
    let first = st.owners === null;

    if (g.rollId && g.rollId !== st.rollId) {
      const isNew = st.rollId !== null;
      st.rollId = g.rollId;
      if (isNew) rollDice(g.dice);
      else st.faces = g.dice;
    }
    if (g.card && g.card.id !== st.cardId) {
      if (st.cardId !== null || !first) pendingCard = g.card;
      st.cardId = g.card.id;
    }
    for (const p of g.players) {
      if (st.shown[p.id] === undefined) st.shown[p.id] = p.pos;
      const before = st.cash[p.id];
      if (before !== undefined && before !== p.cash && !first) floatMoney(p.id, p.cash - before);
      st.cash[p.id] = p.cash;
    }
    if (!first) {
      for (const i of Object.keys(g.owners)) if (st.owners[i] !== g.owners[i]) st.bought[i] = Date.now();
    }
    st.owners = { ...g.owners };

    const turnKey = `${g.round}-${g.turn}`;
    if (turnKey !== st.turnKey) {
      if (st.turnKey && EM.current(g).id === S.me && g.stage === "roll") banner("À toi de jouer !");
      st.turnKey = turnKey;
    }
    if (!rolling() && g.players.some((p) => !p.bankrupt && st.shown[p.id] !== p.pos)) startMoving();
    else if (!rolling() && !st.mover) showCard();
  }

  function reset() {
    Object.assign(st, { rollId: null, cardId: null, shown: {}, cash: {}, owners: null, bought: {}, turnKey: null });
  }

  return { rolling, justLanded, diceFaces, justBought, busy, pawnStyle, afterRender, reset };
})();

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

  tab(id) {
    S.tab = id;
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
    Anim.reset();
    S.game = EM.newGame(allPlayers(), S.settings);
    S.sel = null;
    S.tab = "villes";
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
    Anim.reset();
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

// L'hôte fait avancer les enchères et joue pour les robots, une action à la fois, en
// attendant la fin des animations (dés, pions) pour qu'on puisse suivre.
let hostTimer = null;
function startHostLoop() {
  clearInterval(hostTimer);
  hostTimer = setInterval(() => {
    const g = S.game;
    if (S.mode !== "host" || !g || g.stage === "end") return;
    let changed = EM.tick(g, Date.now());
    if (!Anim.busy() && EM.botStep(g, Date.now())) changed = true;
    if (changed) act();
    else if (g.stage === "auction") render(); // compte à rebours
  }, 900);
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
        if (!payload.game) Anim.reset();
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
