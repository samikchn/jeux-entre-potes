// Interface du Loup-Garou.
// - mode "local"  : un seul téléphone pour distribuer les rôles, avec une fiche pour un narrateur.
// - mode "host"   : l'hôte joue aussi, son téléphone fait tourner la partie et la diffuse.
// - mode "player" : reçoit l'état de l'hôte et lui envoie ses actions de nuit.

const { esc, toast, avatar } = Common;

const S = {
  mode: null,
  me: Common.playerId(),
  name: localStorage.getItem("uc-name") || "",
  code: "",
  hostId: null,
  hostGone: false,
  game: null,
  lobby: [],
  comp: {},
  reveal: 0,
  narration: localStorage.getItem("lg-narration") || "voix", // mode local : "voix" ou "humain"
  narratorOpen: false,
  showRole: false,
  sel: [], // sélection multiple (Cupidon, Joueur de flûte)
  witch: { heal: null, kill: null },
  status: "",
  error: "",
};

let room = null;

// Ordre d'affichage des rôles dans la composition et dans la fiche du narrateur.
const ROLE_ORDER = [
  "loup", "grandloup", "infect", "loupblanc",
  "voyante", "sorciere", "chasseur", "cupidon", "garde", "renard", "montreur",
  "ancien", "idiot", "corbeau", "chevalier", "enfant",
  "pyromane", "flute",
];

const NIGHT_SCRIPT = [
  ["cupidon", "1re nuit : Cupidon désigne deux amoureux, qui se reconnaissent ensuite."],
  ["enfant", "1re nuit : l'Enfant sauvage choisit son modèle."],
  ["garde", "Le Garde protège un joueur (pas le même que la veille)."],
  ["voyante", "La Voyante désigne un joueur et découvre son rôle."],
  ["renard", "Le Renard flaire un joueur et ses voisins."],
  ["corbeau", "Le Corbeau peut désigner un joueur (+2 voix au vote)."],
  ["loup", "Les loups-garous choisissent leur victime."],
  ["grandloup", "Le Grand méchant loup choisit une 2e victime (si aucun loup n'est mort)."],
  ["infect", "L'Infect père des loups peut infecter la victime (une fois)."],
  ["loupblanc", "Une nuit sur deux, le Loup blanc peut tuer un loup."],
  ["sorciere", "La Sorcière apprend la victime, peut la sauver et/ou empoisonner quelqu'un."],
  ["pyromane", "Le Pyromane asperge un joueur ou met le feu aux aspergés."],
  ["flute", "Le Joueur de flûte charme deux joueurs."],
];

// ---------- Rendu ----------

function render() {
  const g = S.game;
  const localNight = S.narration === "voix" && S.reveal >= (g?.players.length || 0);
  document.body.classList.toggle("night", g?.phase === "night" && (S.mode !== "local" || localNight));
  const key = [S.mode, g?.phase, g?.night, g?.step, S.reveal, !!g].join("|");
  Common.render(document.getElementById("app"), view(), key);
}

function view() {
  if (!S.mode) return homeView();
  const warn = S.hostGone ? `<div class="alert">⚠️ L'hôte s'est déconnecté. La partie reprendra dès qu'il revient.</div>` : "";
  if (S.mode === "player" && !S.hostId) {
    return card(`<p class="center">Connexion au salon <b>${esc(S.code)}</b>…</p>${S.status ? `<p class="muted center">${esc(S.status)}</p>` : ""}`) + leaveButton();
  }
  if (!S.game) return warn + lobbyView();
  if (S.mode === "local") {
    if (S.reveal < S.game.players.length) return revealView();
    return S.narration === "voix" ? Auto.view() : narratorView();
  }
  if (!me()) return warn + card(`<p class="center">Une partie est en cours dans le salon <b>${esc(S.code)}</b>.<br>Tu joueras à la prochaine !</p>`) + leaveButton();
  const views = { night: nightView, day: dayView, hunter: hunterView, end: endView };
  return warn + views[S.game.phase]();
}

const card = (html, cls = "") => `<div class="card ${cls}">${html}</div>`;
const isAdmin = () => S.mode !== "player";
// Joueur dont on affiche les infos : soi-même en ligne, celui qui a le téléphone en local.
const me = () => S.game && LG.P(S.game, S.mode === "local" ? Auto.viewer() : S.me);
const actorId = () => (S.mode === "local" ? Auto.actor() : S.me);
const leaveButton = () => `<button class="ghost" onclick="A.leave()">Quitter</button>`;
const phase = (label) => `<div class="phase-wrap"><span class="phase">${label}</span></div>`;
const teamTag = (role) => `<span class="tag ${ROLES[role].team}">${ROLES[role].emoji} ${esc(ROLES[role].name)}</span>`;
const pname = (id) => esc(LG.P(S.game, id)?.name);

