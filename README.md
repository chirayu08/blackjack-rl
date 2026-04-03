#Blackjack · Monte Carlo RL — Full Stack

A production-quality Blackjack web app with a real **Node.js backend**, a proper **Monte Carlo Reinforcement Learning algorithm**, and a polished casino-style frontend.

## Project Structure

```
blackjack-mc-rl/
├── backend/
│   ├── server.js       ← Express REST API (all routes)
│   ├── agent.js        ← Monte Carlo RL algorithm
│   ├── blackjack.js    ← Core game engine (shoe, hand logic)
│   ├── session.js      ← Live game session manager
│   └── package.json
├── frontend/
│   └── public/
│       └── index.html  ← Full casino frontend
└── package.json
```

## Quickstart

```bash
# 1. Install dependencies
cd backend && npm install

# 2. Start the server
npm start
# or for development with auto-reload:
npm run dev

# 3. Open in browser
open http://localhost:3000
```

## API Reference

### Agent

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/agent/status` | Training stats, win/loss rates |
| POST | `/api/agent/train` | Train N more episodes `{ episodes: 10000 }` |
| GET | `/api/agent/policy` | Full Q-table policy for all states |
| GET | `/api/agent/recommend?playerSum=16&dealerUp=7&usableAce=false` | Agent's recommended action |
| GET | `/api/agent/curve?bins=100` | Smoothed reward learning curve |
| POST | `/api/agent/reset` | Reset agent to untrained state |

### Game

| Method | Route | Body | Description |
|--------|-------|------|-------------|
| POST | `/api/game/start` | `{ sessionId, bet }` | Deal a new hand |
| POST | `/api/game/hit` | `{ sessionId }` | Player hits |
| POST | `/api/game/stand` | `{ sessionId }` | Player stands |
| POST | `/api/game/double` | `{ sessionId }` | Double down |
| POST | `/api/game/new-hand` | `{ sessionId }` | Reset to idle |
| POST | `/api/game/reset-balance` | `{ sessionId }` | Refill to $1000 |

## Features

- **Real MC RL Algorithm** — First-visit Monte Carlo control with ε-greedy exploration, incremental Q-value updates, epsilon decay
- **Live Casino Game** — Full Blackjack with chips, double down, 3:2 blackjack payout, H17 dealer rules
- **AI Hint System** — Ask the trained agent what it recommends for your current hand
- **Policy Heatmap** — Visual table of learned Hit/Stand/Double per state (hard & soft hands)
- **Training Dashboard** — Train on demand, watch reward curve, track win rates
- **Analysis Tab** — Win rates, EV charts, outcome distribution, basic strategy reference
- **Session Management** — Multi-user safe, 6-deck shoe, auto-reshuffle

## Deployment (Railway / Render / Fly.io)

```bash
# Set PORT env var, point start command to:
cd backend && node server.js
```

The backend serves the frontend statically — one process, one port.

## Algorithm Details

**State space**: `(playerSum, dealerUpcard, usableAce)` — ~360 possible states  
**Actions**: Stand (0), Hit (1), Double (2)  
**Reward**: +1 win, −1 loss, 0 push, +1.5 blackjack, ±2 doubled  
**Update rule**: Q(s,a) ← Q(s,a) + (R − Q(s,a)) / N(s,a)  
**Convergence**: ~50,000 episodes for stable hard-hand policy

## License
License This project is released under the MIT License.
