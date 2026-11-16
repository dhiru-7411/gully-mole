# Gully Mole: Claude Code kickoff

## Before you start (one time)

1. Install **Node.js** (LTS version) and **Git**.
2. Install **Claude Code**. Instructions: https://docs.claude.com/en/docs/claude-code
3. Make a folder called `gully-mole`, create a `docs` folder inside it, and put `GDD.md` there (`gully-mole/docs/GDD.md`).
4. Open a terminal in `gully-mole`, run `claude`, and paste the prompt below.

---

## The prompt (copy everything below this line)

You're building **Gully Mole**, a 2D top-down, real-time multiplayer party game that runs in the browser. The full game design is in `docs/GDD.md`. Read it completely before doing anything. It is the source of truth for every rule.

### Hard constraints
- **Website only, $0.** Free and open-source tools only. No paid services, accounts or APIs without asking me first.
- **Stack:** TypeScript monorepo (npm workspaces) with three parts:
  - `client`: Phaser 3 + Vite
  - `server`: Colyseus on Node.js
  - `shared`: types, constants and the game config used by both
  Check the current stable versions of Phaser and Colyseus and use their current APIs.
- **Server-authoritative.** All game logic (movement validation, tagging, freezing, snatching, arrests, scoring) runs on the server. Clients send inputs only.
- **Secrets never leave the server.** Each client gets only what its player may know. That means its own role, what its team may know (for example, the Detective badge is visible to the Detective's team, which includes the spy hiding in it), and the entities inside its vision: a radius, blocked by obstacles (line of sight). Use per-client state filtering (Colyseus StateView or equivalent). A player must never be able to find a spy by inspecting network traffic.
- **Mobile first.** On-screen joystick plus action buttons on phones, keyboard on desktop. It must work in phone browsers (Android Chrome, iPhone Safari).
- **Minimal art.** Simple shapes, a few colors, one icon per state. Kenney CC0 assets are optional.
- **One config file** for every tunable number: vision radius, speeds, Leader speed bonus, tag/hand-off/snatch distances, snatch countdown (default 3 s), frozen hand and footprints (20 s), Leader auto-thaw (10 s) and protection (2–3 s), huddle length (2–3 min) and count (2), round timer formula, and scoring weights (placeholder 1 each). I'll tune these after playtests.
- **No accounts.** Create or join a room with a 4-digit code and a nickname.

### How we work
- Build in the milestones below. At the end of each milestone:
  1. Run it and make sure it works.
  2. Add or update unit tests (Vitest) for the game-logic rules.
  3. Update `README.md` with how to run it.
  4. Commit to git.
  5. Give me a short summary, plus a checklist of what I should test by hand.
  6. **Stop and wait for my go-ahead.**
- **Dev bots:** add server-side bots that join and wander, tag, carry and so on, so I can test a full 8-player game alone. Opening several browser tabs should also work.
- If a rule in the GDD is unclear or conflicts with another rule, don't guess silently. List it, propose an answer, and ask me. Record every decision in `docs/DECISIONS.md`.
- Keep the code simple and readable. I'm learning as we go, so explain the important parts briefly in the summaries.

### Milestones
- **M0 Scaffold.** Monorepo set up, and `npm run dev` starts both client and server. Create/join a room by code, a lobby with the player list, and the host starts the game.
- **M1 Movement.** The map: two halves, two bases, middle zone, two fireplaces, obstacles and lanes. Smooth server-authoritative movement with client prediction and interpolation, collisions, joystick and keyboard.
- **M2 Capture the object.** Object pickup; it drops where the carrier gets frozen; hand-off only to an adjacent teammate; enemy snatch with a countdown; win by bringing it home. Tagging only on your own half. The Leader's fire lamp unfreezes. Leader auto-thaw, alert, arrow to the Leader and short protection. Leader speed bonus. Leader-only arrow to the object. Round timer formula. Wipe-out win. Disconnect behavior.
- **M3 Roles and secrets.** Random roles following the team-size table. Limited vision filtered on the server. Spy: secret freeze, frozen hand, fireplace melt, footprints, secret unfreeze of the real team, silent pass with automatic reveal if a fake teammate sees it, whisper channel. Detective: frozen-teammate notification, handcuffs, right/wrong arrest, Shame freeze, drag to fireplace, Out. The three freeze visuals.
- **M4 Communication.** Leader huddles (2 per round, not while frozen; the game and timer pause; each team gets its own chat for 2–3 minutes). One-tap quick messages.
- **M5 End of round.** Stat tracking for every scoring factor. Timeout winner. Reveal screen. Peer awards: each player gives 3–5 awards to opponents, the default 5 plus a settings list, situational awards only when they happened, honesty bonus, MVP.
- **M6 Deploy.** Client to Netlify or GitHub Pages, server to Render's free tier. Write step-by-step instructions for me, since I'll create the accounts myself.

**Start now:** read `docs/GDD.md`, reply with the folder structure and your M0 plan in a short message, then build M0.