// Tuiles de joueurs à toucher.
function tiles(players, onclick, selected = [], extra = () => "") {
  if (!players.length) return `<p class="muted center">Personne à choisir.</p>`;
  return `<div class="grid">${players.map((p) => `
    <button class="tile ${selected.includes(p.id) ? "selected" : ""}" onclick="${onclick}('${p.id}')">
      ${avatar(p.name, true)}${esc(p.name)}${extra(p)}
    </button>`).join("")}</div>`;
}

function homeView() {
  const joinCode = new URLSearchParams(location.search).get("salon") || "";
  const saved = JSON.parse(localStorage.getItem("lg-host") || "null");
  return `
    ${card(`
      <div class="mode"><span class="emoji">👥</span>
        <div><h2>Chacun son téléphone</h2><p class="muted">L'app fait le narrateur : chacun agit en secret la nuit sur son écran.</p></div>
      </div>
      ${Common.onlineConfigured() ? `
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
    <a class="card mode" onclick="A.startLocal()">
      <span class="emoji">📱</span>
      <div><h2>Un seul téléphone</h2><p class="muted">On se passe le téléphone : une voix fait le narrateur (avec IA en option), ou un joueur anime avec le script.</p></div>
    </a>
    ${card(`
      <details id="rules">
        <summary><b>📖 Les règles et les rôles</b></summary>
        <p class="muted">La nuit, chacun agit en secret. Le matin, on découvre qui est mort et son rôle. Le jour, le village débat puis vote à main levée pour éliminer un suspect. Les loups gagnent s'il ne reste que des loups, le village s'il n'en reste plus aucun (ni solitaire).</p>
        ${ROLE_ORDER.concat("villageois").map((r) => `<p>${teamTag(r)}<br><span class="muted">${esc(ROLES[r].desc)}</span></p>`).join("")}
      </details>
    `)}
    <p class="center"><a href="../" class="muted">← Tous les jeux</a></p>`;
}

function compositionView() {
  const n = S.lobby.length;
  const c = S.comp;
  const specials = ROLE_ORDER.reduce((s, r) => s + (c[r] || 0), 0);
  const villagers = Math.max(0, n - specials);
  const error = LG.compositionError(n, c);
  if (!isAdmin()) {
    return card(`<h2>Composition</h2><div class="row" style="flex-wrap:wrap;gap:6px">
      ${ROLE_ORDER.filter((r) => c[r]).map((r) => `<span class="tag ${ROLES[r].team}">${ROLES[r].emoji} ${c[r] > 1 ? c[r] + " × " : ""}${esc(ROLES[r].name)}</span>`).join("")}
      ${villagers ? `<span class="tag village">🧑‍🌾 ${villagers} × Villageois</span>` : ""}
    </div>`);
  }
  const groups = ["loups", "village", "solo"].map((team) => `
    <h3 class="team-title ${team}">${TEAM_LABEL[team]}</h3>
    ${ROLE_ORDER.filter((r) => ROLES[r].team === team).map((r) => `
      <div class="stepper ${c[r] ? "on" : ""}">
        <span style="font-size:1.5rem">${ROLES[r].emoji}</span>
        <span class="label">${esc(ROLES[r].name)}<small>${esc(ROLES[r].desc)}</small></span>
        <button class="icon secondary" onclick="A.comp('${r}',-1)" ${c[r] ? "" : "disabled"}>−</button>
        <b>${c[r] || 0}</b>
        <button class="icon secondary" onclick="A.comp('${r}',1)" ${(c[r] || 0) < (ROLES[r].max || 1) && specials < n ? "" : "disabled"}>+</button>
      </div>`).join("")}`).join("");
  return card(`
    <h2>Composition</h2>
    ${presetsView(n)}
    <h3>✏️ Ou réglez chaque rôle</h3>
    ${groups}
    <div class="stepper on"><span style="font-size:1.5rem">🧑‍🌾</span><span class="label">Villageois<small>Complètent automatiquement</small></span><b>${villagers}</b></div>
    ${error && n ? `<p class="error">${esc(error)}</p>` : ""}
  `, "composition");
}

// Compositions toutes prêtes, adaptées au nombre de joueurs.
function presetsView(n) {
  const list = compositionsFor(n);
  if (!list.length) return `<p class="muted">Ajoutez au moins 4 joueurs pour voir les compositions conseillées.</p>`;
  const same = (a, b) => ROLE_ORDER.every((r) => (a[r] || 0) === (b[r] || 0));
  return `
    <h3>✨ Compositions conseillées pour ${n} joueurs</h3>
    <div class="presets">${list.map((p) => `
      <button class="tile preset ${same(p.comp, S.comp) ? "selected" : ""}" onclick="A.preset('${p.id}')">
        <b>${p.emoji} ${p.name}</b>
        <span class="muted">${esc(p.desc)}</span>
        <span class="preset-roles">${ROLE_ORDER.filter((r) => p.comp[r]).map((r) => ROLES[r].emoji.repeat(p.comp[r])).join(" ")}</span>
      </button>`).join("")}
    </div>`;
}

function lobbyView() {
  const n = S.lobby.length;
  const error = LG.compositionError(n, S.comp);
  const startBtn = `<button onclick="A.start()" ${error ? "disabled" : ""}>🌙 Lancer la partie</button>`;
  if (S.mode === "local") {
    return `
      ${card(`
        <h2>Joueurs (${n})</h2>
        <p class="muted">${S.narration === "voix" ? "Tout le monde joue." : "Sans compter le narrateur."} Ajoutez-les dans l'ordre où vous êtes assis.</p>
        <ul class="players">${S.lobby.map((p, i) => `
          <li>${avatar(p.name)}<span class="name">${esc(p.name)}</span>
          <button class="icon ghost" onclick="A.removeLocal(${i})" aria-label="Retirer">✕</button></li>`).join("")}
        </ul>
        <div class="row">
          <input id="newname" placeholder="Prénom" maxlength="20" onkeydown="if(event.key==='Enter')A.addLocal()">
          <button onclick="A.addLocal()">Ajouter</button>
        </div>
      `)}
      ${narrationView()}
      ${compositionView()}
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
      <p class="muted">Asseyez-vous en cercle dans cet ordre : il compte pour le Renard, le Montreur d'ours et le Chevalier.</p>
      <ul class="players">${S.lobby.map((p, i) => `
        <li><span class="num">${i + 1}</span>${avatar(p.name)}<span class="name">${esc(p.name)}${p.id === S.me ? " (toi)" : ""}</span>
        ${p.id === S.hostId ? `<span class="tag host">👑 hôte</span>` : ""}</li>`).join("")}
      </ul>
    `)}
    ${compositionView()}
    ${isAdmin() ? startBtn : `<p class="muted center">En attente du lancement par l'hôte…</p>`}
    ${leaveButton()}`;
}

// Carte à retourner pour voir son rôle.
function roleCard(p, shown, onclick) {
  const r = ROLES[p.role];
  const extra = p.wolf && r.team === "village" ? `<p class="tag loups">🐺 Tu es devenu loup-garou</p>` : "";
  return `
    <div class="flip role-flip ${shown ? "shown" : ""}" onclick="${onclick}">
      <div class="flip-inner">
        <div class="face front"><span class="big-emoji">🌕</span><b>Touche pour voir ton rôle</b><span class="muted">Cache bien l'écran</span></div>
        <div class="face back team-${r.team}">
          <span style="font-size:3rem">${r.emoji}</span>
          <div class="word" style="font-size:1.6rem">${esc(r.name)}</div>
          <span class="tag ${r.team}">${TEAM_LABEL[r.team]}</span>
          ${extra}
          <p class="muted" style="margin:8px 0 0;font-size:.85rem">${esc(r.desc)}</p>
        </div>
      </div>
    </div>`;
}

// Infos secrètes du joueur : meute, amoureux, résultats de pouvoirs…
function secretsView() {
  const g = S.game;
  const p = me();
  const lines = [];
  if (p.wolf) {
    const pack = LG.alive(g).filter((w) => w.wolf && w.id !== p.id);
    lines.push(`🐺 Ta meute : ${pack.length ? pack.map((w) => esc(w.name)).join(", ") : "tu es le dernier loup"}.`);
  }
  if (p.charmed) {
    lines.push(`🎶 Charmés : ${LG.alive(g).filter((c) => c.charmed).map((c) => esc(c.name)).join(", ")}.`);
  }
  if (p.role === "pyromane") {
    const doused = LG.alive(g).filter((d) => d.doused);
    lines.push(`🔥 Aspergés : ${doused.length ? doused.map((d) => esc(d.name)).join(", ") : "personne"}.`);
  }
  if (p.role === "sorciere") lines.push(`🧪 Potions : vie ${g.potions.heal ? "✅" : "❌"} · mort ${g.potions.kill ? "✅" : "❌"}`);
  if (p.role === "idiot" && p.revealed) lines.push("🤪 Tu as été démasqué : tu ne votes plus.");
  if (p.role === "ancien") lines.push(`👴 Vies restantes contre les loups : ${p.lives}`);
  if (g.powersLost && ROLES[p.role].team === "village" && p.role !== "villageois") lines.push("❌ Le village a perdu ses pouvoirs.");
  lines.push(...(g.priv[p.id] || []).map(esc));
  return lines.length ? card(`<h2>🤫 Tes infos secrètes</h2>${lines.map((l) => `<p class="secret">${l}</p>`).join("")}`) : "";
}

function myRole() {
  return roleCard(me(), S.showRole, "A.toggleRole(this)") + secretsView();
}

// Annonce des morts et des événements publics.
function newsView(title) {
  const g = S.game;
  if (!g.deaths.length && !g.news.length) return "";
  const deaths = g.deaths.map(({ id, cause }) => {
    const p = LG.P(g, id);
    return `<li>${avatar(p.name)}<span class="name">${esc(p.name)}<small class="muted" style="display:block;font-weight:400">${LG.CAUSE[cause]}</small></span>${teamTag(p.role)}</li>`;
  }).join("");
  return card(`
    <h2>${title}</h2>
    ${deaths ? `<ul class="players">${deaths}</ul>` : ""}
    ${g.news.map((n) => `<p>${esc(n)}</p>`).join("")}
  `);
}

function seatsView() {
  const g = S.game;
  return card(`
    <details id="seats">
      <summary><b>🪑 Autour de la table</b></summary>
      <ul class="players">${g.seats.map((id, i) => {
        const p = LG.P(g, id);
        return `<li class="${p.alive ? "" : "dead"}"><span class="num">${i + 1}</span>${avatar(p.name)}<span class="name">${esc(p.name)}</span>${p.alive ? "" : teamTag(p.role)}</li>`;
      }).join("")}</ul>
    </details>`);
}

function revealView() {
  const p = S.game.players[S.reveal];
  return `
    ${phase(`Distribution · ${S.reveal + 1} / ${S.game.players.length}`)}
    ${card(`
      <div class="reveal">${avatar(p.name, true)}<p>Passe le téléphone à</p><div class="who">${esc(p.name)}</div></div>
      ${roleCard(p, false, "this.classList.add('shown')")}
      <button class="after-flip" onclick="A.nextReveal()">J'ai retenu, cacher ✓</button>
    `)}
    ${leaveButton()}`;
}

// Choix du narrateur pour le mode un seul téléphone.
function narrationView() {
  const opt = (mode, emoji, title, desc) => `
    <button class="tile ${S.narration === mode ? "selected" : ""}" style="align-items:flex-start;text-align:left" onclick="A.setNarration('${mode}')">
      <b>${emoji} ${title}</b><span class="muted" style="font-weight:400;font-size:.85rem">${desc}</span>
    </button>`;
  const key = Narrator.apiKey();
  return card(`
    <h2>Narrateur</h2>
    <div class="grid">
      ${opt("voix", "🔊", "L'app", "Une voix appelle chaque rôle la nuit. Tout le monde joue.")}
      ${opt("humain", "🧑", "Un joueur", "Il ne joue pas : l'app lui donne les rôles et le script.")}
    </div>
    ${S.narration === "voix" ? `
      <details id="ai">
        <summary><b>🤖 Narration par IA (optionnel)</b></summary>
        <p class="muted">Avec une clé API Claude (console.anthropic.com), l'IA raconte les annonces comme un vrai conteur. Sans clé, la voix lit un texte simple. La clé reste uniquement sur ce téléphone ; chaque annonce coûte une fraction de centime.</p>
        ${key
          ? `<p>✅ Clé enregistrée (…${esc(key.slice(-4))})</p><button class="secondary" onclick="A.forgetAiKey()">Supprimer la clé</button>`
          : `<div class="row"><input id="aikey" type="password" placeholder="sk-ant-…" autocomplete="off"><button onclick="A.saveAiKey()">OK</button></div>`}
      </details>
      <button class="secondary" onclick="A.testVoice()">🔊 Tester la voix</button>
      <p class="muted">Montez le son du téléphone et posez-le au centre de la table. Sur iPhone, désactivez le mode silencieux (bouton sur le côté), sinon la voix reste muette.</p>` : ""}
  `);
}

function narratorView() {
  const g = S.game;
  if (!S.narratorOpen) {
    return `
      ${phase("✅ Distribution terminée")}
      ${card(`
        <div class="center"><div style="font-size:3rem">🤫</div>
        <p>Les rôles sont cachés. Rendez le téléphone au narrateur.</p></div>
        <button onclick="A.openNarrator()">📜 Ouvrir l'espace narrateur</button>
      `)}
      ${leaveButton()}`;
  }
  const present = new Set(g.players.map((p) => p.role));
  const holders = (role) => g.players.filter((p) => p.role === role).map((p) => esc(p.name)).join(", ");
  return `
    ${phase("📜 Fiche du narrateur")}
    ${card(`
      <h2>Les rôles</h2>
      <ul class="players">${g.players.map((p) => `<li>${avatar(p.name)}<span class="name">${esc(p.name)}</span>${teamTag(p.role)}</li>`).join("")}</ul>
    `)}
    ${card(`
      <h2>🌙 Script de la nuit</h2>
      <p class="muted">« Le village s'endort… » puis appelez dans cet ordre :</p>
      <ol class="script">${NIGHT_SCRIPT.filter(([r]) => present.has(r) || (r === "loup" && g.players.some((p) => p.wolf))).map(([r, txt]) =>
        `<li><b>${ROLES[r].emoji} ${esc(ROLES[r].name)}</b> <span class="muted">(${holders(r) || "les loups"})</span><br>${esc(txt)}</li>`).join("")}
      </ol>
      <p class="muted">« Le village se réveille… » : annoncez les morts et révélez leur rôle, puis débat et vote.</p>
    `)}
    <button class="secondary" onclick="A.closeNarrator()">🙈 Cacher les rôles</button>
    <button onclick="A.replay()">🔄 Nouvelle distribution</button>
    ${leaveButton()}`;
}

// ---------- Nuit ----------

function nightView() {
  const g = S.game;
  const p = me();
  const head = phase(`🌙 Nuit ${g.night}`) + newsView("☀️ Résultat du vote");
  if (!p.alive) return head + deadView();

  const mine = LG.tasks(g).filter((t) => t.pid === S.me);
  const todo = mine.find((t) => !(t.key in g.actions)) || mine.find((t) => t.kind === "wolves");
  const body = todo ? taskView(todo) : card(mine.length
    ? `<p class="center">✅ C'est noté. Les autres finissent leur tour…</p>`
    : `<div class="center"><div style="font-size:3rem">😴</div><p>Le village dort… Garde les yeux fermés.</p></div>`);
  return head + body + myRole() + hostNightControls() + leaveButton();
}

