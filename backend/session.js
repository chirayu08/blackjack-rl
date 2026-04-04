// ═══════════════════════════════════════════════
//  session.js  —  Live Game Session Manager
//  Manages active player game sessions in memory
// ═══════════════════════════════════════════════

const { buildShoe, handValue, hasUsableAce, isBusted, isBlackjack } = require('./blackjack');

const sessions = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

function cleanSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActive > SESSION_TTL) sessions.delete(id);
  }
}
setInterval(cleanSessions, 5 * 60 * 1000);

function newSession(sessionId) {
  const shoe = buildShoe(6);
  const session = {
    id: sessionId,
    shoe,
    shoeIdx: 0,
    playerHand: [],
    dealerHand: [],
    phase: 'idle',   // idle | player | dealer | done
    balance: 1000,
    bet: 0,
    doubled: false,
    stats: { wins: 0, losses: 0, pushes: 0, blackjacks: 0, hands: 0 },
    lastActive: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s) s.lastActive = Date.now();
  return s || newSession(sessionId);
}

function deal(session) {
  if (session.shoeIdx >= session.shoe.length - 20) {
    session.shoe = buildShoe(6);
    session.shoeIdx = 0;
  }
  return session.shoe[session.shoeIdx++];
}

function formatCard(card) {
  return { rank: card.rank, suit: card.suit, value: card.value };
}

function sessionState(session, revealDealer = false) {
  const playerTotal = handValue(session.playerHand);
  const dealerTotal = handValue(session.dealerHand);
  return {
    phase: session.phase,
    playerHand: session.playerHand.map(formatCard),
    dealerHand: revealDealer
      ? session.dealerHand.map(formatCard)
      : [formatCard(session.dealerHand[0]), { rank: '?', suit: '?', value: 0 }],
    playerTotal,
    dealerTotal: revealDealer ? dealerTotal : handValue([session.dealerHand[0]]),
    balance: session.balance,
    bet: session.bet,
    doubled: session.doubled,
    stats: session.stats,
    canDouble: session.playerHand.length === 2 && !session.doubled && session.balance >= session.bet,
    canHit: session.phase === 'player' && playerTotal < 21,
  };
}

// ── Actions ──────────────────────────────────────

function startGame(sessionId, bet) {
  const session = getSession(sessionId);
  if (session.phase !== 'idle' && session.phase !== 'done') {
    return { error: 'Game already in progress' };
  }

  const validBet = Math.min(Math.max(1, Math.floor(bet)), session.balance);
  session.bet = validBet;
  session.balance -= validBet;
  session.doubled = false;
  session.playerHand = [deal(session), deal(session)];
  session.dealerHand = [deal(session), deal(session)];
  session.phase = 'player';

  const playerBJ = isBlackjack(session.playerHand);
  const dealerBJ = isBlackjack(session.dealerHand);

  if (playerBJ || dealerBJ) {
    return resolveGame(session, playerBJ, dealerBJ);
  }

  return { ok: true, state: sessionState(session) };
}

function hit(sessionId) {
  const session = getSession(sessionId);
  if (session.phase !== 'player') return { error: 'Not your turn' };

  session.playerHand.push(deal(session));
  const total = handValue(session.playerHand);

  if (isBusted(session.playerHand)) {
    session.phase = 'done';
    session.stats.losses++;
    session.stats.hands++;
    return {
      ok: true,
      result: 'bust',
      message: `Bust! You had ${total}.`,
      state: sessionState(session, true),
    };
  }

  if (total === 21) return stand(sessionId);

  return { ok: true, state: sessionState(session) };
}

function stand(sessionId) {
  const session = getSession(sessionId);
  if (session.phase !== 'player') return { error: 'Not your turn' };

  session.phase = 'dealer';

  // Dealer hits until 17+ (H17)
  while (handValue(session.dealerHand) < 17 ||
         (handValue(session.dealerHand) === 17 && hasUsableAce(session.dealerHand))) {
    session.dealerHand.push(deal(session));
  }

  return resolveGame(session, false, false);
}

function doubleDown(sessionId) {
  const session = getSession(sessionId);
  if (session.phase !== 'player') return { error: 'Not your turn' };
  if (session.playerHand.length !== 2) return { error: 'Can only double on first two cards' };
  if (session.balance < session.bet) return { error: 'Insufficient balance' };

  session.balance -= session.bet;
  session.bet *= 2;
  session.doubled = true;
  session.playerHand.push(deal(session));

  const total = handValue(session.playerHand);
  if (isBusted(session.playerHand)) {
    session.phase = 'done';
    session.stats.losses++;
    session.stats.hands++;
    return {
      ok: true,
      result: 'bust',
      message: `Doubled & bust! You had ${total}.`,
      state: sessionState(session, true),
    };
  }

  return stand(sessionId);
}

function resolveGame(session, playerBJ, dealerBJ) {
  const pTotal = handValue(session.playerHand);
  const dTotal = handValue(session.dealerHand);
  const dealerBust = isBusted(session.dealerHand);

  session.phase = 'done';
  session.stats.hands++;

  let result, message, payout = 0;

  if (playerBJ && dealerBJ) {
    result = 'push';
    message = 'Both Blackjack — Push!';
    payout = session.bet;
    session.stats.pushes++;
  } else if (playerBJ) {
    result = 'blackjack';
    message = 'Blackjack! 🎉 Pays 3:2';
    payout = session.bet + Math.floor(session.bet * 1.5);
    session.stats.wins++;
    session.stats.blackjacks++;
  } else if (dealerBJ) {
    result = 'loss';
    message = 'Dealer Blackjack. You lose.';
    session.stats.losses++;
  } else if (dealerBust || pTotal > dTotal) {
    result = 'win';
    message = dealerBust ? `Dealer bust (${dTotal})! You win!` : `You win! ${pTotal} vs ${dTotal}`;
    payout = session.bet * 2;
    session.stats.wins++;
  } else if (pTotal === dTotal) {
    result = 'push';
    message = `Push — both ${pTotal}`;
    payout = session.bet;
    session.stats.pushes++;
  } else {
    result = 'loss';
    message = `Dealer wins. ${dTotal} vs ${pTotal}`;
    session.stats.losses++;
  }

  session.balance += payout;

  // Reset for next hand
  setTimeout(() => { session.phase = 'idle'; }, 0);
  session.phase = 'done';

  return {
    ok: true,
    result,
    message,
    payout,
    state: sessionState(session, true),
  };
}

function resetBalance(sessionId) {
  const session = getSession(sessionId);
  session.balance = 1000;
  session.phase = 'idle';
  session.stats = { wins: 0, losses: 0, pushes: 0, blackjacks: 0, hands: 0 };
  return { ok: true, state: sessionState(session) };
}

function newHand(sessionId) {
  const session = getSession(sessionId);
  session.phase = 'idle';
  session.playerHand = [];
  session.dealerHand = [];
  return { ok: true, state: sessionState(session) };
}

module.exports = { startGame, hit, stand, doubleDown, resetBalance, newHand, getSession };
