# Gully Mole

A 2D top-down, real-time multiplayer party game for the browser. Two teams, Blue and Green, race to grab the potli from the middle of the map and bring it to their den, while each team secretly carries a spy from the other side.

- Rules: [`docs/GDD.md`](docs/GDD.md) (source of truth; "Police/Chor" in it now means Blue/Green, see D20)
- Rulings on unclear rules: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Look and feel: [`docs/ART.md`](docs/ART.md), pictures in `docs/design/images/`

## Status

| Milestone | State |
| --- | --- |
| M0 Scaffold: rooms by 4-digit code, lobby, host start, dev bots | ✅ done |
| M1 Movement: map, blobs, server-authoritative movement, prediction, joystick, wandering bots | ✅ done |
| M2 Capture the object | next |
| M3–M6 | not started |

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

Open http://localhost:5173, type a nickname and press **Create room**. Share the 4-digit code (tap it to copy an invite link). The host presses **Start game** once there are 8+ players.

### Controls

| Device | Move |
| --- | --- |
| Laptop | WASD or arrow keys |
| Phone / tablet | Touch anywhere on the **left side** and drag: a joystick appears under your thumb. Push further to go faster. |

Phones work best held sideways (landscape). The right side of the screen is kept free for action buttons (M2).

### Testing alone

- **Several tabs:** each browser tab is a separate player. Open the invite link in new tabs.
- **Dev bots:** as host, press **Fill with bots** to reach 8 players, or **+1 bot**. In a round, bots wander the map. Bots are on by default in development and off when `NODE_ENV=production` (set `ALLOW_BOTS=true` to force them on).
- **Debug:** in development, the browser console has `window.__gully.room.state` (live room state).
- **See the whole map:** in development, open http://localhost:5173/?overview to zoom out to the full map. It's for testing only; real players always get the follow camera.

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

## How movement works

1. Your device sends only **inputs** (joystick direction), 20 times a second. It never sends a position.
2. The **server** runs `stepPlayer()` (in `shared/src/movement.ts`) once per input and decides where you really are. Walls are checked there, so nobody can cheat through them.
3. To feel instant, **your own blob is predicted**: the browser runs the same `stepPlayer()` right away. When the server's answer arrives, any small difference is corrected quietly.
4. **Other players are interpolated**: drawn smoothly between the positions the server sends, so they glide instead of jumping.
5. The **camera** follows you, zoomed so every screen shows 650 map units of height (bigger screens show bigger blobs, not more map).

## Project layout

```
gully-mole/
├── shared/   Code both sides use
│   └── src/
│       ├── config.ts    ← every tunable number (speeds, timers, distances, team names, weights…)
│       ├── map.ts       the map as data (Blue half written out, Green half = turned 180°)
│       ├── movement.ts  the one movement step + wall collisions (server AND client run it)
│       ├── teams.ts     random team split + spawn spots
│       ├── lobby.ts     lobby rules: room codes, nicknames, start check, host hand-over, round timer
│       ├── schema.ts    the synced room state + the input message
│       └── messages.ts  message names between client and server
├── server/   Colyseus game server (all game decisions happen here)
│   ├── src/rooms/GullyRoom.ts   lobby + 20-ticks/second simulation
│   ├── src/bots.ts              dev bot "brains"
│   └── test/                    integration tests against a real in-process server
├── client/   Phaser website (sends inputs, shows state)
│   ├── index.html       home + lobby screens (plain HTML, phone friendly)
│   └── src/
│       ├── main.ts      screen flow and lobby rendering
│       ├── net.ts       connecting, joining by code, reconnect after refresh
│       └── game/        GameScene (prediction, camera), Blob, map drawing, controls
└── docs/
```

## Tuning

Edit `shared/src/config.ts` and restart `npm run dev`. Everything you'll tune after play-tests is there (speed, blob size, vision, camera height, timers…).

## Tech

TypeScript · npm workspaces · Phaser 4 · Colyseus 0.18 · Vite · Vitest. All free and open source.