function hostNightControls() {
  if (!isAdmin()) return "";
  const waiting = LG.pending(S.game).length;
  return `<p class="muted center">⏳ En attente de ${waiting} action${waiting > 1 ? "s" : ""}</p>
    <button class="secondary" onclick="A.force()">Ne plus attendre et continuer</button>`;
}

function taskView(t) {
  const g = S.game;
  const others = LG.alive(g).filter((p) => p.id !== actorId());
  const skip = (label) => `<button class="secondary" onclick="A.night('${t.kind}', {})">${label}</button>`;
  switch (t.kind) {
    case "wolves": {
      const votes = LG.tasks(g).filter((w) => w.kind === "wolves").map((w) => ({ wolf: w.pid, target: g.actions[w.key]?.target }));
      const mine = g.actions[t.key]?.target;
      return card(`
        <h2>🐺 Loups-garous, choisissez votre victime</h2>
        ${tiles(LG.targetsForWolves(g), "A.pickNight.bind(null,'wolves')", mine ? [mine] : [], (p) => {
          const who = votes.filter((v) => v.target === p.id).map((v) => pname(v.wolf));
          return who.length ? `<span class="votes">🐺 ${who.join(", ")}</span>` : "";
        })}
        <p class="muted center">Le choix est validé quand tous les loups ont voté (en cas d'égalité, tirage au sort).</p>
      `, "task");
    }
    case "voyante":
      return card(`<h2>🔮 Voyante, de qui veux-tu voir le rôle ?</h2>${tiles(others, "A.pickNight.bind(null,'voyante')")}`, "task");
    case "garde":
      return card(`<h2>🛡️ Garde, qui protèges-tu cette nuit ?</h2>
        ${tiles(LG.alive(g).filter((p) => p.id !== g.lastGuard), "A.pickNight.bind(null,'garde')")}
        ${g.lastGuard ? `<p class="muted center">Tu ne peux pas protéger ${pname(g.lastGuard)} deux nuits de suite.</p>` : ""}`, "task");
    case "renard":
      return card(`<h2>🦊 Renard, qui veux-tu flairer ?</h2><p class="muted">Tu sauras si lui ou l'un de ses voisins est un loup.</p>${tiles(others, "A.pickNight.bind(null,'renard')")}`, "task");
    case "corbeau":
      return card(`<h2>🐦 Corbeau, qui veux-tu accuser ?</h2>${tiles(others, "A.pickNight.bind(null,'corbeau')")}${skip("Personne cette nuit")}`, "task");
    case "enfant":
      return card(`<h2>🧒 Enfant sauvage, choisis ton modèle</h2>${tiles(others, "A.pickNight.bind(null,'enfant')")}`, "task");
    case "cupidon":
    case "flute": {
      const pool = t.kind === "cupidon" ? LG.alive(g) : others.filter((p) => !p.charmed);
      const need = Math.min(2, pool.length);
      return card(`
        <h2>${t.kind === "cupidon" ? "💘 Cupidon, choisis les deux amoureux" : "🎶 Joueur de flûte, charme deux joueurs"}</h2>
        ${tiles(pool, "A.toggleSel", S.sel)}
        <button onclick="A.confirmSel('${t.kind}')" ${S.sel.length === need ? "" : "disabled"}>Valider (${S.sel.length}/${need})</button>`, "task");
    }
    case "pyromane": {
      const doused = LG.alive(g).filter((p) => p.doused);
      return card(`
        <h2>🔥 Pyromane, qui asperges-tu d'essence ?</h2>
        ${tiles(others.filter((p) => !p.doused), "A.pickNight.bind(null,'pyromane')")}
        ${doused.length ? `<button class="danger" onclick="A.night('pyromane', {ignite: true})">🔥 Mettre le feu (${doused.length} aspergé${doused.length > 1 ? "s" : ""})</button>` : ""}
        ${skip("Ne rien faire")}`, "task");
    }
    case "grandloup":
      return card(`<h2>😈 Grand méchant loup, choisis une 2e victime</h2>
        ${tiles(LG.targetsForWolves(g).filter((p) => p.id !== g.nd.victim), "A.pickNight.bind(null,'grandloup')")}${skip("Pas de 2e victime")}`, "task");
    case "infect":
      return card(`
        <h2>🦠 Infect père des loups</h2>
        <p>La victime des loups est <b>${pname(g.nd.victim)}</b>. L'infecter pour en faire un loup, au lieu de la tuer ? (une seule fois par partie)</p>
        <button onclick="A.night('infect', {yes: true})">🦠 Infecter</button>${skip("Non, la dévorer")}`, "task");
    case "loupblanc":
      return card(`<h2>🤍 Loup blanc, veux-tu tuer un loup ?</h2>
        ${tiles(LG.alive(g).filter((p) => p.wolf && p.id !== actorId()), "A.pickNight.bind(null,'loupblanc')")}${skip("Ne tuer personne")}`, "task");
    case "sorciere": {
      const victims = LG.wolfVictims(g).map((id) => LG.P(g, id));
      const w = S.witch;
      return card(`
        <h2>🧪 Sorcière</h2>
        <p>${victims.length ? `Victime${victims.length > 1 ? "s" : ""} des loups : <b>${victims.map((v) => esc(v.name)).join(", ")}</b>` : "Les loups n'ont tué personne cette nuit."}</p>
        ${g.potions.heal && victims.length ? `<h3>Potion de vie</h3>${tiles(victims, "A.witch.bind(null,'heal')", w.heal ? [w.heal] : [])}` : ""}
        ${g.potions.kill ? `<h3>Potion de mort</h3>${tiles(others, "A.witch.bind(null,'kill')", w.kill ? [w.kill] : [])}` : ""}
        <button onclick="A.night('sorciere', {heal: S.witch.heal, kill: S.witch.kill})">${w.heal || w.kill ? "Valider" : "Ne rien faire"}</button>`, "task");
    }
  }
  return "";
}

