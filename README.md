# Gully Mole

A 2D top-down, real-time multiplayer party game for the browser. Two teams, Blue and Green, race to grab the potli from the middle of the map and carry it into the other team's den (like scoring a goal), while each team secretly carries a spy from the other side.

- Rules: [`docs/GDD.md`](docs/GDD.md) (source of truth; "Police/Chor" in it now means Blue/Green, see D20)
- Rulings on unclear rules: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Look and feel: [`docs/ART.md`](docs/ART.md), pictures in `docs/design/images/`

## Status

| Milestone | State |
| --- | --- |
| M0 Scaffold: rooms by 4-digit code, lobby, host start, dev bots | ✅ done |
| M1 Movement: map, blobs, server-authoritative movement, prediction, joystick, wandering bots | ✅ done |
| M2 Capture the object: potli, tag/freeze, Leader's lamp, snatch, pass, timer, winning, smarter bots | ✅ done |
| M3 Roles and secrets: Detective, spies, limited vision, per-player views, arrests, rescues | ✅ done |
| M4 Communication: Leader huddles (pause + team chat), one-tap quick messages | ✅ done |
| M5 End of round: stats for every factor, timeout winner, reveal, peer awards, honesty bonus, MVP | ✅ done |
| M6 Deploy (Netlify + Render, step-by-step guide) | next |

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

| | Laptop | Phone / tablet |
| --- | --- | --- |
| Move | WASD or arrow keys | Touch anywhere on the **left side** and drag: a joystick appears under your thumb |
| Big smart button | **Space** | Big round button, bottom right |
| Role button | **Q** | Purple-ish round button (only shows when your role can act) |
| Pass | **E** | Small **Pass** button (only shows when you can pass) |
| Whisper (spy only) | **Enter** | **Whisper** button |
| Huddle (Leader only) | **H** | **Huddle (2)** button, top left |
| Quick messages | **1–4** | Chips on the right edge |

The big button's label changes to what you can do right now (D32). If two things are possible, the more urgent one wins:

| Label | When |
| --- | --- |
| **Unfreeze** | You're the Leader, beside a frozen teammate |
| **Tag** | An enemy standing on **your** half is within reach: freezes them. Then a **10 s cooldown** before your next tag (the button shows "Tag 7…") |
| **Snatch** | Beside an enemy carrying the potli: a 3 s countdown starts, and stay beside them to take it |
| **Grab** | Standing on the loose potli |

### How a round works (M2)

- Teams and one Leader per team are picked at random. Everyone spawns in their own den.
- **Score by carrying the potli into the enemy's den** (far end of their half, D39). Defend your own den.
- You can only tag enemies who stand on **your** half. Frozen players drop the potli and can't move.
- Only your **Leader** can unfreeze you. A frozen Leader thaws by themselves after 10 s and is protected for a moment. Teammates see an arrow to a frozen Leader, and the Leader always sees an arrow to the potli.
- Carrying slows you down (D38). A Leader carrying it is faster, unless a teammate is frozen.
- **Win by:** scoring, or freezing the whole other team at once (wipe-out). If time runs out, the better automatic stats score wins (M5).
- After a round, the host presses **Back to lobby** to play again.

### After the round (M5)

1. **The reveal:** who won and why, both teams' **stats scores** (every factor from the GDD table, expandable), who the spies and Detectives were, and the key moments.
2. **Peer awards:** everyone hands out **3–5 awards to opponents**: Ate and Left No Crumbs, Lowkey Carried, NPC Energy, Ice Cold Rizz, Sus Since Minute One, plus the optional ones (Delulu Detective, Fumbled the Bag, Main Character Syndrome, Professional Yapper, Caught in 4K). Situational awards only appear if that moment happened. The host can switch optional awards off in the lobby.
3. **Results:** every award is a point (roasts too). Picks that match the stats earn an **honesty bonus**. The most points is the round's **MVP**. Awards never change which team won.

Scoring weights are in `shared/src/config.ts` (`scoring`, all 1 for now); the factor list is in `shared/src/awards.ts`.

### Talking (M4)

