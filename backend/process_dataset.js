// ═══════════════════════════════════════════════
//  process_dataset.js  —  Kaggle Dataset Processor
//
//  Dataset: "900,000 Hands of Blackjack Results"
//  Columns:
//    PlayerNo, card1-5, sumofcards, dealcard1-5,
//    sumofdeal, blkjck, winloss, plybustbeat,
//    dlbustbeat, plwinamt, dlwinamt, ply2cardsum
//
//  Run: node process_dataset.js <path-to-csv>
//  Output: dataset_seeds.json + dataset_stats.json
// ═══════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: node process_dataset.js <path-to-csv>');
  process.exit(1);
}

console.log(`Reading: ${csvPath}`);
const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.split('\n');

// Auto-detect delimiter
const firstLine = lines[0];
const delimiter = firstLine.includes('\t') ? '\t' : ',';
console.log(`Delimiter: ${delimiter === '\t' ? 'TAB' : 'COMMA'}`);
const header = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g,''));

console.log('Columns detected:', header);

// Column index lookup
const col = name => header.indexOf(name.toLowerCase());
const iC = {
  sumofcards:  col('sumofcards'),
  ply2cardsum: col('ply2cardsum'),
  dealcard1:   col('dealcard1'),
  sumofdeal:   col('sumofdeal'),
  winloss:     col('winloss'),
  blkjck:      col('blkjck'),
  plybustbeat: col('plybustbeat'),
  dlbustbeat:  col('dlbustbeat'),
  plwinamt:    col('plwinamt'),
  dlwinamt:    col('dlwinamt'),
  card1:       col('card1'),
  card2:       col('card2'),
  card3:       col('card3'),
};

// ── Accumulators ─────────────────────────────────────────────

// Q-seed: for each (playerSum, dealerUp) → track wins/losses
// We infer action from number of cards:
//   2 cards only → Stand (player didn't hit)
//   3+ cards     → Hit
const qAcc = {};   // key → { stand: {w,l,p,n}, hit: {w,l,p,n} }

// Stats accumulators
const stats = {
  total: 0,
  wins: 0,
  losses: 0,
  pushes: 0,
  blackjacks: 0,
  playerBusts: 0,
  dealerBusts: 0,
  totalPlayerWin: 0,
  totalDealerWin: 0,

  // Win rate by player 2-card sum
  byPlayerSum: {},   // sum → {w,l,p,n}

  // Win rate by dealer upcard
  byDealerUp: {},    // upcard → {w,l,p,n}

  // Action distribution
  actions: { stand: 0, hit: 0 },

  // Outcome distribution by player final sum
  byFinalSum: {},

  // Bust rates
  bustByDealerUp: {},
};

function cardValue(v) {
  const n = parseInt(v);
  if (isNaN(n)) return 0;
  return Math.min(n, 11); // Ace already stored as 11 in dataset
}

function getOrCreate(obj, key) {
  if (!obj[key]) obj[key] = { w: 0, l: 0, p: 0, n: 0 };
  return obj[key];
}

function parseOutcome(winloss, blkjck, plybust, dlbust) {
  const wl  = (winloss  || '').toString().trim().toUpperCase();
  const bj  = (blkjck   || '').toString().trim().toUpperCase();
  const pb  = (plybust  || '').toString().trim().toUpperCase();

  // Blackjack check: "WIN", "BJ", "BLACKJACK", "1", "Y"
  if (bj === 'WIN' || bj === 'BJ' || bj === 'BLACKJACK' || bj === '1' || bj === 'Y') return 'blackjack';

  // Player bust: "BUST", "PLBUST", "1", "Y"
  if (pb === 'BUST' || pb === 'PLBUST' || pb === 'PLBUST' || pb === '1' || pb === 'Y') return 'loss';

  // winloss string
  if (wl === 'W' || wl === 'WIN')  return 'win';
  if (wl === 'L' || wl === 'LOSS') return 'loss';
  if (wl === 'P' || wl === 'PUSH' || wl === 'T' || wl === 'TIE') return 'push';

  const num = parseFloat(winloss);
  if (!isNaN(num)) {
    if (num > 0) return 'win';
    if (num < 0) return 'loss';
    return 'push';
  }
  return 'push';
}

