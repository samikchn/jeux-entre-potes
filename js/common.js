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

  // Retour au clic : effet visuel, petit « tic » sonore et vibration (Android ; l'iPhone ne
  // laisse pas les sites vibrer).
  let audio = null;
  function tick() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
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
      if (!el) return;
      el.classList.remove("pressed");
      void el.offsetWidth; // relance l'animation même sur deux appuis rapides
      el.classList.add("pressed");
      setTimeout(() => el.classList.remove("pressed"), 300);
      if (navigator.vibrate) navigator.vibrate(12);
      tick();
    },
    { passive: true }
  );

  return { playerId, esc, toast, avatar, render, randomCode, joinRoom, onlineConfigured };
})();