- **Huddles:** only a Leader can call one (2 per round, not while frozen). The **whole game and the timer pause**, and each team gets its own private chat for 2.5 minutes. The spy sits in their fake team's huddle and hears everything. The Leader who called it can end it early.
- **Quick messages:** one tap (or keys 1–4) sends "Spy near the fire!", "Leader frozen!", "Potli on the left!" or "Trust me bro" to your team, as a speech bubble and a feed line.
- **Whisper:** the spy's private line to their real team (M3).

### Roles and secrets (M3)

Each team gets a **Leader**, a **Detective**, a **spy** planted by the other team (two for teams of 7+), and Normal players. A private role card tells you yours at the start of the round.

| Role | Role button (Q) | Notes |
| --- | --- | --- |
| Detective | **Arrest** a teammate in reach | Right: the spy goes **Out** (grey ice). Wrong: you're **shame-frozen** (dark red). A second wrong arrest puts you Out. You get pinged when a teammate is frozen. |
| Spy | **Ice** a fake teammate (anywhere), **Free** a frozen real teammate | Icing costs you an **iced hand** for 20 s (melts at a fireplace) and leaves **footprints**. You can't score. **Pass** to your real team silently, but if a fake teammate sees it, you're exposed. **Whisper** to your real team. |
| Anyone | **Drag** a shame-frozen Detective of your team | Haul them to a fireplace to free them (once per round). |

**Limited vision:** you only see what's inside your circle and not behind walls. Outside it the map is dimmed. The server only sends your device what you're allowed to see (`server/src/views.ts`), so nobody can find the spy by inspecting network traffic. `server/test/privacy.test.ts` checks this against a live round.

Phones work best held sideways (landscape).

### Testing alone

- **Several tabs:** each browser tab is a separate player. Open the invite link in new tabs.
- **Dev bots:** as host, press **Fill with bots** to reach 8 players, or **+1 bot**. In a round, bots play positions (defenders, attackers, Leader rescues), play their secret roles, and press the same buttons you do. The lobby switch **Easy bots** (on by default) stops bots grabbing the potli, so you can explore roles without them ending the round in seconds. Bots are on by default in development and off when `NODE_ENV=production` (set `ALLOW_BOTS=true` to force them on).
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
5. The **camera** follows you, zoomed so every screen shows 520 map units of height (bigger screens show bigger blobs, not more map).

## Project layout

```
gully-mole/
├── shared/   Code both sides use
│   └── src/
│       ├── config.ts    ← every tunable number (speeds, timers, distances, team names, weights…)
│       ├── map.ts       the map as data (Blue half written out, Green half = turned 180°)
│       ├── movement.ts  the one movement step + wall collisions (server AND client run it)
│       ├── rules.ts     who can tag / unfreeze / snatch / grab / pass / arrest / ice / free / drag right now
│       ├── roles.ts     Leader, Detective, spies per team (GDD table)
│       ├── vision.ts    line of sight: what blocks vision (server filters, client draws fog)
│       ├── teams.ts     random team split + spawn spots
│       ├── lobby.ts     lobby rules: room codes, nicknames, start check, host hand-over, round timer
│       ├── schema.ts    the synced room state + the input message
│       └── messages.ts  message names between client and server
├── server/   Colyseus game server (all game decisions happen here)
│   ├── src/rooms/GullyRoom.ts   lobby + 20-ticks/second simulation
│   ├── src/game/round.ts        one round: actions, roles, spy tricks, arrests, rescues, timers, win checks
│   ├── src/views.ts             PRIVACY: what each player's device receives, every tick
│   ├── src/bots.ts              dev bot "brains" (defenders / attackers / Leader)
│   ├── src/nav.ts               bot pathfinding through the lanes (flow fields)
│   └── test/                    integration tests against a real in-process server
├── client/   Phaser website (sends inputs, shows state)
│   ├── index.html       home + lobby screens (plain HTML, phone friendly)
│   └── src/
│       ├── main.ts      screen flow and lobby rendering
│       ├── net.ts       connecting, joining by code, reconnect after refresh
│       └── game/        GameScene (prediction, camera, fog, arrows), Blob, Potli, HUD (buttons, role card, end reveal), feed, controls
└── docs/
```

## Tuning

Edit `shared/src/config.ts` and restart `npm run dev`. Everything you'll tune after play-tests is there (speed, blob size, vision, camera height, timers…).

## Tech

TypeScript · npm workspaces · Phaser 4 · Colyseus 0.18 · Vite · Vitest. All free and open source.
