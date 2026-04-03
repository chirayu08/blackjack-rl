// ═══════════════════════════════════════════════
//  blackjack.js  —  Core Game Engine
//  Standard 6-deck shoe, H17, BJ pays 3:2
// ═══════════════════════════════════════════════

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const VALUES = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':10,'Q':10,'K':10,'A':11 };

function buildShoe(numDecks = 6) {
  const suits = ['♠','♥','♦','♣'];
  const shoe = [];
  for (let d = 0; d < numDecks; d++)
    for (const suit of suits)
      for (const rank of RANKS)
        shoe.push({ rank, suit, value: VALUES[rank] });
  return shuffle(shoe);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function handValue(hand) {
  let total = 0, aces = 0;
  for (const card of hand) {
    total += card.value;
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function hasUsableAce(hand) {
  let total = 0, aces = 0;
  for (const card of hand) {
    total += card.value;
    if (card.rank === 'A') aces++;
  }
  return aces > 0 && total <= 21 && (total - 10) <= 10;
}

function isBusted(hand) { return handValue(hand) > 21; }
function isBlackjack(hand) { return hand.length === 2 && handValue(hand) === 21; }

module.exports = { buildShoe, handValue, hasUsableAce, isBusted, isBlackjack, shuffle };
