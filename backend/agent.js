// ═══════════════════════════════════════════════
//  agent.js  —  Monte Carlo RL Agent
//  First-Visit MC Control with ε-greedy policy
//  Actions: 0=Stand, 1=Hit, 2=Double
// ═══════════════════════════════════════════════

const { buildShoe, handValue, hasUsableAce, isBusted, isBlackjack } = require('./blackjack');

const ACTIONS = { STAND: 0, HIT: 1, DOUBLE: 2 };
const ACTION_NAMES = ['Stand', 'Hit', 'Double'];

class MonteCarloAgent {
  constructor(options = {}) {
    this.Q = {};          // Q[state][action] = average return
    this.N = {};          // N[state][action] = visit count
    this.epsilon = options.epsilon ?? 1.0;
    this.epsilonMin = options.epsilonMin ?? 0.05;
    this.epsilonDecay = options.epsilonDecay ?? 0.99995;
    this.totalEpisodes = 0;
    this.rewardHistory = [];  // smoothed window
    this.winCount = 0;
    this.lossCount = 0;
    this.pushCount = 0;
  }

  // State key: "playerSum_dealerUp_usableAce"
  stateKey(playerSum, dealerUpcard, usableAce) {
    return `${playerSum}_${dealerUpcard}_${usableAce ? 1 : 0}`;
  }

  initState(key) {
    if (!this.Q[key]) {
      this.Q[key] = [0, 0, 0];  // Stand, Hit, Double
      this.N[key] = [0, 0, 0];
    }
  }

  // ε-greedy action selection
  chooseAction(playerSum, dealerUpcard, usableAce, allowDouble = true) {
    const key = this.stateKey(playerSum, dealerUpcard, usableAce);
    this.initState(key);

    if (Math.random() < this.epsilon) {
      // Explore: random action
      const validActions = allowDouble ? [0, 1, 2] : [0, 1];
      return validActions[Math.floor(Math.random() * validActions.length)];
    }

    // Exploit: best known action
    const qVals = this.Q[key];
    if (!allowDouble) {
      return qVals[0] >= qVals[1] ? 0 : 1;
    }
    return qVals.indexOf(Math.max(...qVals));
  }

  // Get greedy policy action (no exploration, for inference)
  policyAction(playerSum, dealerUpcard, usableAce) {
    const key = this.stateKey(playerSum, dealerUpcard, usableAce);
    if (!this.Q[key]) return null;
    const qVals = this.Q[key];
    const best = Math.max(...qVals);
    return { action: qVals.indexOf(best), qValues: qVals, visits: this.N[key] };
  }

  // Update Q-values from an episode's trajectory
  updateFromEpisode(trajectory, finalReward) {
    // First-visit MC: track which (state, action) pairs we've seen
    const seen = new Set();

    for (let t = 0; t < trajectory.length; t++) {
      const { state, action } = trajectory[t];
      const saKey = `${state}_${action}`;

      if (seen.has(saKey)) continue;  // skip non-first visits
      seen.add(saKey);

      this.initState(state);
      this.N[state][action]++;
      // Incremental mean update
      const n = this.N[state][action];
      this.Q[state][action] += (finalReward - this.Q[state][action]) / n;
    }

    // Decay epsilon
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
    this.totalEpisodes++;

    // Track outcomes
    if (finalReward > 0) this.winCount++;
    else if (finalReward < 0) this.lossCount++;
    else this.pushCount++;

    // Store reward history (keep last 10k)
    this.rewardHistory.push(finalReward);
    if (this.rewardHistory.length > 10000) this.rewardHistory.shift();
  }

