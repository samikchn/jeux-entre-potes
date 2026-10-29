// Narrateur du mode « un seul téléphone » : lit les textes à voix haute (synthèse vocale
// du navigateur, gratuite) et, si une clé API Claude est enregistrée sur ce téléphone,
// demande à Claude de raconter les annonces de façon plus vivante.
const Narrator = (() => {
  const MODEL = "claude-opus-5-5";
  const SYSTEM =
    "Tu es le narrateur d'une partie de Loup-Garou entre amis, autour d'une table. " +
    "Réponds en 2 ou 3 phrases courtes en français, à lire à voix haute : ton mystérieux, un peu drôle. " +
    "N'invente aucun fait de jeu : annonce exactement les morts et les rôles donnés, sans rien révéler d'autre. " +
    "Pas de titre, pas de liste, pas d'emoji.";

  let muted = localStorage.getItem("lg-muted") === "1";

  // Sur iPhone/iPad, iOS liste aussi des voix non téléchargées : en choisir une rend la voix
  // muette. On laisse donc iOS prendre sa voix française par défaut (lang = fr-FR).
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let frVoice = null;
  function pickVoice() {
    if (isIOS || !window.speechSynthesis) return;
    const fr = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("fr") && v.localService);
    frVoice = fr.find((v) => v.default) || fr[0] || null;
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.addEventListener?.("voiceschanged", pickVoice);
  }

  let current = null; // garde une référence : sinon Safari peut oublier la phrase en cours
  let lastStarted = true; // la dernière phrase a-t-elle vraiment commencé ?

  // Lit le texte et attend la fin (ou un délai de secours si la voix ne répond pas).
  // Sur iPhone, la toute première phrase doit partir directement d'un appui de l'utilisateur.
  function speak(text) {
    if (!text) return Promise.resolve();
    if (muted || !window.speechSynthesis) return new Promise((r) => setTimeout(r, 1200));
    // Annuler juste avant de parler empêche Safari de lire la phrase suivante : seulement si besoin.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      if (frVoice) u.voice = frVoice;
      u.rate = 0.95;
      current = u;
      lastStarted = false;
      u.onstart = () => (lastStarted = true);
      const done = () => {
        clearTimeout(safety);
        if (current === u) current = null;
        resolve();
      };
      const safety = setTimeout(done, 3000 + text.length * 90);
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  function stop() {
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem("lg-muted", muted ? "1" : "0");
    if (muted) stop();
    return muted;
  }

  const apiKey = () => localStorage.getItem("lg-ai-key") || "";
  function setApiKey(key) {
    if (key) localStorage.setItem("lg-ai-key", key.trim());
    else localStorage.removeItem("lg-ai-key");
  }

  // Raconte les faits donnés. Renvoie null sans clé ou en cas d'erreur (le texte simple est alors lu).
  async function tell(facts) {
    const key = apiKey();
    if (!key) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2026-10-21",
          "anthropic-beta": "server-side-fallback-2026-07-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2000,
          output_config: { effort: "low" },
          fallbacks: "default",
          system: SYSTEM,
          messages: [{ role: "user", content: facts }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || "HTTP " + res.status);
      if (data.stop_reason === "refusal") return null;
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
      return text || null;
    } catch (e) {
      tell.lastError = e.name === "AbortError" ? "L'IA a mis trop de temps à répondre." : e.message;
      console.warn("Narration IA indisponible :", tell.lastError);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return { speak, stop, toggleMute, isMuted: () => muted, started: () => lastStarted, isIOS, apiKey, setApiKey, tell };
})();