function deadView() {
  const g = S.game;
  return card(`
    <h2>💀 Tu es mort</h2>
    <p class="muted">Tu peux suivre la partie en silence. Ne dis rien aux vivants !</p>
    <ul class="players">${g.players.map((p) => `<li class="${p.alive ? "" : "dead"}">${avatar(p.name)}<span class="name">${esc(p.name)}${p.wolf && ROLES[p.role].team === "village" ? " 🐺" : ""}</span>${teamTag(p.role)}</li>`).join("")}</ul>
  `) + leaveButton();
}

// ---------- Jour ----------

function dayView() {
  const g = S.game;
  const p = me();
  const head = phase(`☀️ Jour ${g.night}`) + newsView("🌅 Cette nuit…");
  const vote = isAdmin()
    ? card(`
        <h2>🗳️ Qui le village élimine-t-il ?</h2>
        <p class="muted">Débattez, votez à main levée, puis touchez le joueur éliminé.</p>
        ${tiles(LG.alive(g), "A.dayVote")}
        <button class="secondary" onclick="A.dayVote(null)">Personne</button>`)
    : card(`<p class="center">🗣️ Débattez puis votez à main levée.<br><span class="muted">L'hôte indiquera le résultat.</span></p>`);
  return head + (p.alive ? myRole() + vote : vote + deadView()) + seatsView() + (p.alive ? leaveButton() : "");
}