  // Run a single training episode
  runEpisode() {
    const shoe = buildShoe(6);
    let shoeIdx = 0;
    const deal = () => shoe[shoeIdx++];

    // Deal initial hands
    const playerHand = [deal(), deal()];
    const dealerHand = [deal(), deal()];

    const dealerUp = Math.min(handValue([dealerHand[0]]), 11);
    const trajectory = [];

    // Check for blackjack immediately
    const playerBJ = isBlackjack(playerHand);
    const dealerBJ = isBlackjack(dealerHand);

    if (playerBJ || dealerBJ) {
      let reward = 0;
      if (playerBJ && !dealerBJ) reward = 1.5;
      else if (!playerBJ && dealerBJ) reward = -1;
      this.updateFromEpisode(trajectory, reward);
      return reward;
    }

    // Player turn
    let doubled = false;
    let bust = false;

    while (true) {
      const pSum = handValue(playerHand);
      const ace = hasUsableAce(playerHand);
      const allowDouble = playerHand.length === 2 && !doubled;
      const state = this.stateKey(pSum, dealerUp, ace);
      const action = this.chooseAction(pSum, dealerUp, ace, allowDouble);

      trajectory.push({ state, action });

      if (action === ACTIONS.STAND) break;

      if (action === ACTIONS.DOUBLE) {
        doubled = true;
        playerHand.push(deal());
        break;
      }

      // Hit
      playerHand.push(deal());
      if (isBusted(playerHand)) { bust = true; break; }
      if (handValue(playerHand) === 21) break;
    }

    if (bust) {
      const reward = doubled ? -2 : -1;
      this.updateFromEpisode(trajectory, reward);
      return reward;
    }

    // Dealer turn (H17)
    while (handValue(dealerHand) < 17 ||
           (handValue(dealerHand) === 17 && hasUsableAce(dealerHand))) {
      dealerHand.push(deal());
    }

    const pFinal = handValue(playerHand);
    const dFinal = handValue(dealerHand);
    const dealerBust = isBusted(dealerHand);

    let reward;
    if (dealerBust || pFinal > dFinal) reward = doubled ? 2 : 1;
    else if (pFinal === dFinal) reward = 0;
    else reward = doubled ? -2 : -1;

    this.updateFromEpisode(trajectory, reward);
    return reward;
  }

  // Run N training episodes, return summary stats
  train(episodes = 1000) {
    const startTime = Date.now();
    let totalReward = 0;
    for (let i = 0; i < episodes; i++) {
      totalReward += this.runEpisode();
    }
    return {
      episodes,
      totalEpisodes: this.totalEpisodes,
      avgReward: totalReward / episodes,
      epsilon: this.epsilon,
      elapsed: Date.now() - startTime,
      winRate: this.winCount / this.totalEpisodes,
      lossRate: this.lossCount / this.totalEpisodes,
      pushRate: this.pushCount / this.totalEpisodes,
      statesLearned: Object.keys(this.Q).length,
    };
  }

  // Get full policy table for visualisation
  getPolicyTable() {
    const table = {};
    const playerSums = Array.from({length: 18}, (_, i) => i + 4);  // 4-21
    const dealerUpcards = [2,3,4,5,6,7,8,9,10,11];
    const aces = [false, true];

    for (const ps of playerSums) {
      for (const du of dealerUpcards) {
        for (const ace of aces) {
          const key = this.stateKey(ps, du, ace);
          const result = this.policyAction(ps, du, ace);
          if (result) {
            const k = `${ps}_${du}_${ace ? 1 : 0}`;
            table[k] = {
              playerSum: ps,
              dealerUp: du,
              usableAce: ace,
              action: result.action,
              actionName: ACTION_NAMES[result.action],
              qValues: result.qValues.map(v => +v.toFixed(4)),
              visits: result.visits,
            };
          }
        }
      }
    }
    return table;
  }

  // Get smoothed reward history
  getRewardCurve(bins = 100) {
    const hist = this.rewardHistory;
    if (hist.length < 2) return [];
    const binSize = Math.max(1, Math.floor(hist.length / bins));
    const curve = [];
    for (let i = 0; i < hist.length; i += binSize) {
      const slice = hist.slice(i, i + binSize);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      curve.push(+avg.toFixed(4));
    }
    return curve;
  }

  // Serialise agent state for persistence
  toJSON() {
    return {
      Q: this.Q,
      N: this.N,
      epsilon: this.epsilon,
      totalEpisodes: this.totalEpisodes,
      winCount: this.winCount,
      lossCount: this.lossCount,
      pushCount: this.pushCount,
      rewardHistory: this.rewardHistory.slice(-1000),
    };
  }

  // Load from serialised state
  fromJSON(data) {
    this.Q = data.Q || {};
    this.N = data.N || {};
    this.epsilon = data.epsilon ?? 1.0;
    this.totalEpisodes = data.totalEpisodes || 0;
    this.winCount = data.winCount || 0;
    this.lossCount = data.lossCount || 0;
    this.pushCount = data.pushCount || 0;
    this.rewardHistory = data.rewardHistory || [];
    return this;
  }
}

module.exports = { MonteCarloAgent, ACTIONS, ACTION_NAMES };
