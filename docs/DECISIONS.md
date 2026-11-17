# Gully Mole — Design Decisions

Rulings on GDD rules that were unclear or conflicting. The GDD stays the source of truth; this file fills its gaps.

## Confirmed by owner (2026-11-16)

| # | Topic | Decision |
| --- | --- | --- |
| D1 | Tagging "on your own half" | The **target** must be on the tagger's half. The tagger's own position doesn't matter. |
| D2 | Spy and the object | The spy can pick up and carry the object, but entering any base while carrying it never wins. The spy has to hand it off. |
| D3 | Detective handcuffs | Reusable. The Detective can keep arresting until they go Out (second wrong arrest). This covers teams with 2 spies. |
| D4 | Team split | The server shuffles teams randomly every round. Odd counts are uneven (9 players = 5 vs 4). Spies per team follow that team's size (7+ = 2 spies). |

## Defaults (proposed, not objected to)

| # | Topic | Decision |
| --- | --- | --- |
| D5 | Spy's iced hand | While the hand is iced, the spy can't secretly freeze again until it thaws (20 s) or is melted at a fireplace. |
| D6 | What "seen" means | A fake teammate who isn't frozen and has the spy inside their vision radius with line of sight. Only a seen **silent pass** auto-reveals the spy. A seen secret freeze or unfreeze shows the witness a short visual cue (evidence only, no reveal). |
| D7 | Footprints | They don't show who made them, and anyone within vision can see them, not only the Detective. |
| D8 | Huddles | Both teams chat at the same time in separate rooms. Default length is 2.5 min (configurable), and the Leader who called it can end it early. |
| D9 | Shame drag | A teammate next to the Detective holds a "drag" button and moves at about 50% speed (configurable). |
| D10 | Frozen players | Can still use quick messages, the whisper channel and huddle chat. |
| D11 | Detective notification | Includes a ping on the map at the frozen teammate's position. |
| D12 | Tagging the spy | ~~The spy's real team can tag them under the normal tagging rules.~~ **Replaced by D54.** |
| D13 | Repo | Local git in `~/gully-mole`. A GitHub remote is added at M6 (deploy). |

## Made during M0 (tell me if you disagree)

| # | Topic | Decision |
| --- | --- | --- |
| D14 | Phaser version | The kickoff says "Phaser 3", but it also says to use current stable versions. Phaser 4.2.1 is the current stable release, and its API is nearly the same as Phaser 3's, so we use Phaser 4. |
| D15 | Room codes | 1000–9999 (no leading zero, so they read clearly over a call). The code is the Colyseus room id. |
| D16 | Joining mid-round | Not allowed: the room locks when the host starts. Players who drop out can rejoin their own seat (refresh-safe) for 5 min during a round, or 20 s in the lobby. |
| D17 | Host leaves | Host passes to the earliest-joined human who is still connected. Bots never host. |
| D18 | Dev bots | Bots count toward the 8-player minimum. Allowed unless `NODE_ENV=production` (override: `ALLOW_BOTS=true`). |
| D19 | Max players | 20 per room for now (configurable). |

## Art and map (owner, 2026-11-16) — details in `docs/ART.md`

| # | Topic | Decision |
| --- | --- | --- |
| D20 | Theme | The teams are **Blue** and **Green**, and each base is a **den** in its color. The Police/Chor theme is dropped from the visuals. The rules don't change: wherever the GDD says "Police" or "Chor", read "Blue team" or "Green team". |
| D21 | Characters | Style C: blobs with eyes, drawn with shapes in code. Blue team wears a cap, Green team a bandana, and green is lighter than blue so color-blind players can tell them apart. |
| D22 | Map size | The world grows from 1440×810 to 2400×1350, with 48 obstacles. Blob diameter is 44, vision radius 300. |
| D23 | Camera | Zoom is set per screen so everyone sees the same 650 units of height. Bigger screens make things bigger, not further-seeing. |
| D24 | Out view | A player who is Out keeps their own camera on their frozen blob, with normal vision. No spectating teammates, so nobody can leak info over voice. |
| D25 | Fog | Outside your vision the map is dimmed: walls and lanes stay visible. Players, the potli and clues are hidden, and the server never sends them. |
| D26 | Team names | Not final. "Blue" and "Green" are placeholders, kept in one place in `shared/src/config.ts` so a rename is a one-line change. |

## Made during M1 (tell me if you disagree)

