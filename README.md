# Gully Mole

A 2D top-down, real-time multiplayer party game for the browser: Police vs Chor race to grab one object and bring it home, while each team secretly carries a spy from the other side.

- Rules: [`docs/GDD.md`](docs/GDD.md) (source of truth)
- Rulings on unclear rules: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## Status

| Milestone | State |
| --- | --- |
| M0 Scaffold: rooms by 4-digit code, lobby, host start, dev bots | ✅ done |
| M1 Movement | next |
| M2–M6 | not started |

## Requirements

- Node.js 22+ (tested on 24)
- npm 10+

## Run it locally

```bash
npm install
npm run dev
```

This starts both parts:

- **Game server** (Colyseus): http://localhost:2567 (health check: `/health`)
- **Website** (Vite + Phaser): http://localhost:5173

Open http://localhost:5173, type a nickname and press **Create room**. Share the 4-digit code (tap it to copy an invite link).

### Testing alone

- **Several tabs:** each browser tab is a separate player. Open the invite link in new tabs.
- **Dev bots:** as host, press **Fill with bots** to reach 8 players, or **+1 bot**. Bots are on by default in development and off when `NODE_ENV=production` (set `ALLOW_BOTS=true` to force them on).

### Testing on your phone

Your phone must be on the same wifi as your computer.

1. Run `npm run dev`. Vite prints a `Network:` address like `http://192.168.1.23:5173`.
2. Open that address on your phone. The client automatically talks to the server on the same address, port 2567.
3. If it can't connect, allow Node through your computer's firewall.

## Tests

```bash
npm test          # all Vitest tests (unit + server integration)
npm run typecheck # TypeScript checks for all three packages
```

## Project layout

```
gully-mole/
├── shared/   Code both sides use
│   └── src/
│       ├── config.ts    ← every tunable number (speeds, timers, distances, weights…)
│       ├── lobby.ts     pure lobby rules: room codes, nicknames, start check, host hand-over, round timer
│       ├── schema.ts    the synced room state (what clients receive)
│       └── messages.ts  message names between client and server
├── server/   Colyseus game server (all game decisions happen here)
│   ├── src/rooms/GullyRoom.ts
│   └── test/            integration tests against a real in-process server
├── client/   Phaser website (sends requests, shows state)
│   ├── index.html       home + lobby screens (plain HTML, phone friendly)
│   └── src/
│       ├── main.ts      screen flow and lobby rendering
│       ├── net.ts       connecting, joining by code, reconnect after refresh
│       └── game/        Phaser scenes
└── docs/
```

## Tuning

Edit `shared/src/config.ts` and restart `npm run dev`. Everything you'll tune after play-tests is there.

## Tech

TypeScript · npm workspaces · Phaser 4 · Colyseus 0.18 · Vite · Vitest. All free and open source.
