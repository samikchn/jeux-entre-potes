// Interface d'Empire IDF (en ligne : l'hôte fait tourner la partie et les robots).
// Tout tient sur un écran : ordinateur = 3 colonnes ; téléphone = plateau + barre d'onglets.

const { esc, toast } = Common;

// Personnages (avatars dessinés DiceBear « Adventurer », licence CC BY 4.0).
const AVATARS = ["Felix", "Aneka", "Jade", "Leo", "Mia", "Max", "Zoe", "Sam", "Nala", "Kai", "Lola", "Tom"];
const avatarUrl = (seed) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed || "Felix")}`;

const S = {
  mode: null, // "host" | "player"
  me: Common.playerId(),
  name: localStorage.getItem("uc-name") || "",
  avatar: localStorage.getItem("em-avatar") || AVATARS[Math.floor(Math.random() * AVATARS.length)],
  code: "",
  hostId: null,
  hostGone: false,
  game: null,
  lobby: [], // joueurs humains connectés
  bots: [], // robots ajoutés par l'hôte
  avatars: {}, // personnage choisi par chaque joueur (côté hôte, diffusé)
  settings: { mode: "tours", maxRounds: 25, events: true },
  sheet: null, // fenêtre ouverte : "space" | "players" | "props" | "trade" | "log"
  sel: null, // case affichée dans la fiche
  trade: { to: null, give: [], get: [], giveCash: 0, getCash: 0 },
  clockOffset: 0,
  rooms: [], // salons ouverts (annuaire)
  status: "",
  error: "",
};

let room = null;
const BOT_NAMES = ["Robot Momo", "Robot Lina", "Robot Kev", "Robot Inès", "Robot Yanis"];

const ic = (name, cls = "") => `<i data-lucide="${name}" class="ic ${cls}"></i>`;
const SPACE_ICON = { start: "flag", jail: "lock", pause: "coffee", control: "siren", event: "sparkles", tax: "landmark" };
const LEVEL_ICON = ["", "house", "building", "building-2"];
const card = (html, cls = "") => `<div class="card ${cls}">${html}</div>`;
const isHost = () => S.mode === "host";
const me = () => S.game && EM.P(S.game, S.me);
const money = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const plain = (t) => String(t).replace(/­/g, "");
const spaceColor = (s) => (s.type === "prop" ? GROUPS[s.group].color : s.type === "rer" ? "#94a3b8" : s.type === "util" ? "#5eead4" : "#e5e7eb");
// Sous-titre d'une case achetable : département, gare ou service.
const kindName = (s) => (s.type === "prop" ? GROUPS[s.group].name : s.type === "rer" ? "Gare parisienne" : s.type === "util" ? "Service" : "Case spéciale");
const avatarImg = (p, cls = "av") => `<img class="${cls}" style="--pc:${p.color || "#555"}" src="${avatarUrl(p.avatar)}" alt="">`;

// ---------- Rendu ----------

function render() {
  const g = S.game;
  document.body.classList.toggle("ingame", !!g);
  const key = [S.mode, !!g, g?.stage, g?.turn, S.sheet].join("|");
  Common.render(document.getElementById("app"), view(), key);
  window.lucide?.createIcons();
  if (g) Anim.afterRender();
}

function view() {
  if (!S.mode) return page(homeView());
  if (S.mode === "player" && !S.hostId) {
    return page(card(`<p class="center">Connexion au salon <b>${esc(S.code)}</b>…</p>${S.status ? `<p class="muted center">${esc(S.status)}</p>` : ""}`) + leaveButton());
  }
  const warn = S.hostGone ? `<div class="alert">L'hôte s'est déconnecté. La partie reprendra dès qu'il revient.</div>` : "";
  if (!S.game) return page(warn + lobbyView());
  return gameView(warn);
}

const page = (html) => `<div class="em-page"><div class="em-title"><img class="logo" src="logo.svg" alt="">Empire IDF</div>${html}</div>`;
const leaveButton = () => `<button class="ghost btn-ic" onclick="A.leave()">${ic("log-out")} Quitter</button>`;