| # | Topic | Decision |
| --- | --- | --- |
| D27 | Blobs and each other | Blobs pass through each other; only the map blocks movement. That way nobody can block a lane by standing in it, and a team can't body-wall its den. Tagging (M2) is about touching, not bumping. |
| D28 | Map gaps | Every open gap between obstacles is at least one blob (44) wide, so nobody gets wedged. That meant moving 4 trees from the design preview (plus their Green twins). A test enforces the rule. |
| D29 | Speed | 220 units/s, so crossing the map takes about 11 s. Easy to tune in `config.ts`. |
| D31 | Dens and the run home (owner) | Dens sit flat on the end lines like football goals, with no space behind them. The route from the potli to a den zig-zags: a blocker in the centre lane, a wall jutting into the next lane, a cart, then a "goalkeeper" wall in front of the den. A test fails if a straight run home ever opens up again. |
| D32 | Action buttons (owner) | One big smart button whose label changes with what you can do right now (Grab / Tag / Snatch / Unfreeze, and later Arrest / Drag / the spy's secret actions), plus a **Pass** button that appears only while you carry the potli with a teammate beside you. Keyboard: Space = big button, E = Pass. If two actions are possible at once, the more urgent one wins: Unfreeze > Tag > Snatch > Grab. |
| D33 | Picking up the potli (owner) | Press the button (**Grab**) while standing on a loose potli. Walking over it doesn't pick it up. |
| D34 | Tagging (owner) | Press **Tag** when an enemy on your half is within reach. Brushing past someone never freezes them. |
| D35 | Leader | One random Leader per team, picked every round. Everyone can see who leads (fire-lamp badge). |
| D36 | Snatch countdown | The countdown only keeps running while the snatcher stays beside the carrier (within 1.25× snatch reach). Freezing or passing cancels it. Each team sees it as an orange ring shrinking around the carrier. |
| D37 | Timeout before M5 | Until the stats from M5 exist, a round that runs out of time is a draw. |
| D38 | Carrier speed | Carrying the potli slows you to 0.85× (config), so chasers can catch up. The Leader's carry bonus (×1.25) still applies on top, as long as no teammate is frozen. |
| D39 | Scoring (owner, changes the GDD) | **You score by carrying the potli into the ENEMY's den**, at the far end of their half, like football. Your own den is the goal you defend, and it's where you spawn. Why: under the GDD rule (score in your own den), the team that grabbed first was safe on its own half at once. In 20 simulated games, every round ended in about 12 s and the potli was never taken back. With D39 the potli changes hands several times a round and wins split evenly. |
| D40 | Frozen-Leader arrow | The arrow pointing to a frozen Leader is shown to that Leader's teammates only (GDD freezing section). |
| D41 | Bot positions | Dev bots play positions: about half of each team defends their own half, the rest attack, and the Leader rescues frozen teammates. Bots react after 0.35–0.9 s, so they're beatable. |
| D42 | Role button | A second button, **Q** on keyboards, for role actions: Detective **Arrest**, spy **Ice** (secret freeze) and **Free** (secret unfreeze), anyone **Drag** / **Let go** for a shame-frozen Detective. It only appears when one of these is possible, so the big button stays predictable. |
| D43 | What you see | Only players inside your vision circle (300) that no wall blocks, including your teammates. Exceptions: you always see yourself, and your frozen Leader (for the arrow). Seeing teammates outside vision would let you track the spy. The server never sends anyone else. |
| D44 | Spy's normal actions | A spy can also tag "enemies" (really their own team) on their sitting team's half, to look loyal. |
| D45 | Footprints | For 4 s after a secret freeze, the spy leaves anonymous prints every 0.35 s. Each print fades after 20 s, and you only receive the ones you can see. |
| D46 | Seen silent pass | The spy is exposed to everyone (a red "SPY" over their head). They stay in play until the Detective arrests them. |
| D47 | Who can be arrested | Any teammate within reach who isn't already Out, frozen or not. |
| D48 | Shame drag | Press **Drag** beside a shame-frozen Detective of your team. They trail behind you, you move at 50%, and reaching a fireplace frees them. That works once per round, and **Let go** stops dragging. |
| D49 | Whisper | Spy only: a text line (up to 80 characters) to their real team. Nobody else receives it. |
| D50 | Iced hand | Sent only to players within 160 of the spy. It melts instantly within reach of a fireplace. |
| D51 | What blocks sight | Buildings, carts, chai stalls and trees. Fireplaces are low and don't. |
| D52 | Easy bots (dev) | A lobby switch, on by default: bots never grab or snatch the potli, so one person can test roles without bots ending the round in seconds. |
| D53 | Closer camera, tighter vision (owner) | Camera view height goes from 650 to **520** (zoomed in about 25%). Vision radius goes from 300 to **230** for Normal players and Leaders, and **280** for Detectives and spies, who hunt and sneak. The iced hand shows within 140. This replaces the numbers in D22–D23. Everything is tunable in `shared/src/config.ts`. |
| D54 | Your own spy (owner playtest) | **A team can't tag the spy it planted.** They look like an enemy, but the team knows they're its own (GDD), so freezing them only hurt that team, and bots kept doing it. The spy can still tag their real team to look loyal (D44). The sitting team can't tag the spy (same team), so only the Detective's arrest stops a spy. |
| D30 | Joystick | A floating joystick on the left 60% of the screen, analog (push further = faster), with a small deadzone. The right side is kept free for action buttons. |
