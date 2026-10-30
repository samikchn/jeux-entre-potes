// Outils partagés entre les jeux : identifiant, affichage, salon en ligne.
const Common = (() => {
  function playerId() {
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

  function hue(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }

  const avatar = (name, big = false) =>
    `<span class="avatar ${big ? "big" : ""}" style="--h:${hue(name)}">${esc([...String(name).trim()][0] || "?")}</span>`;

  // Redessine `el` en gardant la saisie en cours, les menus ouverts et le focus.
  // Les cartes ne s'animent que si `screenKey` change.
  function render(el, html, screenKey) {
    const focused = document.activeElement && document.activeElement.id;
    const values = {};
    el.querySelectorAll("input[id]").forEach((i) => (values[i.id] = i.value));
    const open = [...el.querySelectorAll("details[id][open]")].map((d) => d.id);

    el.innerHTML = html;
    el.classList.toggle("no-anim", screenKey === el.dataset.screen);
    el.dataset.screen = screenKey;

    el.querySelectorAll("input[id]").forEach((i) => {
      if (values[i.id] !== undefined) i.value = values[i.id];
    });
    open.forEach((id) => document.getElementById(id)?.setAttribute("open", ""));
    if (focused && document.getElementById(focused)) document.getElementById(focused).focus();
  }

  const randomCode = () =>
    Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");

  // Salon temps réel Supabase (broadcast + présence, sans base de données).
  // on: { events: [noms d'événements], message(event, payload), presence(list), status(text) }
  let client = null;
  function joinRoom(channelName, me, name, on) {
    client = client || supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    const channel = client.channel(channelName, { config: { presence: { key: me } } });
    const presence = () =>
      Object.entries(channel.presenceState())
        .map(([id, metas]) => ({ id, name: metas[0].name, at: metas[0].at }))
        .sort((a, b) => a.at - b.at)
        .map(({ id, name }) => ({ id, name }));

    for (const event of on.events) {
      channel.on("broadcast", { event }, ({ payload }) => on.message(event, payload));
    }
    channel
      .on("presence", { event: "sync" }, () => on.presence(presence()))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name, at: Date.now() });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") on.status("Connexion impossible au serveur temps réel.");
      });

    return {
      send: (event, payload) => channel.send({ type: "broadcast", event, payload }),
      presence,
      leave: () => client.removeChannel(channel),
    };
  }

  const onlineConfigured = () => !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);

  // ---------- Annuaire des salons ouverts (tous les jeux) ----------
  // Chaque hôte s'annonce sur le canal « salons » (présence Supabase) tant que sa page est
  // ouverte ; l'accueil et les jeux lisent la liste. Fermer un salon = demander à son hôte
  // (seul celui qui l'a créé peut le faire).
  const GAMES = {
    undercover: { name: "Undercover", path: "undercover/" },
    "loup-garou": { name: "Loup-Garou", path: "loup-garou/" },
    empire: { name: "Empire IDF", path: "empire/" },
  };
  let dir = null;
  let dirReady = false;
  let dirInfo = null;
  const dirListeners = [];
  const closeListeners = [];
  const VIEWER = { viewer: true }; // présence d'une page qui regarde la liste sans salon

  function directory() {
    if (dir || !onlineConfigured() || !window.supabase) return dir;
    client = client || supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    dir = client.channel("salons", { config: { presence: { key: playerId() + "-" + Math.random().toString(36).slice(2, 6) } } });
    dir
      .on("presence", { event: "sync" }, () => dirListeners.forEach((f) => f(listRooms())))
      .on("broadcast", { event: "close" }, ({ payload }) => closeListeners.forEach((f) => f(payload)))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        dirReady = true;
        // Supabase n'envoie la liste qu'aux pages présentes : sans salon, on se déclare spectateur.
        dir.track(dirInfo || VIEWER);
        dirListeners.forEach((f) => f(listRooms()));
      });
    return dir;
  }

  function listRooms() {
    if (!dir) return [];
    return Object.values(dir.presenceState()).flat().filter((r) => r.code)
      .sort((a, b) => b.at - a.at);
  }

  // L'hôte annonce (ou met à jour) son salon ; null pour le retirer.
  // info : { game, code, host, hostId, players, status }
  function announceRoom(info) {
    if (!directory()) return;
    const next = info ? { ...info, at: dirInfo?.code === info.code ? dirInfo.at : Date.now() } : null;
    if (JSON.stringify(next) === JSON.stringify(dirInfo)) return;
    dirInfo = next;
    if (dirReady) dir.track(next || VIEWER);
  }

  function watchRooms(cb) {
    directory();
    dirListeners.push(cb);
    cb(listRooms());
  }

  // Demande à l'hôte de fermer son salon (il vérifie que c'est bien son créateur).
  function closeRoom(game, code) {
    directory()?.send({ type: "broadcast", event: "close", payload: { game, code, by: playerId() } });
  }

  // Liste HTML des salons. root : chemin vers la racine du site ("" sur l'accueil, "../" dans un jeu).
  // game : n'afficher que les salons de ce jeu (facultatif).
  // Mode « Gérer » : un bouton Supprimer sur tous les salons (pas seulement les siens), pour
  // faire le ménage entre potes.
  let managing = false;
  function toggleManage() {
    managing = !managing;
    dirListeners.forEach((f) => f(listRooms()));
  }

  function roomsView(rooms, { root = "", game = null } = {}) {
    const list = rooms.filter((r) => GAMES[r.game] && (!game || r.game === game));
    if (!list.length) return `<p class="muted" style="margin:0">Aucun salon ouvert pour l'instant.</p>`;
    const me = playerId();
    return list.map((r) => `
      <div class="room-row">
        <div class="room-tx"><b>${esc(GAMES[r.game].name)} · ${esc(r.code)}</b>
          <small class="muted">${esc(r.host)}${r.hostId === me ? " (toi)" : ""} · ${r.players} joueur${r.players > 1 ? "s" : ""} · ${r.status === "playing" ? "partie en cours" : "en attente"}</small></div>
        <a class="room-btn" href="${root}${GAMES[r.game].path}?salon=${encodeURIComponent(r.code)}">Rejoindre</a>
        ${r.hostId === me || managing ? `<button class="room-btn danger" onclick="Common.askClose('${r.game}', '${esc(r.code)}')">Supprimer</button>` : ""}
      </div>`).join("") + `
      <button class="room-manage" onclick="Common.toggleManage()">${managing ? "Terminer" : "Gérer les salons"}</button>`;
  }

  function askClose(game, code) {
    if (confirm(`Supprimer le salon ${code} ? Les joueurs connectés seront déconnectés.`)) {
      closeRoom(game, code);
      toast("Salon supprimé.");
    }
  }

  // Côté hôte : ferme le salon quand quelqu'un le supprime depuis la liste.
  function onCloseRequest(game, getRoom, close) {
    directory();
    closeListeners.push((p) => {
      const r = getRoom();
      if (r && p.game === game && p.code === r.code) close();
    });
  }

  // Retour au clic : effet visuel, petit « tic » sonore et vibration (Android ; l'iPhone ne
  // laisse pas les sites vibrer).
  // Sur iPhone, le son d'un site est coupé par le mode silencieux, sauf s'il se déclare
  // « lecteur » comme une app de musique (Audio Session API de Safari). Mais ce mode coupe le
  // micro : pendant une écoute, on passe en « lecture et enregistrement » (micActive).
  let micActive = false;
  function setAudioSession(type) {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type;
    } catch {
      // navigateur sans cette API : rien à faire
    }
  }
  function playbackAudio() {
    if (!micActive) setAudioSession("playback");
  }
  function micAudio(on) {
    micActive = on;
    setAudioSession(on ? "play-and-record" : "playback");
  }
  const audioSessionType = () => navigator.audioSession?.type || "non disponible";
  playbackAudio();

  let audio = null;
  function tick() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      // Sur iPhone, la voix du narrateur « interrompt » le son : on le relance à chaque appui.
      if (audio.state !== "running") audio.resume();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.06);
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.06);
    } catch {
      // pas de son disponible : l'effet visuel suffit
    }
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target.closest("button:not(:disabled), .mode, .flip, summary");
      playbackAudio();
      if (!el) return;
      el.classList.remove("pressed");
      void el.offsetWidth; // relance l'animation même sur deux appuis rapides
      el.classList.add("pressed");
      setTimeout(() => el.classList.remove("pressed"), 300);
      if (navigator.vibrate) navigator.vibrate(12);
      // Pas de « tic » quand un narrateur vocal est actif : sur iPhone, le son des bruitages
      // et la voix se gênent.
      if (!document.body.dataset.voice) tick();
    },
    { passive: true }
  );

  return {
    playerId, esc, toast, avatar, render, randomCode, joinRoom, onlineConfigured, playbackAudio, micAudio, audioSessionType,
    GAMES, announceRoom, watchRooms, closeRoom, askClose, onCloseRequest, roomsView, toggleManage,
  };
})();
