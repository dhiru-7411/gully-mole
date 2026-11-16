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
