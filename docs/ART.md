# Gully Mole — Art direction

Chosen 2026-11-16. Pictures: `docs/design/images/` · editable canvas: `docs/design/project/`.

## Theme

Two teams, **Blue** and **Green**, each with a **den** (their base) in their color. No Police/Chor theme in the visuals. The rules are unchanged (see GDD; DECISIONS D20).

## Characters: style C, "blobs with eyes"

| | Blue team | Green team |
| --- | --- | --- |
| Body | `#4A83FF` | `#3FD17A` (lighter, so it differs in brightness as well as hue) |
| Hat | navy cap `#16316F`, visor `#0D1F4A` | dark-green bandana with tuft and knot `#0F4D2C` |
| Outline | `#11131A`, 3 units | same |

- Drawn with shapes in code (no image files).
- **Eyes look in the direction of movement** (right, left, down; facing away shows no eyes).
- The **spy looks exactly like the team they sit in**. Their real team sees a dashed ring in the real team's color plus an eye badge ("our mole").

## States (one color + one icon each)

Normal · Carrying (gold ring + potli) · Frozen (light blue ice `#9BE7FF`, snowflake) · Shame freeze (dark red `#8B1E2D`, handcuffs, "1 rescue left") · Out (grey cracked ice, X eyes) · Leader (fire-lamp badge) · Detective (star badge, own team only) · Our mole (real team only) · Iced hand (small blue glow, nearby only) · Footprints (no name, fade 20 s) · Protected (dashed white ring) · Disconnected (faded, eyes closed, plug badge).

## Object

A gold **potli** (pouch) `#FFD43B`.

## Map: "Gully No. 7"

- World **2400 × 1350** units, split down the middle (Blue half left, Green half right).
- **Blue den** on the left `(60, 545, 240×260)`, **Green den** on the right `(2100, 545, 240×260)`.
- Middle zone: a circle at the center `(1200, 675)`, radius 150. The potli starts there.
- 24 buildings, 8 carts (thelas), 4 chai stalls, 12 trees, 2 fireplaces (angithi).
- Each half is the other turned 180° around the center: point `(x, y)` mirrors to `(2400 − x, 1350 − y)`.
- **The source of truth is now `shared/src/map.ts`.** The server uses it for collisions (and later line of sight), and the client draws from it. In M1, 4 trees moved slightly from the design preview so every gap is at least one blob wide (DECISIONS D28).

## Sizes and camera

- Blob diameter **44** units (radius 22). Vision radius **300**.
- The camera follows you, and its zoom is chosen so the screen always shows **650 units of height**:
  - phone in landscape: blobs about 26 px
  - laptop at full screen: blobs about 60 px
- Same view area for everyone, so a bigger screen gives no advantage.
- Phones: joystick bottom-left, action buttons bottom-right, landscape suggested.

## Palette

Background `#1B1D24` · map ground `#23262F` · panel `#262934` · lines `#3A3E4C` · text `#F1F2F6` · muted `#A7ADC0` · accent/gold `#FFD43B` · fire `#FF8A3D`.
