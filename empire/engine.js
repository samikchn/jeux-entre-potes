// Règles d'Empire IDF, sans interface. Seul l'hôte fait tourner ce code (il gère aussi les
// robots) ; les fonctions modifient `g` directement.
//
// Déroulé d'un tour (g.stage) :
//   "roll"    : le joueur lance les dés (ou sort des Bouchons)
//   "buy"     : il est sur un terrain libre : acheter, ou mettre aux enchères
//   "auction" : enchères ouvertes à tous, qui se terminent après quelques secondes sans offre
//   "debt"    : il doit payer plus que ce qu'il a : vendre, ou faire faillite
//   "done"    : il peut construire, échanger, puis finir son tour
const EM = (() => {
  const AUCTION_MS = 8000; // durée sans nouvelle offre avant d'adjuger
  const MAX_ROUNDS = 80; // limite de sécurité du mode faillite

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const P = (g, id) => g.players.find((p) => p.id === id);
  const current = (g) => g.players[g.turn];
  const active = (g) => g.players.filter((p) => !p.bankrupt);
  const owned = (g, pid) => Object.keys(g.owners).map(Number).filter((i) => g.owners[i] === pid);
  const groupSpaces = (group) => SPACES.filter((s) => s.type === "prop" && s.group === group).map((s) => s.index);
  const ownsGroup = (g, pid, group) => groupSpaces(group).every((i) => g.owners[i] === pid);
  const level = (g, i) => g.levels[i] || 0;

  function log(g, msg) {
    g.log.push(msg);
    if (g.log.length > 40) g.log.shift();
  }

  function newGame(players, settings) {
    const g = {
      players: shuffle(players).map((p, i) => ({
        id: p.id, name: p.name, bot: !!p.bot, color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        cash: settings.startCash || 1500, pos: 0, jail: 0, jailCards: 0, bankrupt: false,
      })),
      settings: { mode: settings.mode || "tours", maxRounds: settings.maxRounds || 25 },
      turn: 0,
      round: 1,
      stage: "roll",
      owners: {},
      levels: {},
      pot: 0,
      deck: shuffle(CARDS.map((_, i) => i)),
      dice: null,
      doubles: 0,
      card: null,
      auction: null,
      trade: null,
      debt: null,
      winner: null,
      log: [],
    };
    log(g, `La partie commence ! ${g.players[0].name} joue en premier.`);
    return g;
  }

  // ---------- Argent ----------

  // Le joueur du tour paye `amount` (à un joueur ou à la cagnotte/banque). S'il n'a pas assez,
  // il passe en « dette » et doit vendre ou faire faillite.
  function charge(g, p, amount, to, next) {
    if (amount <= 0) return true;
    if (p.cash >= amount) {
      p.cash -= amount;
      if (to === "pot") g.pot += amount;
      else if (to) P(g, to).cash += amount;
      return true;
    }
    g.debt = { pid: p.id, amount, to, next };
    g.stage = "debt";
    log(g, `${p.name} doit payer ${amount} € mais n'a que ${p.cash} € : il doit vendre ou abandonner.`);
    return false;
  }

  // « Le Grand Paris s'embourgeoise » : les loyers montent de 20 % tous les 10 tours, pour que
  // les parties finissent par se décider.
  const inflation = (g) => 1 + 0.2 * Math.floor((g.round - 1) / 10);

  function rent(g, i) {
    const s = SPACES[i];
    const owner = g.owners[i];
    let base;
    if (s.type === "rer") {
      const n = SPACES.filter((x) => x.type === "rer" && g.owners[x.index] === owner).length;
      base = 25 * 2 ** (n - 1);
    } else {
      const lvl = level(g, i);
      if (lvl > 0) base = s.rent * LEVEL_MULT[lvl];
      else base = ownsGroup(g, owner, s.group) ? s.rent * 2 : s.rent;
    }
    return Math.round(base * inflation(g));
  }

  function netWorth(g, p) {
    return p.cash + owned(g, p.id).reduce((sum, i) => sum + SPACES[i].price + level(g, i) * (SPACES[i].build || 0), 0);
  }

  // ---------- Déplacement et cases ----------

  function moveTo(g, p, dest, collect = true) {
    if (collect && dest < p.pos) {
      p.cash += START_BONUS;
      log(g, `${p.name} passe par le Départ : +${START_BONUS} €.`);
    }
    p.pos = dest;
  }

  function sendToJail(g, p) {
    p.pos = JAIL;
    p.jail = 1;
    g.doubles = 0;
    log(g, `${p.name} est coincé dans les Bouchons sur le périph' !`);
  }

  // Ce qui se passe quand on arrive sur une case. `next` : étape après résolution.
  function land(g, p, next) {
    const s = SPACES[p.pos];
    g.stage = next;
    if (s.type === "prop" || s.type === "rer") {
      const owner = g.owners[p.pos];
      if (owner === undefined) {
        g.stage = "buy";
        g.afterBuy = next;
      } else if (owner !== p.id && !P(g, owner).bankrupt) {
        const r = rent(g, p.pos);
        log(g, `${p.name} paye ${r} € de loyer à ${P(g, owner).name} (${s.name}).`);
        charge(g, p, r, owner, next);
      }
    } else if (s.type === "tax") {
      log(g, `${p.name} paye la ${s.name} : ${s.amount} € à la cagnotte.`);
      charge(g, p, s.amount, "pot", next);
    } else if (s.type === "pause") {
      if (g.pot > 0) {
        log(g, `${p.name} se pose en terrasse et rafle la cagnotte : +${g.pot} € !`);
        p.cash += g.pot;
        g.pot = 0;
      }
    } else if (s.type === "control") {
      sendToJail(g, p);
      g.stage = "done";
    } else if (s.type === "event") {
      drawCard(g, p, next);
    }
  }

  function drawCard(g, p, next) {
    if (!g.deck.length) g.deck = shuffle(CARDS.map((_, i) => i));
    const c = CARDS[g.deck.shift()];
    g.card = { text: c.text, pid: p.id };
    log(g, `🎴 ${p.name} : ${c.text}`);
    const others = active(g).filter((q) => q.id !== p.id);
    if (c.cash > 0) p.cash += c.cash;
    else if (c.cash < 0) charge(g, p, -c.cash, "pot", next);
    else if (c.fromEach) {
      for (const q of others) {
        const paid = Math.min(q.cash, c.fromEach);
        q.cash -= paid;
        p.cash += paid;
      }
    } else if (c.toEach) {
      charge(g, p, c.toEach * others.length, null, next) && others.forEach((q) => (q.cash += c.toEach));
    } else if (c.perLevel) {
      const levels = owned(g, p.id).reduce((s, i) => s + level(g, i), 0);
      charge(g, p, levels * c.perLevel, "pot", next);
    } else if (c.jail) {
      sendToJail(g, p);
      g.stage = "done";
    } else if (c.jailCard) {
      p.jailCards++;
    } else if (c.goto !== undefined) {
      moveTo(g, p, c.goto);
      land(g, p, next);
    } else if (c.move) {
      p.pos = (p.pos + c.move + SPACES.length) % SPACES.length;
      land(g, p, next);
    } else if (c.nearestRer) {
      let i = p.pos;
      do i = (i + 1) % SPACES.length; while (SPACES[i].type !== "rer");
      moveTo(g, p, i);
      land(g, p, next);
    }
  }

  // ---------- Actions ----------

  function roll(g, p) {
    const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    g.dice = d;
    g.card = null;
    const isDouble = d[0] === d[1];
    const total = d[0] + d[1];

    if (p.jail) {
      if (isDouble) {
        log(g, `${p.name} fait un double (${d[0]}-${d[1]}) et sort des Bouchons !`);
        p.jail = 0;
      } else if (p.jail >= 3) {
        log(g, `${p.name} sort des Bouchons après 3 tours et paye ${JAIL_FEE} €.`);
        p.jail = 0;
        if (!charge(g, p, JAIL_FEE, "pot", "done")) {
          g.pendingMove = total;
          return;
        }
      } else {
        p.jail++;
        log(g, `${p.name} reste coincé dans les Bouchons (${d[0]}-${d[1]}).`);
        g.stage = "done";
        return;
      }
      moveTo(g, p, (p.pos + total) % SPACES.length);
      log(g, `${p.name} avance de ${total} : ${SPACES[p.pos].name}.`);
      land(g, p, "done");
      return;
    }

    g.doubles = isDouble ? g.doubles + 1 : 0;
    if (g.doubles === 3) {
      log(g, `${p.name} fait trois doubles d'affilée : excès de vitesse !`);
      sendToJail(g, p);
      g.stage = "done";
      return;
    }
    moveTo(g, p, (p.pos + total) % SPACES.length);
    log(g, `${p.name} fait ${d[0]}-${d[1]} et arrive à ${SPACES[p.pos].name}.`);
    land(g, p, isDouble ? "roll" : "done");
    if (g.stage === "roll") log(g, `Double ! ${p.name} rejoue.`);
  }

  function buy(g, p) {
    const s = SPACES[p.pos];
    if (p.cash < s.price) return;
    p.cash -= s.price;
    g.owners[p.pos] = p.id;
    log(g, `${p.name} achète ${s.name} pour ${s.price} €.`);
    g.stage = g.afterBuy;
  }

  function startAuction(g, p, now) {
    g.auction = { space: p.pos, bid: 0, bidder: null, endsAt: now + AUCTION_MS, next: g.afterBuy };
    g.stage = "auction";
    log(g, `${SPACES[p.pos].name} est mis aux enchères !`);
  }

  function bid(g, p, amount, now) {
    const a = g.auction;
    if (!a || p.bankrupt || amount <= a.bid || amount > p.cash) return;
    a.bid = amount;
    a.bidder = p.id;
    a.endsAt = Math.max(a.endsAt, now + 5000);
  }

  function closeAuction(g) {
    const a = g.auction;
    const s = SPACES[a.space];
    if (a.bidder && P(g, a.bidder).cash >= a.bid) {
      const w = P(g, a.bidder);
      w.cash -= a.bid;
      g.owners[a.space] = w.id;
      log(g, `🔨 ${w.name} remporte ${s.name} pour ${a.bid} €.`);
    } else {
      log(g, `Personne n'a enchéri : ${s.name} reste libre.`);
    }
    g.stage = a.next;
    g.auction = null;
  }

  function canBuild(g, pid, i) {
    const s = SPACES[i];
    return s.type === "prop" && g.owners[i] === pid && ownsGroup(g, pid, s.group) && level(g, i) < 3;
  }

  function build(g, p, i) {
    if (!canBuild(g, p.id, i) || p.cash < SPACES[i].build) return;
    p.cash -= SPACES[i].build;
    g.levels[i] = level(g, i) + 1;
    log(g, `🏗️ ${p.name} construit : ${SPACES[i].name} devient ${LEVELS[g.levels[i]]}.`);
  }

  function sellLevel(g, p, i) {
    if (g.owners[i] !== p.id || !level(g, i)) return;
    g.levels[i]--;
    p.cash += SPACES[i].build / 2;
    log(g, `${p.name} revend une construction à ${SPACES[i].name} (+${SPACES[i].build / 2} €).`);
  }

  // Revendre un terrain à la banque : moitié prix, et seulement sans construction sur le groupe.
  function sellProp(g, p, i) {
    const s = SPACES[i];
    if (g.owners[i] !== p.id) return;
    if (s.type === "prop" && groupSpaces(s.group).some((j) => level(g, j))) return;
    delete g.owners[i];
    p.cash += s.price / 2;
    log(g, `${p.name} revend ${s.name} à la banque (+${s.price / 2} €).`);
  }

  function payDebt(g, p) {
    const d = g.debt;
    if (!d || d.pid !== p.id || p.cash < d.amount) return;
    g.debt = null;
    g.stage = d.next;
    charge(g, p, d.amount, d.to, d.next);
    if (g.pendingMove) {
      const total = g.pendingMove;
      g.pendingMove = null;
      moveTo(g, p, (p.pos + total) % SPACES.length);
      land(g, p, "done");
    }
  }

  function bankrupt(g, p) {
    const creditor = g.debt && g.debt.pid === p.id && g.debt.to && g.debt.to !== "pot" ? P(g, g.debt.to) : null;
    for (const i of owned(g, p.id)) {
      p.cash += (level(g, i) * SPACES[i].build) / 2;
      delete g.levels[i];
      if (creditor) g.owners[i] = creditor.id;
      else delete g.owners[i];
    }
    if (creditor) creditor.cash += p.cash;
    p.cash = 0;
    p.bankrupt = true;
    p.jail = 0;
    if (g.trade && (g.trade.from === p.id || g.trade.to === p.id)) g.trade = null;
    log(g, `💸 ${p.name} fait faillite${creditor ? ` : tout revient à ${creditor.name}` : ""}.`);
    const wasTurn = current(g).id === p.id;
    g.debt = null;
    if (!checkEnd(g) && wasTurn) nextTurn(g);
  }

  function nextTurn(g) {
    g.doubles = 0;
    g.card = null;
    let i = g.turn;
    do {
      i = (i + 1) % g.players.length;
      if (i === 0) g.round++;
    } while (g.players[i].bankrupt);
    g.turn = i;
    g.stage = "roll";
    if (checkEnd(g)) return;
    log(g, `— Au tour de ${g.players[i].name} —`);
  }

  function checkEnd(g) {
    const alive = active(g);
    let winner = null;
    // En mode faillite, limite de sécurité : au-delà de MAX_ROUNDS tours, le plus riche gagne.
    const limit = g.settings.mode === "tours" ? g.settings.maxRounds : MAX_ROUNDS;
    if (alive.length <= 1) winner = alive[0];
    else if (g.round > limit) {
      winner = alive.reduce((best, p) => (netWorth(g, p) > netWorth(g, best) ? p : best));
    }
    if (!winner) return false;
    g.winner = winner.id;
    g.stage = "end";
    log(g, `🏆 ${winner.name} gagne la partie avec ${netWorth(g, winner)} € de patrimoine !`);
    return true;
  }

  // ---------- Échanges ----------

  // offer = { from, to, give: {props, cash}, get: {props, cash} }
  function tradeValid(g, t) {
    const from = P(g, t.from);
    const to = P(g, t.to);
    if (!from || !to || from.bankrupt || to.bankrupt || from === to) return false;
    const free = (i, pid) => g.owners[i] === pid && !(SPACES[i].type === "prop" && groupSpaces(SPACES[i].group).some((j) => level(g, j)));
    return t.give.props.every((i) => free(i, t.from)) && t.get.props.every((i) => free(i, t.to)) &&
      t.give.cash >= 0 && t.get.cash >= 0 && from.cash >= t.give.cash && to.cash >= t.get.cash &&
      (t.give.props.length || t.get.props.length || t.give.cash || t.get.cash);
  }

  function propose(g, p, offer) {
    const t = { from: p.id, to: offer.to, give: offer.give, get: offer.get };
    if (g.trade || !tradeValid(g, t)) return;
    g.trade = t;
    log(g, `🤝 ${p.name} propose un échange à ${P(g, t.to).name}.`);
  }

  function respond(g, p, accept) {
    const t = g.trade;
    if (!t || t.to !== p.id) return;
    g.trade = null;
    if (!accept || !tradeValid(g, t)) {
      log(g, `${p.name} refuse l'échange.`);
      return;
    }
    const from = P(g, t.from);
    t.give.props.forEach((i) => (g.owners[i] = t.to));
    t.get.props.forEach((i) => (g.owners[i] = t.from));
    from.cash += t.get.cash - t.give.cash;
    p.cash += t.give.cash - t.get.cash;
    log(g, `🤝 ${p.name} accepte l'échange avec ${from.name}.`);
  }

  // ---------- Point d'entrée ----------

  function act(g, pid, type, data = {}, now = Date.now()) {
    const p = P(g, pid);
    if (!p || p.bankrupt || g.stage === "end") return;
    const mine = current(g).id === pid;
    switch (type) {
      case "roll":
        if (mine && g.stage === "roll") roll(g, p);
        break;
      case "jailPay":
        if (mine && g.stage === "roll" && p.jail && p.cash >= JAIL_FEE) {
          p.cash -= JAIL_FEE;
          g.pot += JAIL_FEE;
          p.jail = 0;
          log(g, `${p.name} paye ${JAIL_FEE} € pour sortir des Bouchons.`);
        }
        break;
      case "jailCard":
        if (mine && g.stage === "roll" && p.jail && p.jailCards) {
          p.jailCards--;
          p.jail = 0;
          log(g, `${p.name} utilise son Passe Navigo pour sortir des Bouchons.`);
        }
        break;
      case "buy":
        if (mine && g.stage === "buy") buy(g, p);
        break;
      case "auction":
        if (mine && g.stage === "buy") startAuction(g, p, now);
        break;
      case "bid":
        if (g.stage === "auction") bid(g, p, data.amount, now);
        break;
      case "build":
        if (mine && (g.stage === "roll" || g.stage === "done")) build(g, p, data.space);
        break;
      case "sellLevel":
        if (mine || g.debt?.pid === pid) sellLevel(g, p, data.space);
        break;
      case "sellProp":
        if (mine || g.debt?.pid === pid) sellProp(g, p, data.space);
        break;
      case "payDebt":
        payDebt(g, p);
        break;
      case "bankrupt":
        bankrupt(g, p);
        break;
      case "endTurn":
        if (mine && g.stage === "done") nextTurn(g);
        break;
      case "propose":
        if (g.stage !== "auction") propose(g, p, data);
        break;
      case "respond":
        respond(g, p, data.accept);
        break;
      case "cancelTrade":
        if (g.trade?.from === pid) g.trade = null;
        break;
    }
  }

  // À appeler régulièrement par l'hôte : clôt les enchères arrivées à terme.
  function tick(g, now = Date.now()) {
    if (g.stage === "auction" && g.auction && now >= g.auction.endsAt) {
      closeAuction(g);
      return true;
    }
    return false;
  }

  // ---------- Robots ----------

  // Valeur qu'un robot accorde à une case (plus si elle complète un groupe).
  function botValue(g, pid, i) {
    const s = SPACES[i];
    let v = s.price;
    if (s.type === "prop") {
      const group = groupSpaces(s.group);
      const mine = group.filter((j) => g.owners[j] === pid).length;
      if (mine === group.length - 1) v *= 1.8;
      else if (mine) v *= 1.25;
    } else {
      v *= 1.2;
    }
    return Math.round(v);
  }

  // Le robot possède tout un département sauf une ville, détenue par un autre joueur : il la
  // lui propose de la racheter (avec une prime) s'il en a les moyens.
  function botTradeOffer(g, p) {
    for (let group = 0; group < GROUPS.length; group++) {
      const spaces = groupSpaces(group);
      const missing = spaces.filter((i) => g.owners[i] !== p.id);
      if (missing.length !== 1 || spaces.some((i) => level(g, i))) continue;
      const i = missing[0];
      const owner = g.owners[i] !== undefined && P(g, g.owners[i]);
      if (!owner || owner.bankrupt) continue;
      const cash = Math.min(p.cash - 150, Math.round((SPACES[i].price * 1.6) / 10) * 10);
      if (cash >= SPACES[i].price) return { to: owner.id, give: { props: [], cash }, get: { props: [i], cash: 0 } };
    }
    return null;
  }

  // Fait jouer UNE action à un robot qui en a une à faire. Renvoie true si un robot a agi.
  function botStep(g, now = Date.now()) {
    if (g.stage === "end") return false;

    // Échange proposé à un robot : il accepte si ça l'avantage.
    if (g.trade && P(g, g.trade.to)?.bot) {
      const t = g.trade;
      const gain = t.give.props.reduce((s, i) => s + botValue(g, t.to, i), 0) + t.give.cash;
      const loss = t.get.props.reduce((s, i) => s + botValue(g, t.to, i) * 1.15, 0) + t.get.cash;
      act(g, t.to, "respond", { accept: gain >= loss });
      return true;
    }

    // Enchères : un robot surenchérit s'il trouve la case intéressante.
    if (g.stage === "auction") {
      const a = g.auction;
      const step = a.bid < 100 ? 10 : 20;
      const bot = active(g).find((p) => p.bot && a.bidder !== p.id && p.cash - (a.bid + step) >= 50 &&
        a.bid + step <= botValue(g, p.id, a.space) * (0.75 + Math.random() * 0.3));
      if (bot && Math.random() < 0.6) {
        act(g, bot.id, "bid", { amount: a.bid + step }, now);
        return true;
      }
      return false;
    }

    const p = current(g);
    if (!p.bot) return false;

    if (g.stage === "debt") {
      // Vend d'abord les constructions, puis les terrains les moins chers.
      const built = owned(g, p.id).filter((i) => level(g, i)).sort((a, b) => SPACES[a].build - SPACES[b].build);
      if (p.cash >= g.debt.amount) act(g, p.id, "payDebt");
      else if (built.length) act(g, p.id, "sellLevel", { space: built[0] });
      else {
        const props = owned(g, p.id).sort((a, b) => SPACES[a].price - SPACES[b].price);
        if (props.length) act(g, p.id, "sellProp", { space: props[0] });
        else act(g, p.id, "bankrupt");
      }
      return true;
    }
    if (g.stage === "roll") {
      if (p.jail && p.jailCards) act(g, p.id, "jailCard");
      else if (p.jail && p.cash > 400) act(g, p.id, "jailPay");
      else act(g, p.id, "roll");
      return true;
    }
    if (g.stage === "buy") {
      const s = SPACES[p.pos];
      const keep = g.round < 4 ? 50 : 150;
      act(g, p.id, p.cash - s.price >= keep || (botValue(g, p.id, p.pos) > s.price * 1.5 && p.cash >= s.price) ? "buy" : "auction", {}, now);
      return true;
    }
    if (g.stage === "done") {
      // Une fois par tour, propose d'acheter la ville qui lui manque pour compléter un département.
      const key = `${g.round}-${g.turn}`;
      if (!g.trade && g.botTried !== key) {
        g.botTried = key;
        const offer = botTradeOffer(g, p);
        if (offer) {
          act(g, p.id, "propose", offer);
          return true;
        }
      }
      // Construit si un groupe est complet et qu'il reste une réserve.
      const target = owned(g, p.id).filter((i) => canBuild(g, p.id, i) && p.cash - SPACES[i].build >= 250)
        .sort((a, b) => level(g, a) - level(g, b))[0];
      if (target !== undefined) act(g, p.id, "build", { space: target });
      else act(g, p.id, "endTurn");
      return true;
    }
    return false;
  }

  return {
    P, current, active, owned, ownsGroup, groupSpaces, level, rent, netWorth, canBuild, tradeValid,
    newGame, act, tick, botStep, inflation, JAIL_FEE, MAX_ROUNDS,
  };
})();