// ── Debug: print first data row raw values ───────────────────
const sampleFields = lines[1].split(delimiter).map(f => f.replace(/"/g,'').trim());
console.log('\nSample row raw values:');
header.forEach((h, i) => console.log(`  ${h}: "${sampleFields[i]}"`));
console.log('');

// ── Main parse loop ───────────────────────────────────────────
let skipped = 0;
for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const fields = line.split(delimiter).map(f => f.replace(/"/g,'').trim());
  if (fields.length < header.length) { skipped++; continue; }

  const playerSum  = parseInt(fields[iC.sumofcards]);
  const ply2card   = parseInt(fields[iC.ply2cardsum]);
  const dealerUp   = cardValue(fields[iC.dealcard1]);
  const dealerSum  = parseInt(fields[iC.sumofdeal]);
  const winloss    = fields[iC.winloss];
  const blkjck     = fields[iC.blkjck];
  const plybust    = fields[iC.plybustbeat];
  const dlbust     = fields[iC.dlbustbeat];
  const plwinamt   = parseFloat(fields[iC.plwinamt]) || 0;
  const dlwinamt   = parseFloat(fields[iC.dlwinamt]) || 0;
  const card3      = fields[iC.card3];

  if (isNaN(playerSum) || isNaN(dealerUp) || dealerUp < 2) { skipped++; continue; }

  const outcome = parseOutcome(winloss, blkjck, plybust, dlbust);

  // Detect bust: plybustbeat = "Bust"
  const playerBusted = (plybust || '').toString().trim().toUpperCase() === 'BUST';
  // Detect dealer bust: dlbustbeat = "Bust" or "Dlbust"
  const dealerBusted = (dlbust  || '').toString().trim().toUpperCase().includes('BUST');
  // Detect blackjack: blkjck = "Win" (player blackjack win)
  const isBlackjack  = (blkjck  || '').toString().trim().toUpperCase() === 'WIN';
  const hitCard  = card3 && parseInt(card3) > 0;
  const action   = hitCard ? 'hit' : 'stand';

  stats.total++;
  if (outcome === 'win' || outcome === 'blackjack') stats.wins++;
  else if (outcome === 'loss') stats.losses++;
  else stats.pushes++;
  if (isBlackjack)   stats.blackjacks++;
  if (playerBusted)  stats.playerBusts++;
  if (dealerBusted)  stats.dealerBusts++;
  stats.totalPlayerWin += plwinamt;
  stats.totalDealerWin += dlwinamt;
  stats.actions[action]++;

  // By player 2-card sum
  if (ply2card >= 4 && ply2card <= 21) {
    const s = getOrCreate(stats.byPlayerSum, ply2card);
    s.n++;
    if (outcome === 'win' || outcome === 'blackjack') s.w++;
    else if (outcome === 'loss') s.l++;
    else s.p++;
  }

  // By dealer upcard
  if (dealerUp >= 2 && dealerUp <= 11) {
    const s = getOrCreate(stats.byDealerUp, dealerUp);
    s.n++;
    if (outcome === 'win' || outcome === 'blackjack') s.w++;
    else if (outcome === 'loss') s.l++;
    else s.p++;

    // Bust rate by dealer up
    const b = getOrCreate(stats.bustByDealerUp, dealerUp);
    b.n++;
    if (dealerBusted) b.w++;
  }

  // By final player sum
  if (playerSum >= 4 && playerSum <= 21) {
    const s = getOrCreate(stats.byFinalSum, playerSum);
    s.n++;
    if (outcome === 'win' || outcome === 'blackjack') s.w++;
    else if (outcome === 'loss') s.l++;
    else s.p++;
  }

  // Q-seed accumulator (use 2-card sum as state, infer action)
  if (ply2card >= 4 && ply2card <= 21 && dealerUp >= 2 && dealerUp <= 11) {
    const key = `${ply2card}_${dealerUp}_0`; // treat as hard hand
    if (!qAcc[key]) qAcc[key] = { stand: {w:0,l:0,p:0,n:0}, hit: {w:0,l:0,p:0,n:0} };
    const acc = qAcc[key][action];
    acc.n++;
    if (outcome === 'win' || outcome === 'blackjack') acc.w++;
    else if (outcome === 'loss') acc.l++;
    else acc.p++;
  }

  if (stats.total % 100000 === 0) process.stdout.write(`  Processed ${stats.total.toLocaleString()} rows...\r`);
}

console.log(`\nDone! Processed: ${stats.total.toLocaleString()} | Skipped: ${skipped}`);

// ── Build Q-seeds from accumulators ──────────────────────────
// Q-value = (wins - losses) / n  (range -1 to +1, like reward)
const qSeeds = {};
for (const [key, actions] of Object.entries(qAcc)) {
  const qStand = actions.stand.n > 0
    ? (actions.stand.w - actions.stand.l) / actions.stand.n
    : null;
  const qHit = actions.hit.n > 0
    ? (actions.hit.w - actions.hit.l) / actions.hit.n
    : null;

  if (qStand !== null || qHit !== null) {
    qSeeds[key] = {
      stand: { q: qStand, n: actions.stand.n },
      hit:   { q: qHit,   n: actions.hit.n   },
    };
  }
}

// ── Build clean stats object ──────────────────────────────────
const cleanStats = {
  total: stats.total,
  wins: stats.wins,
  losses: stats.losses,
  pushes: stats.pushes,
  blackjacks: stats.blackjacks,
  playerBusts: stats.playerBusts,
  dealerBusts: stats.dealerBusts,
  winRate:     +(stats.wins  / stats.total).toFixed(4),
  lossRate:    +(stats.losses / stats.total).toFixed(4),
  pushRate:    +(stats.pushes / stats.total).toFixed(4),
  blackjackRate: +(stats.blackjacks / stats.total).toFixed(4),
  playerBustRate: +(stats.playerBusts / stats.total).toFixed(4),
  dealerBustRate: +(stats.dealerBusts / stats.total).toFixed(4),
  actionSplit: {
    stand: +(stats.actions.stand / stats.total).toFixed(4),
    hit:   +(stats.actions.hit   / stats.total).toFixed(4),
  },
  byPlayerSum: Object.fromEntries(
    Object.entries(stats.byPlayerSum).sort(([a],[b])=>+a-+b).map(([k,v])=>[k,{
      winRate: v.n > 0 ? +(v.w/v.n).toFixed(4) : 0,
      lossRate: v.n > 0 ? +(v.l/v.n).toFixed(4) : 0,
      pushRate: v.n > 0 ? +(v.p/v.n).toFixed(4) : 0,
      n: v.n,
    }])
  ),
  byDealerUp: Object.fromEntries(
    Object.entries(stats.byDealerUp).sort(([a],[b])=>+a-+b).map(([k,v])=>[k,{
      winRate: v.n > 0 ? +(v.w/v.n).toFixed(4) : 0,
      lossRate: v.n > 0 ? +(v.l/v.n).toFixed(4) : 0,
      pushRate: v.n > 0 ? +(v.p/v.n).toFixed(4) : 0,
      bustRate: stats.bustByDealerUp[k]
        ? +(stats.bustByDealerUp[k].w / stats.bustByDealerUp[k].n).toFixed(4)
        : 0,
      n: v.n,
    }])
  ),
  byFinalSum: Object.fromEntries(
    Object.entries(stats.byFinalSum).sort(([a],[b])=>+a-+b).map(([k,v])=>[k,{
      winRate: v.n > 0 ? +(v.w/v.n).toFixed(4) : 0,
      n: v.n,
    }])
  ),
};

// ── Write output files ────────────────────────────────────────
const outSeeds = path.join(__dirname, 'dataset_seeds.json');
const outStats = path.join(__dirname, 'dataset_stats.json');

fs.writeFileSync(outSeeds, JSON.stringify(qSeeds, null, 2));
fs.writeFileSync(outStats, JSON.stringify(cleanStats, null, 2));

console.log(`\n✅ Q-seeds written → ${outSeeds} (${Object.keys(qSeeds).length} states)`);
console.log(`✅ Stats written   → ${outStats}`);
console.log(`\n📊 Dataset Summary:`);
console.log(`   Total hands : ${cleanStats.total.toLocaleString()}`);
console.log(`   Win rate    : ${(cleanStats.winRate*100).toFixed(1)}%`);
console.log(`   Loss rate   : ${(cleanStats.lossRate*100).toFixed(1)}%`);
console.log(`   Push rate   : ${(cleanStats.pushRate*100).toFixed(1)}%`);
console.log(`   Player bust : ${(cleanStats.playerBustRate*100).toFixed(1)}%`);
console.log(`   Dealer bust : ${(cleanStats.dealerBustRate*100).toFixed(1)}%`);
console.log(`   Blackjacks  : ${(cleanStats.blackjackRate*100).toFixed(1)}%`);
