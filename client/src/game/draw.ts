/**
 * Draws the static map once, from the same MAP data the server collides with.
 * Simple shapes only (docs/ART.md): no image files to download.
 */
import Phaser from "phaser";
import { CONFIG, MAP, TEAMS } from "@gully/shared";
import { COLORS, TEAM_COLORS } from "./colors";

export function drawMap(scene: Phaser.Scene) {
  const g = scene.add.graphics();

  // Ground and the two halves.
  g.fillStyle(COLORS.ground).fillRect(0, 0, MAP.width, MAP.height);
  g.fillStyle(TEAM_COLORS.blue.body, 0.08).fillRect(0, 0, MAP.halfLine, MAP.height);
  g.fillStyle(TEAM_COLORS.green.body, 0.07).fillRect(MAP.halfLine, 0, MAP.width - MAP.halfLine, MAP.height);

  // Dashed half line.
  g.lineStyle(3, COLORS.text, 0.28);
  for (let y = 0; y < MAP.height; y += 26) g.lineBetween(MAP.halfLine, y, MAP.halfLine, y + 14);

  // Dens.
  for (const team of TEAMS) {
    const d = MAP.dens[team];
    g.fillStyle(TEAM_COLORS[team].body, 0.22).fillRoundedRect(d.x, d.y, d.w, d.h, 22);
    g.lineStyle(5, TEAM_COLORS[team].body).strokeRoundedRect(d.x, d.y, d.w, d.h, 22);
    scene.add
      .text(d.x + d.w / 2, d.y - 12, `${CONFIG.teams.names[team]} den`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "26px",
        fontStyle: "bold",
        color: "#f1f2f6",
      })
      .setOrigin(0.5, 1) // sits just above the den, so spawning blobs don't cover it
      .setAlpha(0.85);
  }

  // Middle zone (dashed circle) and the potli's start spot.
  const m = MAP.middleZone;
  g.fillStyle(COLORS.gold, 0.06).fillCircle(m.x, m.y, m.r);
  g.lineStyle(3, COLORS.gold, 0.7);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
    g.beginPath();
    g.arc(m.x, m.y, m.r, a, a + Math.PI / 48);
    g.strokePath();
  }

  // Obstacles.
  for (const o of MAP.rects) {
    if (o.kind === "building") {
      g.fillStyle(COLORS.buildingTop).fillRoundedRect(o.x, o.y, o.w, o.h, 8);
      g.fillStyle(COLORS.building).fillRoundedRect(o.x, o.y + 6, o.w, o.h - 6, 8);
    } else if (o.kind === "cart") {
      g.fillStyle(COLORS.cartRim).fillRoundedRect(o.x, o.y, o.w, o.h, 7);
      g.fillStyle(COLORS.cart).fillRoundedRect(o.x + 3, o.y + 3, o.w - 6, o.h - 6, 5);
    } else {
      g.fillStyle(COLORS.chai).fillRoundedRect(o.x, o.y, o.w, o.h, 8);
      scene.add
        .text(o.x + o.w / 2, o.y + o.h / 2, "chai", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          fontStyle: "bold",
          color: "#e6fffb",
        })
        .setOrigin(0.5);
    }
  }
  for (const c of MAP.circles) {
    if (c.kind === "tree") {
      g.fillStyle(COLORS.treeRim).fillCircle(c.x, c.y, c.r);
      g.fillStyle(COLORS.tree).fillCircle(c.x, c.y, c.r - 6);
    } else {
      // Fireplace (angithi): glow, rim, coals, flame.
      g.fillStyle(COLORS.fire, 0.18).fillCircle(c.x, c.y, c.r + 16);
      g.fillStyle(COLORS.fire).fillCircle(c.x, c.y, c.r);
      g.fillStyle(COLORS.fireInner).fillCircle(c.x, c.y, c.r - 5);
      g.fillStyle(COLORS.gold).fillTriangle(c.x, c.y - 20, c.x - 10, c.y + 4, c.x + 10, c.y + 4);
      g.fillStyle(COLORS.gold).fillCircle(c.x, c.y + 5, 10);
    }
  }

  // World edge.
  g.lineStyle(4, COLORS.building).strokeRect(0, 0, MAP.width, MAP.height);
}

/**
 * The potli, drawn as a static marker for now. M2 turns it into the real
 * object you can pick up, pass and snatch.
 */
export function drawPotli(scene: Phaser.Scene, x: number, y: number) {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(COLORS.gold).lineStyle(3, COLORS.outline);
  g.fillCircle(0, 6, 18).strokeCircle(0, 6, 18);
  g.fillStyle(COLORS.goldDark).fillRoundedRect(-10, -14, 20, 8, 4);
  g.fillStyle(COLORS.gold).fillTriangle(-9, -14, -16, -24, 0, -18).fillTriangle(9, -14, 16, -24, 0, -18);
  return g;
}
