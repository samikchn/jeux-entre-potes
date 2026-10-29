// Règles d'Undercover, sans aucune interface : utilisées en mode 1 téléphone
// et par l'hôte en mode en ligne. Les fonctions modifient `state` directement.
const UC = (() => {
  const ROLE_LABEL = { civil: "Civil", undercover: "Undercover", white: "Mr. White" };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normalize(s) {
    return (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function defaultCounts(n) {
    if (n <= 4) return { undercover: 1, white: 0 };
    if (n <= 6) return { undercover: 1, white: 1 };
    if (n <= 9) return { undercover: 2, white: 1 };
    return { undercover: 3, white: 1 };
  }

  // Il faut toujours plus de civils que d'infiltrés.
  function countsValid(n, undercover, white) {
    return n >= 3 && undercover + white >= 1 && n - undercover - white > undercover + white;
  }

  function newGame(players, settings) {
    let civilWord, underWord;
    if (settings.civil && settings.under) {
      civilWord = settings.civil.trim();
      underWord = settings.under.trim();
    } else {
      const pair = WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
      [civilWord, underWord] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
    }

    const roles = shuffle([
      ...Array(settings.undercover).fill("undercover"),
      ...Array(settings.white).fill("white"),
      ...Array(players.length - settings.undercover - settings.white).fill("civil"),
    ]);

    const state = {
      phase: "play",
      round: 1,
      civilWord,
      underWord,
      players: players.map((p, i) => ({
        id: p.id,
        name: p.name,
        role: roles[i],
        word: roles[i] === "civil" ? civilWord : roles[i] === "undercover" ? underWord : null,
        alive: true,
      })),
      order: [],
      votes: {},
      candidates: null,
      tieCount: 0,
      eliminated: null,
      whiteGuess: null,
      winner: null,
      message: "",
    };
    state.order = speakingOrder(state);
    return state;
  }

  // Ordre de parole aléatoire, Mr. White ne commence jamais.
  function speakingOrder(state) {
    const alive = shuffle(state.players.filter((p) => p.alive));
    const first = alive.findIndex((p) => p.role !== "white");
    if (first > 0) alive.unshift(alive.splice(first, 1)[0]);
    return alive.map((p) => p.id);
  }

  const player = (state, id) => state.players.find((p) => p.id === id);
  const alivePlayers = (state) => state.players.filter((p) => p.alive);

  function startVote(state) {
    state.phase = "vote";
    state.votes = {};
    state.candidates = null;
    state.tieCount = 0;
    state.message = "";
  }

  function castVote(state, voterId, targetId) {
    const voter = player(state, voterId);
    const target = player(state, targetId);
    if (state.phase !== "vote" || !voter || !voter.alive || !target || !target.alive) return;
    if (voterId === targetId) return;
    if (state.candidates && !state.candidates.includes(targetId)) return;
    state.votes[voterId] = targetId;
  }

  function allVoted(state) {
    return alivePlayers(state).every((p) => state.votes[p.id]);
  }

  // Dépouillement. Égalité : on revote entre les ex-aequo, puis tirage au sort.
  function resolveVote(state) {
    const count = {};
    Object.values(state.votes).forEach((id) => (count[id] = (count[id] || 0) + 1));
    const max = Math.max(0, ...Object.values(count));
    if (max === 0) return;
    const top = Object.keys(count).filter((id) => count[id] === max);
    if (top.length > 1 && state.tieCount === 0) {
      state.tieCount = 1;
      state.candidates = top;
      state.votes = {};
      state.message = "Égalité ! Nouveau vote entre : " + top.map((id) => player(state, id).name).join(", ");
      return;
    }
    const chosen = top[Math.floor(Math.random() * top.length)];
    if (top.length > 1) state.message = "Encore égalité : tirage au sort.";
    eliminate(state, chosen);
  }

  function eliminate(state, id) {
    const p = player(state, id);
    p.alive = false;
    state.eliminated = id;
    state.votes = {};
    state.candidates = null;
    if (p.role === "white") {
      state.phase = "guess";
    } else {
      afterElimination(state);
    }
  }

  function submitWhiteGuess(state, guess) {
    if (state.phase !== "guess") return;
    state.whiteGuess = guess;
    if (normalize(guess) === normalize(state.civilWord)) {
      state.winner = "white";
      state.phase = "end";
    } else {
      afterElimination(state);
    }
  }

  function afterElimination(state) {
    const alive = alivePlayers(state);
    const civils = alive.filter((p) => p.role === "civil").length;
    const infiltres = alive.length - civils;
    if (infiltres === 0) state.winner = "civils";
    else if (civils <= 1) state.winner = "infiltres";
    state.phase = state.winner ? "end" : "result";
  }

  function nextRound(state) {
    state.round++;
    state.order = speakingOrder(state);
    state.eliminated = null;
    state.whiteGuess = null;
    state.message = "";
    state.phase = "play";
  }

  const WINNER_LABEL = {
    civils: "🎉 Les Civils gagnent !",
    infiltres: "🕵️ Les infiltrés gagnent !",
    white: "👻 Mr. White a deviné le mot et gagne !",
  };

  return {
    ROLE_LABEL, WINNER_LABEL, shuffle, defaultCounts, countsValid, newGame, player, alivePlayers,
    startVote, castVote, allVoted, resolveVote, eliminate, submitWhiteGuess, nextRound,
  };
})();
