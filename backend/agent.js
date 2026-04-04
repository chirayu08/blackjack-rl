// ═══════════════════════════════════════════════
//  agent.js  —  Monte Carlo RL Agent
//  First-Visit MC Control with ε-greedy policy
//  Actions: 0=Stand, 1=Hit, 2=Double
//  Dataset-seeded from Kaggle 900k hands CSV
// ═══════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const { buildShoe, handValue, hasUsableAce, isBusted, isBlackjack } = require('./blackjack');

const ACTIONS      = { STAND: 0, HIT: 1, DOUBLE: 2 };
const ACTION_NAMES = ['Stand', 'Hit', 'Double'];

// Load dataset stats if available
let DATASET_STATS = null;
const statsPath = path.join(__dirname, 'dataset_stats.json');
if (fs.existsSync(statsPath)) {
  try {
    DATASET_STATS = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    console.log(`📊 Dataset stats loaded (${DATASET_STATS.total.toLocaleString()} hands)`);
  } catch(e) { console.warn('Could not load dataset_stats.json:', e.message); }
}

class MonteCarloAgent {
  constructor(options = {}) {
    this.Q = {};
    this.N = {};
    this.epsilon    = options.epsilon    ?? 1.0;
    this.epsilonMin = options.epsilonMin ?? 0.05;
    this.epsilonDecay = options.epsilonDecay ?? 0.99995;
    this.totalEpisodes = 0;
    this.rewardHistory = [];
    this.winCount  = 0;
    this.lossCount = 0;
    this.pushCount = 0;
    this.datasetStats = DATASET_STATS;
    this.datasetSeeded = false;

    // Pre-seed Q-table from dataset if available
    const seedsPath = path.join(__dirname, 'dataset_seeds.json');
    if (fs.existsSync(seedsPath)) {
      try {
        const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
        let seeded = 0;
        for (const [key, actions] of Object.entries(seeds)) {
          this.Q[key] = [
            actions.stand.q ?? 0,
            actions.hit.q   ?? 0,
            0,
          ];
          this.N[key] = [
            actions.stand.n ?? 0,
            actions.hit.n   ?? 0,
            0,
          ];
          seeded++;
        }
        this.epsilon = options.epsilon ?? 0.3;
        this.datasetSeeded = true;
        console.log(`🧠 Agent pre-seeded with ${seeded} states from dataset`);
      } catch(e) { console.warn('Could not load dataset_seeds.json:', e.message); }
    }
  }

  stateKey(playerSum, dealerUpcard, usableAce) {
    return `${playerSum}_${dealerUpcard}_${usableAce ? 1 : 0}`;
  }

  initState(key) {
    if (!this.Q[key]) {
      this.Q[key] = [0, 0, 0];
      this.N[key] = [0, 0, 0];
    }
  }

  chooseAction(playerSum, dealerUpcard, usableAce, allowDouble = true) {
    const key = this.stateKey(playerSum, dealerUpcard, usableAce);
    this.initState(key);

    if (Math.random() < this.epsilon) {
      const validActions = allowDouble ? [0, 1, 2] : [0, 1];
      return validActions[Math.floor(Math.random() * validActions.length)];
    }

    const qVals = this.Q[key];
    if (!allowDouble) {
      return qVals[0] >= qVals[1] ? 0 : 1;
    }
    return qVals.indexOf(Math.max(...qVals));
  }

  policyAction(playerSum, dealerUpcard, usableAce) {
    const key = this.stateKey(playerSum, dealerUpcard, usableAce);
    if (!this.Q[key]) return null;
    const qVals = this.Q[key];
    const best  = Math.max(...qVals);
    return { action: qVals.indexOf(best), qValues: qVals, visits: this.N[key] };
  }

  updateFromEpisode(trajectory, finalReward) {
    const seen = new Set();
    for (let t = 0; t < trajectory.length; t++) {
      const { state, action } = trajectory[t];
      const saKey = `${state}_${action}`;
      if (seen.has(saKey)) continue;
      seen.add(saKey);

      this.initState(state);
      this.N[state][action]++;
      const n = this.N[state][action];
      this.Q[state][action] += (finalReward - this.Q[state][action]) / n;
    }

    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    this.totalEpisodes++;

    if (finalReward > 0) this.winCount++;
    else if (finalReward < 0) this.lossCount++;
    else this.pushCount++;

    this.rewardHistory.push(finalReward);
    if (this.rewardHistory.length > 10000) this.rewardHistory.shift();
  }

