// ═══════════════════════════════════════════════
//  server.js  —  Express REST API
//  Blackjack MC RL — Backend
// ═══════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const path = require('path');
const { MonteCarloAgent } = require('./agent');
const { startGame, hit, stand, doubleDown, resetBalance, newHand } = require('./session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

// ── Global shared MC agent (pre-trained) ─────────────────────
const agent = new MonteCarloAgent({ epsilon: 1.0, epsilonDecay: 0.99995 });

// Pre-train agent on startup (50k episodes)
console.log('🧠 Pre-training MC agent (50,000 episodes)...');
const t0 = Date.now();
agent.train(50000);
console.log(`✅ Agent ready in ${Date.now() - t0}ms — ${agent.totalEpisodes} episodes, ε=${agent.epsilon.toFixed(3)}`);

// ══════════════════════════════════════════════
//  AGENT ROUTES
// ══════════════════════════════════════════════

// GET /api/agent/status — agent stats
app.get('/api/agent/status', (req, res) => {
  res.json({
    totalEpisodes: agent.totalEpisodes,
    epsilon: +agent.epsilon.toFixed(4),
    statesLearned: Object.keys(agent.Q).length,
    winRate: +(agent.winCount / (agent.totalEpisodes || 1)).toFixed(4),
    lossRate: +(agent.lossCount / (agent.totalEpisodes || 1)).toFixed(4),
    pushRate: +(agent.pushCount / (agent.totalEpisodes || 1)).toFixed(4),
    winCount: agent.winCount,
    lossCount: agent.lossCount,
    pushCount: agent.pushCount,
  });
});

// POST /api/agent/train — trigger more training
app.post('/api/agent/train', (req, res) => {
  const episodes = Math.min(Math.max(100, req.body.episodes || 1000), 50000);
  const stats = agent.train(episodes);
  res.json({ ok: true, stats });
});

// GET /api/agent/policy — full learned policy table
app.get('/api/agent/policy', (req, res) => {
  res.json({ policy: agent.getPolicyTable() });
});

// GET /api/agent/recommend — ask agent for action given state
app.get('/api/agent/recommend', (req, res) => {
  const playerSum = parseInt(req.query.playerSum);
  const dealerUp = parseInt(req.query.dealerUp);
  const usableAce = req.query.usableAce === 'true';

  if (isNaN(playerSum) || isNaN(dealerUp)) {
    return res.status(400).json({ error: 'playerSum and dealerUp are required numbers' });
  }

  const result = agent.policyAction(playerSum, dealerUp, usableAce);
  if (!result) {
    return res.json({ action: null, message: 'State not yet learned' });
  }

  const NAMES = ['Stand', 'Hit', 'Double'];
  res.json({
    playerSum,
    dealerUp,
    usableAce,
    action: result.action,
    actionName: NAMES[result.action],
    qValues: result.qValues,
    visits: result.visits,
    confidence: Math.max(...result.visits) > 10 ? 'high' : 'low',
  });
});

// GET /api/agent/curve — reward learning curve
app.get('/api/agent/curve', (req, res) => {
  const bins = parseInt(req.query.bins) || 100;
  res.json({ curve: agent.getRewardCurve(bins) });
});

// POST /api/agent/reset — reset agent
app.post('/api/agent/reset', (req, res) => {
  Object.keys(agent.Q).forEach(k => delete agent.Q[k]);
  Object.keys(agent.N).forEach(k => delete agent.N[k]);
  agent.epsilon = 1.0;
  agent.totalEpisodes = 0;
  agent.rewardHistory = [];
  agent.winCount = 0; agent.lossCount = 0; agent.pushCount = 0;
  res.json({ ok: true, message: 'Agent reset' });
});

// ══════════════════════════════════════════════
//  GAME ROUTES
// ══════════════════════════════════════════════

// POST /api/game/start — start a new hand
app.post('/api/game/start', (req, res) => {
  const { sessionId, bet } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const result = startGame(sessionId, bet || 10);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// POST /api/game/hit
app.post('/api/game/hit', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const result = hit(sessionId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// POST /api/game/stand
app.post('/api/game/stand', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const result = stand(sessionId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// POST /api/game/double
app.post('/api/game/double', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const result = doubleDown(sessionId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// POST /api/game/new-hand — reset to idle for next deal
app.post('/api/game/new-hand', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  res.json(newHand(sessionId));
});

// POST /api/game/reset-balance
app.post('/api/game/reset-balance', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  res.json(resetBalance(sessionId));
});

// ── Health check ──────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ── Catch-all → frontend ──────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🃏 Blackjack RL server running → http://localhost:${PORT}`);
});
