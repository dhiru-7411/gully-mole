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
| D12 | Tagging the spy | The spy's real team can tag them under the normal tagging rules. |
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