function homeView() {
  const joinCode = new URLSearchParams(location.search).get("salon") || "";
  const saved = JSON.parse(localStorage.getItem("em-host-v3") || "null");
  return `
    ${card(`
      <p class="muted" style="margin-top:0">Achète les villes d'Île-de-France, complète les départements, construis des tours et ruine tes potes.</p>
      ${Common.onlineConfigured() ? `
        <input id="name" placeholder="Ton prénom" maxlength="16" value="${esc(S.name)}">
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
        <p class="muted">Possède tout un département pour doubler les loyers et construire : Résidence, Immeuble, puis Tour. Les 4 grandes gares (au milieu de chaque côté) rapportent plus si tu en as plusieurs. Les 2 services (Antenne 5G, Data center) font payer 4 fois les dés, 10 fois si tu as les deux.</p>
        <p class="muted">Chance : cartes surprises. Les potes : les cartes de la bande. Taxe foncière : va dans la cagnotte. Pause terrasse : rafle la cagnotte. Garde à vue : direction la prison de Fleury. En prison, tu sors avec un double, en payant ${EM.JAIL_FEE} € ou avec une carte « Libéré sous caution ».</p>
        <p class="muted">Mode événements : à chaque tour de table, l'Île-de-France peut être secouée (manif, émeutes, essence, tweet de Trump…), ce qui fait varier les loyers, les prix et ton argent.</p>
        <p class="muted">Tous les 10 tours, les loyers augmentent de 20 %. Fin au nombre de tours choisi (le plus gros patrimoine gagne) ou à la faillite (au plus tard après ${EM.MAX_ROUNDS} tours).</p>
        <p class="muted" style="font-size:.75rem">Personnages : DiceBear « Adventurer » (Lisa Wischofsky, CC BY 4.0). Photos : Wikipédia / Wikimedia Commons.</p>
      </details>
    `)}
    ${card(`<div class="em-h">${ic("users")} Salons ouverts</div>${Common.roomsView(S.rooms, { root: "../", game: "empire" })}`)}
    <p class="center"><a href="../" class="muted">← Tous les jeux</a></p>`;
}

const allPlayers = () => [...S.lobby, ...S.bots].map((p) => ({ ...p, avatar: S.avatars[p.id] || p.avatar }));

function lobbyView() {
  const players = allPlayers();
  const s = S.settings;
  const opt = (mode, rounds, label) => `
    <button class="${s.mode === mode && (mode === "faillite" || s.maxRounds === rounds) ? "" : "secondary"}" onclick="A.setMode('${mode}', ${rounds})">${label}</button>`;
  return `
    ${card(`
      <p class="muted center" style="margin:0">Code du salon</p>
      <div class="code" style="color:var(--gold);background:none;-webkit-text-fill-color:currentColor">${esc(S.code)}</div>
      <button class="secondary btn-ic" onclick="A.share()">${ic("share-2")} Inviter des joueurs</button>
    `)}
    ${card(`
      <div class="em-h">${ic("users")} Choisis ton personnage</div>
      <div class="em-avatars">${AVATARS.map((a) => `
        <button class="${S.avatar === a ? "on" : ""}" onclick="A.pickAvatar('${a}')"><img src="${avatarUrl(a)}" alt="${a}"></button>`).join("")}</div>
    `)}
    ${card(`
      <div class="em-h">${ic("users")} Joueurs (${players.length}/6)</div>
      ${players.map((p, i) => `
        <div class="em-pl" style="--pc:${PLAYER_COLORS[i % 6]};margin-bottom:6px">
          ${avatarImg({ ...p, color: PLAYER_COLORS[i % 6] })}
          <span class="tx"><b>${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</b><small>${p.bot ? "Robot" : p.id === S.hostId ? "Hôte" : "Joueur"}</small></span>
          ${p.bot && isHost() ? `<button class="icon ghost" onclick="A.removeBot('${p.id}')" aria-label="Retirer">${ic("x")}</button>` : ""}
        </div>`).join("")}
      ${isHost() && players.length < 6 ? `<button class="secondary btn-ic" onclick="A.addBot()">${ic("bot")} Ajouter un robot</button>` : ""}
    `)}
    ${card(isHost() ? `
      <div class="em-h">Réglages</div>
      <div class="row" style="flex-wrap:wrap">
        ${opt("tours", 15, "15 tours")}${opt("tours", 25, "25 tours")}${opt("tours", 40, "40 tours")}${opt("faillite", 0, "Faillite")}
      </div>
      <p class="muted" style="font-size:.8rem">${s.mode === "faillite" ? `Le dernier joueur non ruiné gagne (au plus tard après ${EM.MAX_ROUNDS} tours).` : `Après ${s.maxRounds} tours de table, le plus gros patrimoine gagne.`}</p>
      <div class="em-toggle ${s.events ? "on" : ""}" onclick="A.toggleEvents()">
        <span class="sw2"></span><span><b>Mode événements</b><br><small class="muted">Manif, émeutes, prix de l'essence, tweet de Trump… qui font varier loyers, prix et argent.</small></span>
      </div>
    ` : `<p class="muted">${s.mode === "faillite" ? "Jusqu'à la faillite" : `${s.maxRounds} tours`} · mode événements ${s.events ? "activé" : "désactivé"}</p>`)}
    ${isHost()
      ? `<button class="btn-ic" onclick="A.start()" ${players.length >= 2 ? "" : "disabled"}>${ic("dices")} Lancer la partie</button>
         ${players.length < 2 ? `<p class="muted center">Il faut au moins 2 joueurs (ajoute un robot !).</p>` : ""}`
      : `<p class="muted center">En attente du lancement par l'hôte…</p>`}
    ${leaveButton()}`;
}

// ---------- Plateau ----------

// Ligne / colonne de la case i (grille 11 × 11 : 4 coins + 9 cases par côté, départ en bas à droite).
const N = 11;
function cellPos(i) {
  if (i <= 10) return [N, N - i];
  if (i <= 20) return [N - (i - 10), 1];
  if (i <= 30) return [1, 1 + (i - 20)];
  return [1 + (i - 30), N];
}
// Côté du plateau : la bande de couleur regarde le centre, le propriétaire est sur le bord extérieur.
const side = (i) => (i < 10 ? "s-b" : i < 20 ? "s-l" : i < 30 ? "s-t" : "s-r");

function cellView(s, i) {
  const g = S.game;
  const [row, col] = cellPos(i);
  const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
  const lvl = EM.level(g, i);
  const label = plain(s.short || s.name);
  const pos = `grid-row:${row};grid-column:${col}`;
  const cls = `${S.sel === i ? "sel" : ""} ${Anim.justBought(i) ? "bought" : ""}`;
  if (["start", "jail", "pause", "control"].includes(s.type)) {
    return `<button class="cell corner ${s.type} ${cls}" style="${pos}" onclick="A.select(${i})">
      <span class="big">${ic(SPACE_ICON[s.type])}</span><span class="ct"><span class="nm" style="--n:${label.length}">${esc(label)}</span></span></button>`;
  }
  if (s.type === "event" || s.type === "tax") {
    return `<button class="cell special ${s.type} ${side(i)} ${cls}" style="${pos}" onclick="A.select(${i})">
      <span class="ct"><span class="big">${ic(s.icon || SPACE_ICON[s.type])}</span><span class="nm" style="--n:${label.length}">${esc(label)}</span></span></button>`;
  }
  const tint = owner ? `--cbg:color-mix(in srgb, ${owner.color} 16%, #1b1f27);--oc:${owner.color}` : "";
  const info = lvl
    ? `<span class="lv">${Array.from({ length: lvl }, () => ic(LEVEL_ICON[1])).join("")}</span>`
    : owner ? `<span class="pr" style="color:${owner.color}">${EM.rent(g, i)} €</span>` : `<span class="pr">${EM.price(g, i)} €</span>`;
  return `<button class="cell ${side(i)} ${cls}" style="${pos};${tint}" onclick="A.select(${i})">
      <span class="strip" style="background:${spaceColor(s)}">${ic(s.icon)}</span>
      <span class="ct"><span class="nm" style="--n:${Math.max(label.length, 4)}">${esc(label)}</span>${info}</span>
      ${owner ? `<span class="own"></span>` : ""}
    </button>`;
}

function boardView() {
  const g = S.game;
  return `
    <div class="em-board" id="board">
      ${SPACES.map(cellView).join("")}
      <div class="em-center">${centerView()}</div>
      <div class="em-pawns">${g.players.filter((p) => !p.bankrupt).map((p) => `
        <div class="pawn ${EM.current(g).id === p.id ? "turn" : ""}" id="pawn-${p.id}" style="--pc:${p.color};${Anim.pawnStyle(p)}">
          <img src="${avatarUrl(p.avatar)}" alt=""></div>`).join("")}
      </div>
    </div>`;
}

function diceView() {
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return `<div class="em-dice ${Anim.rolling() ? "rolling" : Anim.justLanded() ? "landed" : ""}" id="dice">${Anim.diceFaces().map((f) => `
    <div class="die">${Array.from({ length: 9 }, (_, k) => `<span class="${PIPS[f].includes(k) ? "on" : ""}"></span>`).join("")}</div>`).join("")}</div>`;
}

// Le centre montre la situation, LE bouton à toucher et les derniers événements.
function centerView() {
  const g = S.game;
  const feed = `<div class="em-feed">${g.log.slice(-3).reverse().map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;
  if (g.stage === "end") {
    const w = EM.P(g, g.winner);
    return `<div class="brand">EMPIRE IDF</div>${avatarImg(w, "av")}<div class="status"><b style="color:${w.color}">${esc(w.name)}</b> gagne la partie !</div>
      ${isHost() ? `<button onclick="A.replay()">Rejouer</button>` : `<div class="em-mini">L'hôte peut relancer une partie.</div>`}`;
  }
  const p = me();
  const cur = EM.current(g);
  const mine = p && cur.id === p.id;
  const s = SPACES[cur.pos];
  const extras = [
    g.pot ? `<span>${ic("coffee")} Cagnotte ${money(g.pot)}</span>` : "",
    EM.inflation(g) > 1 ? `<span>${ic("trending-up")} Loyers +${Math.round((EM.inflation(g) - 1) * 100)} %</span>` : "",
    EM.activeMods(g).length ? `<span style="color:var(--gold)">${ic("sparkles")} ${EM.activeMods(g).length} événement(s) en cours</span>` : "",
  ].join("");
  const mini = extras ? `<div class="em-mini">${extras}</div>` : "";

  if (g.stage === "auction") {
    const a = g.auction;
    const left = Math.max(0, (a.endsAt - (Date.now() + S.clockOffset)) / 1000);
    const leader = a.bidder ? EM.P(g, a.bidder) : null;
    const bidBtn = (inc) => p && !p.bankrupt && p.cash >= a.bid + inc ? `<button class="secondary" onclick="A.bid(${a.bid + inc})">+${inc}</button>` : "";
    return `
      <div class="status btn-ic">${ic("gavel")} Enchères : <b>${esc(SPACES[a.space].name)}</b></div>
      <div class="em-bid">${money(a.bid)}</div>
      <div class="em-mini">${leader ? `Meilleure offre : <b style="color:${leader.color}">${esc(leader.name)}</b>` : "Aucune offre"} · prix ${money(EM.price(g, a.space))}</div>
      <div class="em-timer"><div style="width:${Math.min(100, (left / 8) * 100)}%"></div></div>
      <div class="row">${bidBtn(10)}${bidBtn(50)}${bidBtn(100)}</div>`;
  }

  const dice = diceView();
  let body;
  if (Anim.rolling()) body = `<div class="status">${esc(cur.name)} lance les dés…</div>`;
  else if (!mine) {
    const what = g.stage === "debt" ? "cherche de l'argent" : g.stage === "buy" ? `hésite à acheter ${esc(plain(s.name))}` : "joue";
    body = `<div class="status"><b style="color:${cur.color}">${esc(cur.name)}</b> ${what}…</div>`;
  } else if (g.stage === "debt") {
    body = `<div class="status">Tu dois payer <b>${money(g.debt.amount)}</b> (tu as ${money(p.cash)}).</div>
      <div class="em-mini">Revends constructions ou propriétés dans « Mes villes ».</div>
      <div class="row"><button onclick="A.do('payDebt')" ${p.cash >= g.debt.amount ? "" : "disabled"}>Payer</button>
      <button class="danger" onclick="A.bankrupt()">Faillite</button></div>`;
  } else if (g.stage === "buy") {
    const cost = EM.price(g, cur.pos);
    return `
      <div class="em-deed"><div class="hd" style="background:${spaceColor(s)}">${esc(plain(s.name))}</div>
        <div class="bd">${esc(kindName(s))}<br><b>${money(cost)}</b>${cost !== s.price ? ` <s>${s.price} €</s>` : ""}</div></div>
      <div class="row"><button onclick="A.do('buy')" ${p.cash >= cost ? "" : "disabled"}>Acheter</button>
        <button class="secondary" onclick="A.do('auction')">Enchères</button></div>
      ${feed}`;
  } else if (g.stage === "roll") {
    body = `${p.jail ? `<div class="status btn-ic">${ic("lock")} En prison (essai ${p.jail}/3)</div>` : ""}
      <button class="btn-ic" onclick="A.do('roll')">${ic("dices")} Lancer les dés</button>
      ${p.jail && (p.cash >= EM.JAIL_FEE || p.jailCards) ? `<div class="row">
        ${p.cash >= EM.JAIL_FEE ? `<button class="secondary" onclick="A.do('jailPay')">Payer ${EM.JAIL_FEE} €</button>` : ""}
        ${p.jailCards ? `<button class="secondary" onclick="A.do('jailCard')">Caution</button>` : ""}</div>` : ""}`;
  } else {
    body = `<button onclick="A.do('endTurn')">Finir mon tour</button><div class="em-mini">Construis ou échange avant de finir.</div>`;
  }
  return `${dice}${body}${mini}${feed}`;
}

// ---------- Panneaux ----------

function playersPanel() {
  const g = S.game;
  const cur = EM.current(g);
  return g.players.map((p) => `
    <div class="em-pl ${p.id === cur.id ? "turn" : ""} ${p.bankrupt ? "out" : ""}" style="--pc:${p.color}" data-chip="${p.id}">
      ${avatarImg(p)}
      <span class="tx"><b>${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</b>
        <small>${p.bankrupt ? "Faillite" : `${EM.rank(g, p).name}${p.jail ? " · en prison" : ""}${p.bot ? " · robot" : ""}`}</small></span>
      <span class="cash">${money(p.cash)}</span>
    </div>`).join("");
}

function eventsPanel() {
  const g = S.game;
  const mods = EM.activeMods(g);
  if (!g.settings.events) return "";
  return `<div class="em-h">${ic("sparkles")} Événements</div>${mods.length
    ? mods.map((m) => `<div class="em-event-chip"><b>${esc(m.title)}</b><br>jusqu'au tour ${m.until}</div>`).join("")
    : `<div class="em-mini" style="justify-content:flex-start">Rien en cours.</div>`}`;
}

function myPropsView() {
  const g = S.game;
  const p = me();
  if (!p || p.bankrupt) return `<p class="muted">Tu ne joues plus dans cette partie.</p>`;
  const props = EM.owned(g, p.id).sort((a, b) => a - b);
  const mine = EM.current(g).id === p.id;
  const canAct = (mine && ["roll", "done"].includes(g.stage)) || g.debt?.pid === p.id;
  const canBuildNow = mine && ["roll", "done"].includes(g.stage);
  if (!props.length) return `<p class="muted" style="font-size:.85rem">Aucune propriété pour l'instant.</p>`;
  return `<ul class="em-list">${props.map((i) => {
    const s = SPACES[i];
    const lvl = EM.level(g, i);
    const full = s.type === "prop" && EM.ownsGroup(g, p.id, s.group);
    return `<li>
      <span class="sw" style="background:${spaceColor(s)}"></span>
      <span class="tx" onclick="A.select(${i})"><b>${esc(plain(s.name))}</b>
        <small>${lvl ? LEVELS[lvl] : full ? "Département complet" : s.type === "rer" ? "Gare" : s.type === "util" ? "Service" : "Terrain"} · loyer ${money(EM.rent(g, i))}</small></span>
      ${canBuildNow && EM.canBuild(g, p.id, i) && p.cash >= s.build ? `<button class="icon" title="Construire (${s.build} €)" onclick="A.do('build', {space: ${i}})">${ic("hammer")}</button>` : ""}
      ${canAct && lvl ? `<button class="icon secondary" title="Revendre une construction" onclick="A.do('sellLevel', {space: ${i}})">${ic("house")}</button>` : ""}
      ${canAct && !lvl ? `<button class="icon secondary" title="Revendre à la banque" onclick="A.sellProp(${i})">${ic("wallet")}</button>` : ""}
    </li>`;
  }).join("")}</ul>
  <p class="muted" style="font-size:.72rem">Marteau : construire · maison : revendre une construction · porte-monnaie : revendre à la banque (moitié prix).</p>`;
}

const logView = () => `<div class="em-log">${S.game.log.slice(-20).reverse().map((l) => `<div>${esc(l)}</div>`).join("")}</div>`;

// ---------- Échanges ----------

function propTile(i, onclick = "", on = false) {
  const s = SPACES[i];
  return `<button class="em-ptile ${on ? "on" : ""}" ${onclick ? `onclick="${onclick}"` : "disabled"}>
    <span class="bd" style="background:${spaceColor(s)}">${ic(s.icon)}</span>
    <span class="nm">${esc(plain(s.short || s.name))}</span><span class="pr">${s.price} €</span></button>`;
}

function tradeSideView(o) {
  const parts = o.props.map((i) => propTile(i)).join("");
  return `<div class="em-tiles">${parts}${o.cash ? `<span class="em-cashpill">${ic("wallet")} ${money(o.cash)}</span>` : ""}${!parts && !o.cash ? `<span class="muted">rien</span>` : ""}</div>`;
}

function tradeLiveView() {
  const g = S.game;
  const t = g.trade;
  if (!t) return "";
  const from = EM.P(g, t.from);
  const to = EM.P(g, t.to);
  const who = (p) => `<b style="color:${p.color}">${esc(p.id === S.me ? "Toi" : p.name)}</b>`;
  const actions = t.to === S.me
    ? `<div class="row"><button onclick="A.do('respond', {accept: true})">Accepter</button><button class="secondary" onclick="A.do('respond', {accept: false})">Refuser</button></div>`
    : t.from === S.me
      ? `<button class="secondary" onclick="A.do('cancelTrade')">Annuler ma proposition</button>`
      : `<div class="em-mini">En attente de ${esc(to.name)}…</div>`;
  return `<div class="em-trade-live ${t.to === S.me ? "for-me" : ""}">
    <div class="hd">${ic("arrow-left-right")} ${who(from)} → ${who(to)}</div>
    <div class="em-trade-cols"><div><small>${who(from)} donne</small>${tradeSideView(t.give)}</div><div><small>${who(to)} donne</small>${tradeSideView(t.get)}</div></div>
    ${actions}</div>`;
}

const tradeValue = (props, cash) => props.reduce((s, i) => s + SPACES[i].price, 0) + (cash || 0);

function tradeSummary() {
  const d = S.trade;
  const give = tradeValue(d.give, d.giveCash);
  const get = tradeValue(d.get, d.getCash);
  const diff = get - give;
  return `Tu donnes <b>${money(give)}</b> · tu reçois <b>${money(get)}</b> <span class="${diff >= 0 ? "plus" : "minus"}">(${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))})</span>`;
}

function cashControl(list, max) {
  const v = Math.min(S.trade[list + "Cash"] || 0, max);
  return `<div class="em-cash">
    <div class="row" style="align-items:center">
      <button class="icon secondary" onclick="A.tradeCash('${list}', -50)">${ic("minus")}</button>
      <span class="v" id="cash-${list}">${money(v)}</span>
      <button class="icon secondary" onclick="A.tradeCash('${list}', 50)">${ic("plus")}</button>
    </div>
    <input id="range-${list}" type="range" min="0" max="${max}" step="10" value="${v}" oninput="A.tradeCash('${list}', 0, +this.value)">
  </div>`;
}

function tradeComposer() {
  const g = S.game;
  if (g.trade) return tradeLiveView();
  if (!me() || me().bankrupt) return `<p class="muted">Tu ne joues plus dans cette partie.</p>`;
  if (g.stage === "auction" || g.stage === "end") return `<p class="muted">Pas d'échange pendant les enchères.</p>`;
  const d = S.trade;
  const others = EM.active(g).filter((p) => p.id !== S.me);
  const tradable = (pid) => EM.owned(g, pid).filter((i) => !(SPACES[i].type === "prop" && EM.groupSpaces(SPACES[i].group).some((j) => EM.level(g, j))));
  const tiles = (ids, list) => ids.length
    ? `<div class="em-tiles">${ids.map((i) => propTile(i, `A.tradeToggle('${list}', ${i})`, d[list].includes(i))).join("")}</div>`
    : `<p class="muted" style="font-size:.8rem">Aucune propriété échangeable.</p>`;
  const partner = d.to && EM.P(g, d.to);
  return `
    <div class="em-h">1. Avec qui ?</div>
    <div class="em-strip">${others.map((p) => `
      <button class="em-pl ${d.to === p.id ? "turn" : ""}" style="--pc:${p.color};margin:0;width:auto" onclick="A.tradeWith('${p.id}')">${avatarImg(p)}<span class="tx"><b>${esc(p.name)}</b></span></button>`).join("")}</div>
    ${partner ? `
      <div class="em-h">2. Tu donnes</div>${tiles(tradable(S.me), "give")}${cashControl("give", me().cash)}
      <div class="em-h">3. Tu demandes à ${esc(partner.name)}</div>${tiles(tradable(partner.id), "get")}${cashControl("get", partner.cash)}
      <div class="em-trade-sum" id="trade-sum">${tradeSummary()}</div>
      <button class="btn-ic" onclick="A.propose()">${ic("handshake")} Proposer l'échange</button>` : ""}`;
}

// ---------- Fenêtres ----------

function spaceSheet(i) {
  const g = S.game;
  const s = SPACES[i];
  const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
  const info = CITY_INFO[s.name];
  let rows;
  if (s.type === "prop") {
    rows = `<tr><td>Loyer</td><td>${s.rent} €</td></tr><tr><td>Département complet</td><td>${s.rent * 2} €</td></tr>
      ${LEVELS.slice(1).map((l, k) => `<tr><td>${l}</td><td>${s.rent * LEVEL_MULT[k + 1]} €</td></tr>`).join("")}
      <tr><td>Prix d'une construction</td><td>${s.build} €</td></tr>`;
  } else if (s.type === "rer") {
    rows = [1, 2, 3, 4].map((n) => `<tr><td>${n} gare${n > 1 ? "s" : ""} possédée${n > 1 ? "s" : ""}</td><td>${25 * 2 ** (n - 1)} €</td></tr>`).join("");
  } else if (s.type === "util") {
    rows = `<tr><td>1 service possédé</td><td>4 × les dés</td></tr><tr><td>2 services possédés</td><td>10 × les dés</td></tr>`;
  } else {
    const txt = {
      start: `Touche ${START_BONUS} € à chaque passage.`,
      jail: `Prison de Fleury : sors avec un double, en payant ${EM.JAIL_FEE} € ou avec une carte « Libéré sous caution ». En simple visite, rien ne se passe.`,
      pause: "Celui qui s'arrête ici rafle la cagnotte.",
      control: "Garde à vue : direction la prison !",
      event: s.deck === "potes" ? "Tire une carte « Les potes » : les galères (et les bons plans) de la bande." : "Tire une carte Chance : bonne ou mauvaise surprise.",
      tax: `Paye ${s.amount} € à la cagnotte.`,
    }[s.type];
    rows = `<tr><td colspan="2" style="text-align:left;font-weight:400">${txt}</td></tr>`;
  }
  return `
    <div class="deed-hd" style="background:${spaceColor(s)}">
      <small>${esc(kindName(s))}${info ? ` · ${info[0]}` : ""}</small>
      <h2>${esc(plain(s.name))}</h2>${s.price ? `<b>${money(EM.price(g, i))}</b>` : ""}
    </div>
    <table>${rows}</table>
    ${owner ? `<p>Propriétaire : <b style="color:${owner.color}">${esc(owner.name)}</b>${EM.level(g, i) ? ` · ${LEVELS[EM.level(g, i)]}` : ""} · loyer actuel <b>${money(EM.rent(g, i))}</b></p>` : s.price ? `<p class="muted">Libre : à vendre.</p>` : ""}`;
}

function sheetView() {
  if (!S.sheet) return "";
  const titles = { players: "Joueurs", props: "Mes villes", trade: "Échanges", log: "Journal" };
  const body = {
    space: () => spaceSheet(S.sel),
    players: () => playersPanel() + eventsPanel(),
    props: myPropsView,
    trade: () => (S.game.trade ? tradeLiveView() : tradeComposer()),
    log: logView,
  }[S.sheet]();
  return `<div class="em-sheet-bg" onclick="if(event.target===this)A.closeSheet()"><div class="em-sheet">
    ${titles[S.sheet] ? `<div class="em-row" style="justify-content:space-between;margin-bottom:8px"><b>${titles[S.sheet]}</b>
      <button class="icon ghost" onclick="A.closeSheet()">${ic("x")}</button></div>` : ""}
    ${body}
    ${S.sheet === "space" ? `<button class="secondary" onclick="A.closeSheet()">Fermer</button>` : ""}
  </div></div>`;
}

// ---------- Partie ----------

function gameView(warn) {
  const g = S.game;
  const round = g.stage === "end" ? "Partie terminée" : g.settings.mode === "tours" ? `Tour ${g.round}/${g.settings.maxRounds}` : `Tour ${g.round}`;
  const tradeBadge = g.trade && (g.trade.to === S.me || g.trade.from === S.me) ? `<span class="dot"></span>` : "";
  return `
    <div class="em-app">
      <aside class="em-side">
        <div class="em-title" style="margin:0;font-size:1.15rem"><img class="logo" src="logo.svg" alt="">Empire IDF</div>
        <div class="em-topline"><span>${round}</span><span>Salon <b>${esc(S.code)}</b></span></div>
        ${warn}
        <div class="em-h">${ic("users")} Joueurs</div>
        ${playersPanel()}
        ${eventsPanel()}
        <div class="em-h">${ic("scroll-text")} Journal</div>
        ${logView()}
        <div style="margin-top:auto">
          <button class="secondary btn-ic" onclick="A.share()">${ic("share-2")} Inviter</button>
          ${leaveButton()}
        </div>
      </aside>

      <div class="em-mobile-top">
        <div class="em-topline"><span><b>Empire IDF</b> · ${round}</span>
          <button class="icon ghost" style="margin:0" onclick="A.leave()">${ic("log-out")}</button></div>
        ${warn}
        <div class="em-strip">${g.players.map((p) => `
          <div class="em-pl ${p.id === EM.current(g).id ? "turn" : ""} ${p.bankrupt ? "out" : ""}" style="--pc:${p.color}" data-chip-m="${p.id}">
            ${avatarImg(p)}<span class="tx"><b>${esc(p.name)}</b><span class="cash">${money(p.cash)}</span></span></div>`).join("")}</div>
      </div>

      <section class="em-mid">${boardView()}</section>

      <aside class="em-side">
        <div class="em-h">${ic("arrow-left-right")} Échanges</div>
        ${g.trade ? tradeLiveView() : me() && !me().bankrupt && g.stage !== "end" ? `<button class="secondary btn-ic" onclick="A.openSheet('trade')">${ic("handshake")} Proposer un échange</button>` : ""}
        <div class="em-h">${ic("building-2")} Mes villes</div>
        ${myPropsView()}
      </aside>

      <nav class="em-tabbar">
        <button onclick="A.openSheet('players')">${ic("users")}Joueurs</button>
        <button onclick="A.openSheet('props')">${ic("building-2")}Mes villes</button>
        <button onclick="A.openSheet('trade')">${ic("arrow-left-right")}Échanges${tradeBadge}</button>
        <button onclick="A.openSheet('log')">${ic("scroll-text")}Journal</button>
      </nav>
    </div>
    ${sheetView()}`;
}

// ---------- Animations et effets ----------
const Anim = (() => {
  const st = {
    rollId: null, cardId: null, eventId: null, rollingUntil: 0, landedUntil: 0, faces: [5, 2],
    shown: {}, cash: {}, jail: {}, owners: null, levels: null, groups: null, rank: null, bought: {}, turnKey: null, tradeKey: undefined, mover: null, roller: null,
  };
  const ROLL_MS = 500;
  const rolling = () => Date.now() < st.rollingUntil;
  const justLanded = () => Date.now() < st.landedUntil;
  const diceFaces = () => st.faces;
  const justBought = (i) => Date.now() - (st.bought[i] || 0) < 1100;
  const busy = () => rolling() || !!st.mover || popQueue.length > 0 || popOpen;

  // Centre d'une case en % du plateau (coins 1,45 fois plus grands).
  function center(i) {
    const [row, col] = cellPos(i);
    const inner = N - 2; // cases entre deux coins
    const at = (k) => (k === 1 ? 0.725 : k === N ? 1.45 + inner + 0.725 : 1.45 + (k - 2) + 0.5) / (2.9 + inner) * 100;
    return [at(col), at(row)];
  }

  function pawnStyle(p) {
    const g = S.game;
    const pos = st.shown[p.id] ?? p.pos;
    const here = g.players.filter((q) => !q.bankrupt && (st.shown[q.id] ?? q.pos) === pos);
    const k = here.findIndex((q) => q.id === p.id);
    const off = here.length > 1 ? [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4], [0, 1.4]][k % 6] : [0, 0];
    const [x, y] = center(pos);
    return `left:calc(${x}% + ${off[0] * 1.6}%);top:calc(${y}% + ${off[1] * 1.6}%)`;
  }

  function placePawns() {
    for (const p of S.game.players) {
      const el = document.getElementById("pawn-" + p.id);
      if (el) el.setAttribute("style", `--pc:${p.color};${pawnStyle(p)}`);
    }
  }

  function stepPawns() {
    const g = S.game;
    if (!g) return;
    let moving = false;
    for (const p of g.players) {
      if (p.bankrupt || st.shown[p.id] === undefined || st.shown[p.id] === p.pos) continue;
      const dist = (p.pos - st.shown[p.id] + SPACES.length) % SPACES.length;
      st.shown[p.id] = dist <= 12 ? (st.shown[p.id] + 1) % SPACES.length : p.pos;
      moving = true;
      const el = document.getElementById("pawn-" + p.id);
      if (el) {
        el.classList.remove("hop");
        void el.offsetWidth;
        el.classList.add("hop");
      }
      if (st.shown[p.id] === p.pos && p.id === S.me) landed(p.pos);
    }
    placePawns();
    if (!moving) {
      clearInterval(st.mover);
      st.mover = null;
      nextPop();
    }
  }

  function startMoving() {
    if (!st.mover) {
      st.mover = setInterval(stepPawns, 130);
      stepPawns();
    }
  }

  function rollDice(final) {
    st.rollingUntil = Date.now() + ROLL_MS;
    startMoving();
    clearInterval(st.roller);
    st.roller = setInterval(() => {
      st.faces = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      const el = document.getElementById("dice");
      if (el) el.outerHTML = diceView();
      if (!rolling()) {
        clearInterval(st.roller);
        st.faces = final;
        st.landedUntil = Date.now() + 400;
        render();
      }
    }, 80);
  }

  // File de fenêtres (arrivée sur une ville, événement, carte, prison) : une à la fois.
  const popQueue = [];
  let popOpen = false;
  function queuePop(html, cls, ms = 3200) {
    popQueue.push({ html, cls, ms });
    if (!st.mover) nextPop();
  }
  function nextPop() {
    if (popOpen || !popQueue.length) return;
    const { html, cls, ms } = popQueue.shift();
    popOpen = true;
    const el = document.createElement("div");
    el.className = "em-pop " + cls;
    el.innerHTML = html;
    const close = () => {
      if (!el.isConnected) return;
      el.remove();
      popOpen = false;
      nextPop();
    };
    el.onclick = close;
    document.body.appendChild(el);
    window.lucide?.createIcons();
    setTimeout(close, ms);
  }
  const kickerPop = (icon, kicker, title, text, cls) =>
    queuePop(`<div class="kicker">${ic(icon)}<div class="k">${kicker}</div></div><div class="t">${esc(title)}</div><div class="bd">${esc(text)}</div>`, cls);

  // Photo de la ville (résumé Wikipédia), gardée en mémoire sur le téléphone.
  async function photo(title) {
    const key = "em-photo-" + title;
    const cached = localStorage.getItem(key);
    if (cached !== null) return cached;
    try {
      const r = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
      const d = await r.json();
      const url = d.thumbnail?.source || "";
      localStorage.setItem(key, url);
      return url;
    } catch {
      return "";
    }
  }

  // Quand MON pion s'arrête sur une ville, une gare ou un service : fiche avec photo et code
  // postal. Si elle est à vendre, on l'achète (ou on lance les enchères) directement depuis la fiche.
  async function landed(i) {
    const s = SPACES[i];
    if (!["prop", "rer", "util"].includes(s.type)) return;
    const g = S.game;
    const info = CITY_INFO[s.name] || ["", ""];
    const owner = g.owners[i] !== undefined ? EM.P(g, g.owners[i]) : null;
    const url = info[1] ? await photo(info[1]) : ""; // la photo d'abord : la fiche peut attendre son tour dans la file
    const p = me();
    const forSale = !owner && S.game.stage === "buy" && EM.current(S.game).id === S.me;
    const cost = EM.price(g, i);
    queuePop(`
      ${info[0] ? `<div class="ph" style="${url ? `background-image:url('${url.replace(/'/g, "%27")}')` : ""}"><span class="cp">${info[0]}</span></div>` : ""}
      <div class="band" style="background:${spaceColor(s)}"><small>${esc(kindName(s))}</small><h3>${esc(plain(s.name))}</h3></div>
      <div class="bd">${owner ? (owner.id === S.me ? "Chez toi !" : `Propriété de <b style="color:${owner.color}">${esc(owner.name)}</b> · loyer <b>${money(EM.rent(g, i))}</b>`) : `À vendre : <b>${money(cost)}</b>`}</div>
      ${forSale ? `<div class="acts"><button onclick="A.do('buy')" ${p.cash >= cost ? "" : "disabled"}>Acheter ${money(cost)}</button>
        <button class="secondary" onclick="A.do('auction')">Enchères</button></div>` : ""}
      ${url ? `<div class="credit">Photo : Wikipédia</div>` : ""}`, forSale ? "buy" : "", forSale ? 12000 : 3000);
  }

  function floatMoney(pid, diff) {
    const chip = document.querySelector(`[data-chip="${pid}"]`)?.offsetParent ? document.querySelector(`[data-chip="${pid}"]`) : document.querySelector(`[data-chip-m="${pid}"]`);
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

  function banner(text, icon = "sparkles") {
    const el = document.createElement("div");
    el.className = "em-banner";
    el.innerHTML = `${ic(icon)} ${esc(text)}`;
    document.body.appendChild(el);
    window.lucide?.createIcons();
    setTimeout(() => el.remove(), 1800);
  }

  function confetti(n = 50) {
    const colors = ["#f2c14e", "#34c88a", "#4f8cff", "#ff6b6b", "#c084fc", "#fb923c"];
    for (let k = 0; k < n; k++) {
      const el = document.createElement("div");
      el.className = "confetti";
      el.style.left = Math.random() * 100 + "vw";
      el.style.background = colors[k % colors.length];
      el.style.animationDuration = 1.2 + Math.random() * 1.2 + "s";
      el.style.animationDelay = Math.random() * 0.3 + "s";
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2800);
    }
  }

  const fullGroups = (g, pid) => GROUPS.map((_, k) => k).filter((k) => EM.ownsGroup(g, pid, k));

  // Après chaque rendu : repère ce qui a changé et joue les effets correspondants.
  function afterRender() {
    const g = S.game;
    const first = st.owners === null;
    // Fiche d'achat ouverte alors que l'achat est réglé (acheté, enchères…) : on la ferme.
    if (g.stage !== "buy") document.querySelector(".em-pop.buy")?.click();
    if (g.rollId && g.rollId !== st.rollId) {
      if (st.rollId !== null) rollDice(g.dice);
      else st.faces = g.dice;
      st.rollId = g.rollId;
    }
    if (g.card && g.card.id !== st.cardId) {
      if (!first) kickerPop(g.card.deck === "potes" ? "users" : "sparkles", g.card.deck === "potes" ? "CARTE LES POTES" : "CARTE CHANCE", EM.P(g, g.card.pid)?.name || "", g.card.text, g.card.good ? "good" : "bad");
      st.cardId = g.card.id;
    }
    if (g.event && g.event.id !== st.eventId) {
      if (!first) kickerPop("siren", "ÇA BOUGE EN ÎLE-DE-FRANCE", g.event.title, g.event.text, g.event.good ? "good" : "bad");
      st.eventId = g.event.id;
    }
    for (const p of g.players) {
      if (st.shown[p.id] === undefined) st.shown[p.id] = p.pos;
      if (!first && st.cash[p.id] !== undefined && st.cash[p.id] !== p.cash) floatMoney(p.id, p.cash - st.cash[p.id]);
      st.cash[p.id] = p.cash;
      // Prison : qui t'envoie, qui t'en sort.
      const wasIn = !!st.jail[p.id];
      if (!first && !wasIn && p.jail) {
        kickerPop("lock", "PRISON DE FLEURY", `${JAILERS[(g.rollId || 0) % JAILERS.length]} envoie ${p.name} en prison !`, "Fais un double, paye ou sors ta carte « Libéré sous caution ».", "bad");
      } else if (!first && wasIn && !p.jail && !p.bankrupt) {
        kickerPop("lock-open", "LIBÉRÉ !", `${LIBERATOR} fait sortir ${p.name} de prison !`, "Retour dans les rues d'Île-de-France.", "good");
      }
      st.jail[p.id] = p.jail;
    }
    // Célébrations : achats, départements complets, constructions, rang.
    const mine = me();
    if (!first) {
      for (const i of Object.keys(g.owners)) if (st.owners[i] !== g.owners[i]) st.bought[i] = Date.now();
      for (const p of g.players) {
        const now = fullGroups(g, p.id);
        const before = st.groups[p.id] || [];
        for (const k of now.filter((k) => !before.includes(k))) {
          if (p.id === S.me) {
            confetti();
            banner(`Département complet : ${GROUPS[k].name} !`, "crown");
          } else banner(`${p.name} possède tout le ${GROUPS[k].name}`, "crown");
        }
      }
      if (mine) {
        const levels = EM.owned(g, mine.id).reduce((s, i) => s + EM.level(g, i), 0);
        if (levels > st.levels) {
          const built = EM.owned(g, mine.id).find((i) => EM.level(g, i) && EM.level(g, i) > (st.levelMap[i] || 0));
          confetti(25);
          banner(built !== undefined ? `${LEVELS[EM.level(g, built)]} construite à ${plain(SPACES[built].name)} !` : "Nouvelle construction !", "hammer");
        }
        const r = EM.rank(g, mine).level;
        if (st.rank !== null && r > st.rank) {
          confetti(70);
          banner(`Tu deviens ${EM.rank(g, mine).name} !`, "trending-up");
        }
      }
    }
    st.owners = { ...g.owners };
    st.groups = Object.fromEntries(g.players.map((p) => [p.id, fullGroups(g, p.id)]));
    st.levelMap = { ...g.levels };
    if (mine) {
      st.levels = EM.owned(g, mine.id).reduce((s, i) => s + EM.level(g, i), 0);
      st.rank = EM.rank(g, mine).level;
    }

    const turnKey = `${g.round}-${g.turn}`;
    if (turnKey !== st.turnKey) {
      if (st.turnKey && EM.current(g).id === S.me && g.stage === "roll") banner("À toi de jouer !", "dices");
      st.turnKey = turnKey;
    }
    const tradeKey = g.trade ? JSON.stringify(g.trade) : null;
    if (tradeKey !== st.tradeKey) {
      if (st.tradeKey !== undefined && g.trade?.to === S.me) banner("Nouvelle proposition d'échange !", "handshake");
      st.tradeKey = tradeKey;
    }
    if (g.players.some((p) => !p.bankrupt && st.shown[p.id] !== p.pos)) startMoving();
    else nextPop();
  }

  function reset() {
    Object.assign(st, { rollId: null, cardId: null, eventId: null, shown: {}, cash: {}, jail: {}, owners: null, levels: null, groups: null, rank: null, bought: {}, turnKey: null });
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
    if (confirm(`Revendre ${plain(SPACES[i].name)} à la banque pour ${SPACES[i].price / 2} € ?`)) A.do("sellProp", { space: i });
  },
  select(i) {
    S.sel = i;
    S.sheet = i === null ? null : "space";
    render();
  },
  openSheet(name) {
    S.sheet = name;
    render();
  },
  closeSheet() {
    S.sheet = null;
    S.sel = null;
    render();
  },
  pickAvatar(a) {
    S.avatar = a;
    localStorage.setItem("em-avatar", a);
    if (S.mode === "host") {
      S.avatars[S.me] = a;
      act();
    } else {
      room?.send("pick", { pid: S.me, avatar: a });
      render();
    }
  },
  toggleEvents() {
    S.settings = { ...S.settings, events: !S.settings.events };
    act();
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
  // Argent de l'échange : +/− ou curseur, sans tout redessiner pour garder le curseur fluide.
  tradeCash(list, delta, value) {
    const max = list === "give" ? me().cash : EM.P(S.game, S.trade.to).cash;
    const v = Math.max(0, Math.min(max, value ?? (S.trade[list + "Cash"] || 0) + delta));
    S.trade[list + "Cash"] = v;
    const label = document.getElementById("cash-" + list);
    const range = document.getElementById("range-" + list);
    const sum = document.getElementById("trade-sum");
    if (label) label.textContent = money(v);
    if (range && value === undefined) range.value = v;
    if (sum) sum.innerHTML = tradeSummary();
  },
  propose() {
    const t = S.trade;
    const offer = { to: t.to, give: { props: t.give, cash: t.giveCash || 0 }, get: { props: t.get, cash: t.getCash || 0 } };
    if (!EM.tradeValid(S.game, { from: S.me, ...offer })) return toast("Échange impossible : vérifie les villes et l'argent.");
    A.do("propose", offer);
    S.trade = { to: null, give: [], get: [], giveCash: 0, getCash: 0 };
    S.sheet = null;
  },
  addBot() {
    if (allPlayers().length >= 6) return;
    const used = S.bots.map((b) => b.name);
    const name = BOT_NAMES.find((n) => !used.includes(n)) || "Robot";
    const avatar = AVATARS.filter((a) => !Object.values(S.avatars).includes(a) && !S.bots.some((b) => b.avatar === a))[0] || AVATARS[0];
    S.bots.push({ id: "bot-" + Math.random().toString(36).slice(2, 8), name, bot: true, avatar });
    act();
  },
  removeBot(id) {
    S.bots = S.bots.filter((b) => b.id !== id);
    act();
  },
  setMode(mode, rounds) {
    S.settings = { ...S.settings, mode, maxRounds: rounds || S.settings.maxRounds };
    act();
  },
  start() {
    if (allPlayers().length < 2) return;
    Anim.reset();
    S.game = EM.newGame(allPlayers(), S.settings);
    S.sheet = null;
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
    S.avatars[S.me] = S.avatar;
    const saved = JSON.parse(localStorage.getItem("em-host-v3") || "null");
    if (resume && saved) Object.assign(S, { code: saved.code, game: saved.game, bots: saved.bots || [], settings: saved.settings || S.settings, avatars: saved.avatars || S.avatars });
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
  // force : salon fermé à distance par son créateur (pas de confirmation).
  leave(force) {
    if (!force && S.game && S.mode === "host" && S.game.stage !== "end" && !confirm("Quitter la partie ?")) return;
    if (S.mode === "host") {
      localStorage.removeItem("em-host-v3");
      room?.send("state", { closed: true });
      Common.announceRoom(null);
    }
    room?.leave();
    room = null;
    clearInterval(hostTimer);
    Anim.reset();
    Object.assign(S, { mode: null, code: "", hostId: null, hostGone: false, game: null, lobby: [], bots: [], avatars: {}, error: "", status: "", sheet: null, sel: null });
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
    localStorage.setItem("em-host-v3", JSON.stringify({ code: S.code, game: S.game, bots: S.bots, settings: S.settings, avatars: S.avatars }));
    room?.send("state", { hostId: S.me, game: S.game, lobby: S.lobby, bots: S.bots, settings: S.settings, avatars: S.avatars, now: Date.now() });
    Common.announceRoom({ game: "empire", code: S.code, host: S.name, hostId: S.me, players: S.game ? S.game.players.length : allPlayers().length, status: S.game ? "playing" : "lobby" });
  }
  render();
}

// Annuaire des salons : liste sur l'accueil, et fermeture à distance par le créateur.
Common.watchRooms((rooms) => {
  S.rooms = rooms;
  if (!S.mode) render();
});
Common.onCloseRequest("empire", () => (S.mode === "host" ? { code: S.code, hostId: S.me } : null), () => {
  toast("Salon supprimé.");
  A.leave(true);
});

// L'hôte fait avancer les enchères et joue pour les robots, en attendant la fin des animations.
let hostTimer = null;
function startHostLoop() {
  clearInterval(hostTimer);
  hostTimer = setInterval(() => {
    const g = S.game;
    if (S.mode !== "host" || !g || g.stage === "end") return;
    let changed = EM.tick(g, Date.now());
    if (!Anim.busy() && EM.botStep(g, Date.now())) changed = true;
    if (changed) act();
    else if (g.stage === "auction") render();
  }, 900);
}

// ---------- Réseau ----------

function connect() {
  room = Common.joinRoom("empire-" + S.code, S.me, S.name, {
    events: ["state", "act", "pick"],
    message(event, payload) {
      if (event === "state" && S.mode === "player" && payload.closed) {
        toast("L'hôte a fermé le salon.");
        return A.leave(true);
      }
      if (event === "state" && S.mode === "player") {
        const firstContact = !S.hostId;
        Object.assign(S, {
          hostId: payload.hostId, hostGone: false, game: payload.game, lobby: payload.lobby, bots: payload.bots,
          settings: payload.settings, avatars: payload.avatars || {}, clockOffset: payload.now - Date.now(),
        });
        if (!payload.game) Anim.reset();
        if (firstContact || (!payload.game && payload.avatars?.[S.me] !== S.avatar)) room.send("pick", { pid: S.me, avatar: S.avatar });
        render();
      }
      if (S.mode !== "host") return;
      if (event === "pick" && !S.game) {
        S.avatars[payload.pid] = payload.avatar;
        act();
      }
      if (event === "act" && S.game) act((g) => EM.act(g, payload.pid, payload.type, payload.data, Date.now()));
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

setInterval(() => {
  if (S.mode === "player" && S.game?.stage === "auction") render();
}, 1000);

render();