function hunterView() {
  const g = S.game;
  const hunter = LG.P(g, g.hunters[0]);
  const isMe = hunter.id === S.me;
  return `
    ${phase("🏹 Le Chasseur")}
    ${newsView("💀 Ce qui vient de se passer")}
    ${card(isMe
      ? `<h2>🏹 Tu meurs… Qui emportes-tu avec toi ?</h2>${tiles(LG.alive(g), "A.hunt")}`
      : `<p class="center">🏹 <b>${esc(hunter.name)}</b> était Chasseur et choisit sa dernière cible…</p>`)}
    ${isAdmin() && !isMe ? `<button class="secondary" onclick="A.hunt(null)">Passer (le chasseur ne répond pas)</button>` : ""}
    ${leaveButton()}`;
}

function endView() {
  const g = S.game;
  const win = LG.WIN[g.winner];
  return `
    <div class="banner ${g.winner === "village" ? "civils" : g.winner === "loups" ? "infiltres" : "white"}"><div class="emoji">${win.emoji}</div><h2>${win.title}</h2></div>
    ${newsView("💀 Derniers événements")}
    ${card(`<h2>Les rôles</h2><ul class="players">${g.players.map((p) => `
      <li class="${p.alive ? "" : "dead"}">${avatar(p.name)}
        <span class="name">${esc(p.name)}${g.lovers?.includes(p.id) ? " 💘" : ""}${p.wolf && ROLES[p.role].team === "village" ? " 🐺" : ""}</span>${teamTag(p.role)}</li>`).join("")}
    </ul>`)}
    ${isAdmin() ? `<button onclick="A.replay()">🔄 Rejouer</button>` : `<p class="muted center">L'hôte peut relancer une partie.</p>`}
    ${leaveButton()}`;
}

// ---------- Actions ----------

const A = {
  startLocal() {
    S.mode = "local";
    S.lobby = JSON.parse(localStorage.getItem("lg-local-names") || "[]").map((n) => ({ id: newId(), name: n }));
    S.comp = suggestedComposition(S.lobby.length);
    render();
  },

  addLocal() {
    const input = document.getElementById("newname");
    const n = input.value.trim();
    if (!n) return;
    if (S.lobby.some((p) => p.name.toLowerCase() === n.toLowerCase())) return toast("Ce prénom est déjà pris.");
    S.lobby.push({ id: newId(), name: n });
    input.value = "";
    localChanged();
  },

  removeLocal(i) {
    S.lobby.splice(i, 1);
    localChanged();
  },

  comp(role, delta) {
    S.comp = { ...S.comp, [role]: Math.max(0, (S.comp[role] || 0) + delta) };
    act();
  },

  preset(id) {
    const p = compositionsFor(S.lobby.length).find((c) => c.id === id);
    if (!p) return;
    S.comp = p.comp;
    act();
    toast(`${p.emoji} Composition « ${p.name} » choisie`);
  },

  start() {
    if (LG.compositionError(S.lobby.length, S.comp)) return;
    S.game = LG.newGame(S.lobby, S.comp);
    S.reveal = 0;
    resetLocalUi();
    act();
  },

  replay() {
    Auto.stop();
    S.game = null;
    S.reveal = 0;
    S.narratorOpen = false;
    if (S.mode === "host") S.lobby = room.presence();
    act();
  },

  nextReveal() {
    S.reveal++;
    render();
    if (S.reveal >= S.game.players.length && S.narration === "voix") Auto.start();
  },

  setNarration(mode) {
    S.narration = mode;
    localStorage.setItem("lg-narration", mode);
    render();
  },

  openNarrator() {
    if (confirm("Es-tu le narrateur ? Les rôles de tous les joueurs vont s'afficher.")) {
      S.narratorOpen = true;
      render();
    }
  },

  closeNarrator() {
    S.narratorOpen = false;
    render();
  },

  saveAiKey() {
    Narrator.setApiKey(document.getElementById("aikey").value);
    document.getElementById("aikey").value = "";
    toast(Narrator.apiKey() ? "Clé enregistrée sur ce téléphone." : "Clé supprimée.");
    render();
  },

  forgetAiKey() {
    Narrator.setApiKey("");
    render();
  },

  async testVoice() {
    const story = Narrator.apiKey() ? await Narrator.tell("Présente-toi en une phrase comme narrateur de la partie.") : null;
    if (Narrator.apiKey() && !story) toast("IA indisponible : " + (Narrator.tell.lastError || "erreur inconnue"));
    Narrator.speak(story || "Bonsoir. Je serai votre narrateur cette nuit.");
  },

  // Retourne la carte sans tout redessiner, pour garder l'animation.
  toggleRole(el) {
    S.showRole = !S.showRole;
    el.classList.toggle("shown", S.showRole);
  },

  pickNight(kind, target) {
    A.night(kind, { target });
  },

  toggleSel(id) {
    S.sel = S.sel.includes(id) ? S.sel.filter((s) => s !== id) : [...S.sel, id].slice(-2);
    render();
  },

  confirmSel(kind) {
    A.night(kind, { targets: S.sel });
  },

  witch(potion, id) {
    S.witch[potion] = S.witch[potion] === id ? null : id;
    render();
  },

  night(kind, data) {
    S.sel = [];
    S.witch = { heal: null, kill: null };
    if (S.mode === "local") Auto.act(kind, data);
    else if (S.mode === "host") act((g) => LG.act(g, S.me, kind, data));
    else room.send("act", { pid: S.me, kind, data });
  },

  force() {
    if (confirm("Continuer sans attendre les joueurs qui n'ont pas joué ?")) act((g) => LG.advance(g));
  },

  dayVote(id) {
    const label = id ? LG.P(S.game, id).name + " est éliminé" : "Personne n'est éliminé";
    if (confirm(label + " ?")) act((g) => LG.dayVote(g, id));
  },

  hunt(target) {
    if (S.game.hunters[0] === S.me || S.mode === "host") {
      const pid = S.game.hunters[0];
      if (S.mode === "host") act((g) => LG.hunterShoot(g, pid, target));
      else room.send("hunt", { pid, target });
    }
  },

  createRoom(resume) {
    if (!readName()) return;
    S.mode = "host";
    S.hostId = S.me;
    const saved = JSON.parse(localStorage.getItem("lg-host") || "null");
    if (resume && saved) {
      Object.assign(S, { code: saved.code, game: saved.game, comp: saved.comp, lobby: saved.lobby || [] });
    } else {
      S.code = Common.randomCode();
    }
    connect();
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
    if (navigator.share) navigator.share({ title: "Loup-Garou", text: "Rejoins ma partie de Loup-Garou !", url: link }).catch(() => {});
    else navigator.clipboard.writeText(link).then(() => toast("Lien copié !"));
  },

  leave() {
    if (S.game && S.mode !== "player" && !confirm("Quitter la partie ?")) return;
    if (S.mode === "host") localStorage.removeItem("lg-host");
    Auto.stop();
    S.narratorOpen = false;
    room?.leave();
    room = null;
    Object.assign(S, { mode: null, code: "", hostId: null, hostGone: false, game: null, lobby: [], comp: {}, error: "", status: "", reveal: 0 });
    resetLocalUi();
    history.replaceState(null, "", location.pathname);
    render();
  },
};

const newId = () => Math.random().toString(36).slice(2, 10);

function resetLocalUi() {
  S.showRole = false;
  S.sel = [];
  S.witch = { heal: null, kill: null };
}

function localChanged() {
  localStorage.setItem("lg-local-names", JSON.stringify(S.lobby.map((p) => p.name)));
  S.comp = suggestedComposition(S.lobby.length);
  render();
}

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

// Applique une action sur la partie, puis sauvegarde, diffuse et redessine.
function act(fn) {
  if (S.game && fn) fn(S.game);
  if (S.mode === "host") {
    localStorage.setItem("lg-host", JSON.stringify({ code: S.code, game: S.game, comp: S.comp, lobby: S.lobby }));
    room?.send("state", { hostId: S.me, game: S.game, lobby: S.lobby, comp: S.comp });
  }
  render();
}

// ---------- Réseau ----------

function connect() {
  room = Common.joinRoom("loupgarou-" + S.code, S.me, S.name, {
    events: ["state", "act", "hunt"],
    message(event, payload) {
      if (event === "state" && S.mode === "player") {
        if (S.game?.phase !== payload.game?.phase || S.game?.step !== payload.game?.step) resetSelections();
        if (!payload.game) S.showRole = false;
        Object.assign(S, { hostId: payload.hostId, hostGone: false, game: payload.game, lobby: payload.lobby, comp: payload.comp });
        render();
      }
      if (S.mode !== "host" || !S.game) return;
      if (event === "act") act((g) => LG.act(g, payload.pid, payload.kind, payload.data));
      if (event === "hunt") act((g) => LG.hunterShoot(g, payload.pid, payload.target));
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
      if (!S.game) {
        const before = S.lobby.length;
        S.lobby = list;
        if (list.length !== before) S.comp = suggestedComposition(list.length);
      }
      act();
    },
    status(text) {
      S.status = text;
      render();
    },
  });
}

function resetSelections() {
  S.sel = [];
  S.witch = { heal: null, kill: null };
}

render();
