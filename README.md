# 🃏 Blackjack · Monte Carlo RL

A full-stack Blackjack web app powered by a **Monte Carlo Reinforcement Learning agent** pre-seeded with **887,448 real hands** from a Kaggle dataset. Play Blackjack, train the AI, and watch it learn optimal strategy in real time.

🔗 **Live Demo → [blackjack-rl-a1wa.onrender.com](https://blackjack-rl-a1wa.onrender.com)**

---

## 🗂️ Project Structure

```
blackjack-rl/
├── backend/
│   ├── server.js              ← Express REST API (12 routes)
│   ├── agent.js               ← Monte Carlo RL algorithm
│   ├── blackjack.js           ← Core game engine (6-deck shoe)
│   ├── session.js             ← Live game session manager
│   ├── process_dataset.js     ← Kaggle CSV processor
│   ├── dataset_seeds.json     ← Q-value seeds from 887k hands
│   ├── dataset_stats.json     ← Real statistics from dataset
│   └── package.json
├── frontend/
│   └── public/
│       └── index.html         ← Full casino frontend (single file)
└── README.md
```

---

## 🚀 Quickstart

```bash
# 1. Clone the repo
git clone https://github.com/chirayu08/blackjack-rl.git
cd blackjack-rl

# 2. Install dependencies
cd backend && npm install

# 3. Start the server
node server.js

# 4. Open in browser
# → http://localhost:3000
```

---

## 🧠 How the RL Agent Works

### Algorithm — First-Visit Monte Carlo Control

The agent uses **Monte Carlo Control with ε-greedy exploration**:

| Step | Description |
|------|-------------|
| **1. Generate Episode** | Play a full Blackjack hand using current policy |
| **2. Record Trajectory** | Save every (state, action) pair during play |
| **3. Calculate Return** | Final reward propagated back to all visited states |
| **4. Update Q-values** | `Q(s,a) ← Q(s,a) + (R − Q(s,a)) / N(s,a)` |
| **5. Decay Epsilon** | Reduce exploration rate → more exploitation over time |

### State Space

Each state is defined by 3 values:

| Variable | Range | Description |
|----------|-------|-------------|
| `playerSum` | 4–21 | Player's current hand total |
| `dealerUpcard` | 2–11 | Dealer's visible card (11 = Ace) |
| `usableAce` | true/false | Whether player has a soft hand |

### Actions & Rewards

| Action | Code |
|--------|------|
| Stand  | 0    |
| Hit    | 1    |
| Double | 2    |

| Outcome | Reward |
|---------|--------|
| Win | +1 |
| Loss | −1 |
| Push | 0 |
| Blackjack | +1.5 |
| Doubled Win | +2 |
| Doubled Loss | −2 |

### Dataset Pre-Seeding

Before any training the agent's Q-table is seeded from **887,448 real Blackjack hands** (Kaggle dataset). This means:

- The agent starts with a near-optimal policy instead of from random
- Epsilon starts at **0.3** instead of 1.0 (less exploration needed)
- Only ~10,000 additional episodes needed to fully converge

---

## 📊 Dataset

**Source:** [900,000 Hands of Blackjack Results](https://www.kaggle.com/datasets/mojocolors/900000-hands-of-blackjack-results) — Kaggle

| Stat | Value |
|------|-------|
| Total hands | 887,448 |
| Win rate | 43.3% |
| Loss rate | 47.9% |
| Push rate | 8.8% |
| Player bust rate | 17.7% |
| Dealer bust rate | 41.8% |
| Blackjack rate | 4.8% |
| House edge | ~0.5% |

### Processing the Dataset

To regenerate seeds from the raw CSV:

```bash
cd backend
node process_dataset.js path/to/blackjack_hands.csv
# Outputs: dataset_seeds.json + dataset_stats.json
```

---

## 🌐 API Reference

### Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agent/status` | Training stats, win/loss rates, epsilon |
| POST | `/api/agent/train` | Train N more episodes `{ episodes: 10000 }` |
| GET | `/api/agent/policy` | Full Q-table for all learned states |
| GET | `/api/agent/recommend` | Recommended action for a given state |
| GET | `/api/agent/curve` | Smoothed reward learning curve |
| GET | `/api/agent/dataset-stats` | Real stats from the Kaggle dataset |
| POST | `/api/agent/reset` | Reset agent to untrained state |

### Game

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/game/start` | `{ sessionId, bet }` | Deal a new hand |
| POST | `/api/game/hit` | `{ sessionId }` | Player hits |
| POST | `/api/game/stand` | `{ sessionId }` | Player stands |
| POST | `/api/game/double` | `{ sessionId }` | Double down |
| POST | `/api/game/new-hand` | `{ sessionId }` | Reset to idle |
| POST | `/api/game/reset-balance` | `{ sessionId }` | Refill to $1,000 |

---

## 🎮 Features

- **Casino-style game** — chips, felt table, card animations, 3:2 blackjack payout, H17 dealer rules
- **AI Hint button** — ask the trained agent what it recommends for your hand
- **Policy heatmap** — visualise learned Hit/Stand/Double per state (hard & soft hands)
- **Live training dashboard** — train on demand, watch reward curve, epsilon decay
- **Real dataset stats** — Analysis tab powered by 887k real hands
- **Multi-user sessions** — each player gets their own session, auto-cleanup after 30 min
- **Balance validation** — bet is blocked if it exceeds current balance

---

## 🚀 Deployment

Deployed on **Render** (free tier):

```
Start command: node server.js
Root directory: backend
Build command: npm install
```

> ⚠️ Free tier spins down after 15 min inactivity. First load may take ~30 seconds to wake up. Use [UptimeRobot](https://uptimerobot.com) to keep it alive for free.

---

## 📚 References

- Sutton & Barto — *Reinforcement Learning: An Introduction*, Ch. 5 (Monte Carlo Methods)
- [Wizard of Odds — Basic Strategy](https://wizardofodds.com/games/blackjack/strategy/4-decks/)
- [Kaggle Dataset — 900k Blackjack Hands](https://www.kaggle.com/datasets/mojocolors/900000-hands-of-blackjack-results)

---

## 📄 License

MIT — free to use, modify, and share.
