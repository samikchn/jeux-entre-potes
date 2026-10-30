// Narrateur du mode « un seul téléphone » : voix du téléphone (gratuite), écoute au micro, et
// intelligence artificielle optionnelle (Gemini gratuit ou Claude) pour un narrateur qui improvise.
const Narrator = (() => {
  const CLAUDE_MODEL = "claude-opus-5-5";
  // Flash-Lite répond en ~1 s ; Flash « réfléchit » d'abord et peut mettre près d'une minute.
  const GEMINI_MODEL = "gemini-flash-lite-latest";
  const SYSTEM =
    "Tu es le narrateur d'une partie de Loup-Garou entre amis, autour d'une table. " +
    "Réponds en 2 ou 3 phrases courtes en français, à lire à voix haute : ton mystérieux, un peu drôle. " +
    "N'invente aucun fait de jeu : annonce exactement les morts et les rôles donnés, sans rien révéler d'autre. " +
    "Pas de titre, pas de liste, pas d'emoji.";

  let muted = localStorage.getItem("lg-muted") === "1";

  // Voix choisie par l'utilisateur (nom), sinon : voix française par défaut. Sur iPhone, on ne
  // choisit jamais seul : iOS liste aussi des voix non téléchargées, qui restent muettes.
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let frVoice = null;
  const frenchVoices = () =>
    window.speechSynthesis ? speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("fr")) : [];
  function pickVoice() {
    const fr = frenchVoices();
    const chosen = localStorage.getItem("lg-voice");
    frVoice = fr.find((v) => v.name === chosen) || (isIOS ? null : fr.find((v) => v.localService && v.default) || fr.find((v) => v.localService) || null);
    window.dispatchEvent(new Event("narrator-voices"));
  }
  function setVoice(name) {
    if (name) localStorage.setItem("lg-voice", name);
    else localStorage.removeItem("lg-voice");
    pickVoice();
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
    Common.playbackAudio();
    // Annuler juste avant de parler empêche Safari de lire la phrase suivante : seulement si besoin.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      if (frVoice) u.voice = frVoice;
      u.rate = 0.95;
      current = u;
      lastStarted = false;
      u.onstart = () => {
        lastStarted = true;
        log(`🗣️ la voix lit : « ${text.slice(0, 60)}${text.length > 60 ? "…" : ""} »`);
      };
      const check = setTimeout(() => !lastStarted && log("✖ la voix n'a pas démarré (mode silencieux ? son coupé ?)"), 3000);
      const done = () => {
        clearTimeout(safety);
        clearTimeout(check);
        if (current === u) current = null;
        resolve();
      };
      const safety = setTimeout(done, 3000 + text.length * 90);
      u.onend = done;
      u.onerror = (e) => {
        log("✖ voix : " + (e.error || "erreur"));
        done();
      };
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

  // ---------- Intelligence artificielle ----------
  // Deux fournisseurs : Gemini (Google, offre gratuite avec une clé) ou Claude (payant).
  // La clé reste uniquement sur ce téléphone (localStorage).
  if (localStorage.getItem("lg-ai-key") && !localStorage.getItem("lg-ai-key-claude")) {
    localStorage.setItem("lg-ai-key-claude", localStorage.getItem("lg-ai-key")); // ancienne version
    localStorage.removeItem("lg-ai-key");
  }
  const provider = () => localStorage.getItem("lg-ai-provider") || "gemini";
  const setProvider = (p) => localStorage.setItem("lg-ai-provider", p);
  const apiKey = () => localStorage.getItem("lg-ai-key-" + provider()) || "";
  function setApiKey(key) {
    if (key) localStorage.setItem("lg-ai-key-" + provider(), key.trim());
    else localStorage.removeItem("lg-ai-key-" + provider());
  }

  let lastError = "";

  async function callClaude(key, system, messages, signal) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2026-10-21",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        output_config: { effort: "low" },
        fallbacks: "default",
        system,
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "HTTP " + res.status);
    if (data.stop_reason === "refusal") return null;
    return data.content.filter((b) => b.type === "text").map((b) => b.text).join(" ");
  }

  async function callGemini(key, system, messages, signal) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "HTTP " + res.status);
    const parts = data.candidates?.[0]?.content?.parts || [];
    return parts.filter((p) => !p.thought && p.text).map((p) => p.text).join(" ");
  }

  // Envoie une conversation ({role: "user"|"assistant", text}) à l'IA. null si pas de clé ou erreur.
  async function ask(system, messages) {
    const key = apiKey();
    if (!key) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const start = Date.now();
    const secs = () => ((Date.now() - start) / 1000).toFixed(1) + " s";
    log(`🤖 question à l'IA (${provider()})…`);
    try {
      const call = provider() === "claude" ? callClaude : callGemini;
      const text = (await call(key, system, messages, ctrl.signal) || "").replace(/[*#_`]/g, "").trim();
      lastError = text ? "" : "réponse vide";
      log(text ? `🤖 réponse en ${secs()} : « ${text.slice(0, 120)}${text.length > 120 ? "…" : ""} »` : `✖ IA : réponse vide (${secs()})`);
      return text || null;
    } catch (e) {
      lastError = e.name === "AbortError" ? "L'IA a mis trop de temps à répondre." : e.message;
      log(`✖ IA (${secs()}) : ${lastError}`);
      console.warn("IA indisponible :", lastError);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // Raconte des faits en une fois (narrateur vocal avec IA, sans mémoire).
  const tell = (facts) => ask(SYSTEM, [{ role: "user", text: facts }]);

  // ---------- Écoute (reconnaissance vocale du téléphone, gratuite) ----------
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;

  // Écoute une phrase et renvoie le texte compris (null si rien ou si l'écoute est impossible).
  // Réglage simple (une phrase, sans mode continu) : c'est celui qui marche sur iPhone.
  // Sécurités : on coupe après `silenceMs` suivant un résultat, au bout de `maxMs` au total,
  // et on rend la main même si Safari ne signale jamais la fin de l'écoute.
  function listen({ silenceMs = 1500, maxMs = 12000 } = {}) {
    if (!Recognition) return Promise.resolve(null);
    stop();
    return new Promise((resolve) => {
      const r = new Recognition();
      recognizer = r;
      r.lang = "fr-FR";
      r.interimResults = false;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onaudiostart = () => log("🎙️ micro ouvert");
      let heard = "";
      let done = false;
      let silenceTimer = null;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(silenceTimer);
        clearTimeout(maxTimer);
        clearTimeout(endTimer);
        recognizer = null;
        // Fin de l'écoute : on repasse le son en « lecture » pour que la voix puisse répondre.
        Common.micAudio(false);
        log(heard.trim() ? `🎤 entendu : « ${heard.trim()} »` : "🎤 rien entendu" + (lastError ? ` (${lastError})` : ""));
        resolve(heard.trim() || null);
      };
      let endTimer = null;
      const halt = (why) => {
        if (why) log("⏹️ écoute arrêtée : " + why);
        try { r.stop(); } catch { /* déjà arrêtée */ }
        endTimer = setTimeout(finish, 1500); // si Safari n'envoie jamais « fin »
      };
      const maxTimer = setTimeout(() => halt(`${maxMs / 1000} s écoulées`), maxMs);
      r.onresult = (e) => {
        heard = Array.from(e.results).map((res) => res[0].transcript).join(" ");
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => halt("silence"), silenceMs);
      };
      r.onerror = (e) => {
        lastError = e.error === "not-allowed" ? "Micro refusé : autorise le micro pour Safari." : "Écoute impossible : " + e.error;
        if (e.error !== "no-speech" && e.error !== "aborted") log("✖ micro : " + e.error);
      };
      r.onend = finish;
      lastError = "";
      // Le mode « lecture » de l'iPhone coupe le micro : on passe en lecture + enregistrement.
      Common.micAudio(true);
      log(`🎤 écoute… (son : ${Common.audioSessionType()})`);
      try {
        r.start();
      } catch (e) {
        lastError = "Écoute impossible : " + e.message;
        finish();
      }
      stopListening.current = halt;
    });
  }

  function stopListening() {
    if (recognizer && stopListening.current) stopListening.current("à la demande");
  }

  // ---------- Journal en direct (option) ----------
  const logLines = [];
  function log(msg) {
    const t = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logLines.push(`${t} ${msg}`);
    if (logLines.length > 60) logLines.shift();
    window.dispatchEvent(new Event("narrator-log"));
  }

  return {
    speak, stop, toggleMute, isMuted: () => muted, started: () => lastStarted, isIOS,
    voices: frenchVoices, setVoice, voiceName: () => localStorage.getItem("lg-voice") || "",
    provider, setProvider, apiKey, setApiKey, ask, tell, lastError: () => lastError,
    canListen: () => !!Recognition, listen, stopListening, isListening: () => !!recognizer,
    log, logLines: () => logLines.slice(),
  };
})();