  runEpisode() {
    const shoe = buildShoe(6);
    let shoeIdx = 0;
    const deal = () => shoe[shoeIdx++];

    const playerHand = [deal(), deal()];
    const dealerHand = [deal(), deal()];
    const dealerUp   = Math.min(handValue([dealerHand[0]]), 11);
    const trajectory = [];

    const playerBJ = isBlackjack(playerHand);
    const dealerBJ = isBlackjack(dealerHand);

    if (playerBJ || dealerBJ) {
      let reward = 0;
      if (playerBJ && !dealerBJ) reward = 1.5;
      else if (!playerBJ && dealerBJ) reward = -1;
      this.updateFromEpisode(trajectory, reward);
      return reward;
    }

    let doubled = false;
    let bust    = false;

    while (true) {
      const pSum = handValue(playerHand);
      const ace  = hasUsableAce(playerHand);
      const allowDouble = playerHand.length === 2 && !doubled;
      const state  = this.stateKey(pSum, dealerUp, ace);
      const action = this.chooseAction(pSum, dealerUp, ace, allowDouble);
      trajectory.push({ state, action });

      if (action === ACTIONS.STAND) break;
      if (action === ACTIONS.DOUBLE) {
        doubled = true;
        playerHand.push(deal());
        break;
      }
      playerHand.push(deal());
      if (isBusted(playerHand))        { bust = true; break; }
      if (handValue(playerHand) === 21) break;
    }

    if (bust) {
      const reward = doubled ? -2 : -1;
      this.updateFromEpisode(trajectory, reward);
      return reward;
    }

    while (handValue(dealerHand) < 17 ||
           (handValue(dealerHand) === 17 && hasUsableAce(dealerHand))) {
      dealerHand.push(deal());
    }

    const pFinal   = handValue(playerHand);
    const dFinal   = handValue(dealerHand);
    const dealerBust = isBusted(dealerHand);

    let reward;
    if (dealerBust || pFinal > dFinal)     reward = doubled ? 2 : 1;
    else if (pFinal === dFinal)            reward = 0;
    else                                   reward = doubled ? -2 : -1;

    this.updateFromEpisode(trajectory, reward);
    return reward;
  }

  train(episodes = 1000) {
    const startTime = Date.now();
    let totalReward = 0;
    for (let i = 0; i < episodes; i++) totalReward += this.runEpisode();
    return {
      episodes,
      totalEpisodes: this.totalEpisodes,
      avgReward:     totalReward / episodes,
      epsilon:       this.epsilon,
      elapsed:       Date.now() - startTime,
      winRate:       this.winCount  / (this.totalEpisodes || 1),
      lossRate:      this.lossCount / (this.totalEpisodes || 1),
      pushRate:      this.pushCount / (this.totalEpisodes || 1),
      statesLearned: Object.keys(this.Q).length,
    };
  }

  getPolicyTable() {
    const table = {};
    for (let ps = 4; ps <= 21; ps++) {
      for (const du of [2,3,4,5,6,7,8,9,10,11]) {
        for (const ace of [false, true]) {
          const result = this.policyAction(ps, du, ace);
          if (result) {
            const k = `${ps}_${du}_${ace ? 1 : 0}`;
            table[k] = {
              playerSum:  ps,
              dealerUp:   du,
              usableAce:  ace,
              action:     result.action,
              actionName: ACTION_NAMES[result.action],
              qValues:    result.qValues.map(v => +v.toFixed(4)),
              visits:     result.visits,
            };
          }
        }
      }
    }
    return table;
  }

  getRewardCurve(bins = 100) {
    const hist = this.rewardHistory;
    if (hist.length < 2) return [];
    const binSize = Math.max(1, Math.floor(hist.length / bins));
    const curve = [];
    for (let i = 0; i < hist.length; i += binSize) {
      const slice = hist.slice(i, i + binSize);
      curve.push(+(slice.reduce((a,b)=>a+b,0)/slice.length).toFixed(4));
    }
    return curve;
  }

  getDatasetStats() { return this.datasetStats; }

  toJSON() {
    return {
      Q: this.Q, N: this.N,
      epsilon: this.epsilon,
      totalEpisodes: this.totalEpisodes,
      winCount: this.winCount, lossCount: this.lossCount, pushCount: this.pushCount,
      rewardHistory: this.rewardHistory.slice(-1000),
    };
  }

  fromJSON(data) {
    this.Q = data.Q || {};
    this.N = data.N || {};
    this.epsilon       = data.epsilon ?? 1.0;
    this.totalEpisodes = data.totalEpisodes || 0;
    this.winCount      = data.winCount  || 0;
    this.lossCount     = data.lossCount || 0;
    this.pushCount     = data.pushCount || 0;
    this.rewardHistory = data.rewardHistory || [];
    return this;
  }
}

module.exports = { MonteCarloAgent, ACTIONS, ACTION_NAMES };
