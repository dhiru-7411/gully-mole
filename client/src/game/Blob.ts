/**
 * One player on screen: body + hat (drawn once) and eyes (redrawn when the
 * facing direction changes), plus a name label.
 *
 * Drawing uses the 100×100 sketch from docs/design (body centre at 50,56,
 * radius 38) scaled down to the real blob radius.
 */
import Phaser from "phaser";
import { AXIS_MAX, CONFIG, type Team } from "@gully/shared";
import { COLORS, TEAM_COLORS } from "./colors";

const R = CONFIG.movement.playerRadius;
const S = R / 38; // sketch units -> world units
/** Sketch coordinates -> blob-local coordinates (blob centre = 0,0). */
const sx = (u: number) => (u - 50) * S;
const sy = (v: number) => (v - 56) * S;

export class Blob extends Phaser.GameObjects.Container {
  private eyes: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private lastFx = NaN;
  private lastFy = NaN;

  constructor(scene: Phaser.Scene, team: Team, nickname: string, isMe: boolean) {
    super(scene, 0, 0);

    const body = scene.add.graphics();
    drawBody(body, team);
    this.eyes = scene.add.graphics();

    this.label = scene.add
      .text(0, R + 6, nickname, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        fontStyle: isMe ? "bold" : "normal",
        color: isMe ? "#ffd43b" : "#f1f2f6",
        stroke: "#11131a",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setResolution(Math.min(window.devicePixelRatio || 1, 3));

    this.add([body, this.eyes, this.label]);
    scene.add.existing(this);
    this.setDepth(isMe ? 11 : 10);
  }

  /** Keep the name the same size on screen at any zoom. */
  setLabelZoom(zoom: number) {
    this.label.setScale(1 / zoom);
  }

  /** fx, fy: facing direction, -127..127 each. */
  setFacing(fx: number, fy: number) {
    if (fx === this.lastFx && fy === this.lastFy) return;
    this.lastFx = fx;
    this.lastFy = fy;

    const len = Math.sqrt(fx * fx + fy * fy) || AXIS_MAX;
    const dx = fx / len;
    const dy = fy / len;
    const g = this.eyes.clear();
    if (dy < -0.7) return; // walking away from the camera: we see the back of the head

    // Eyes slide toward where you're heading; pupils look a bit further.
    const midX = dx * 17.5;
    const midY = -4 + dy * 8;
    for (const side of [-1, 1]) {
      const ex = midX + side * 9.5;
      g.fillStyle(0xffffff).fillCircle(ex * S, midY * S, 9 * S);
      g.fillStyle(COLORS.outline).fillCircle((ex + dx * 4) * S, (midY + dy * 4) * S, 4.5 * S);
    }
  }

  setConnected(connected: boolean) {
    this.setAlpha(connected ? 1 : 0.4);
  }
}

function drawBody(g: Phaser.GameObjects.Graphics, team: Team) {
  const c = TEAM_COLORS[team];
  g.fillStyle(c.body).fillCircle(0, 0, R);
  g.lineStyle(3 * S, COLORS.outline).strokeCircle(0, 0, R);

  if (team === "blue") {
    // Navy cap with a visor.
    g.fillStyle(c.hat).fillRoundedRect(sx(27), sy(10), 46 * S, 18 * S, 7 * S);
    g.fillStyle(c.hatDark).fillRoundedRect(sx(24), sy(24), 58 * S, 7 * S, 3.5 * S);
  } else {
    // Dark-green bandana: tuft on top, band, knot tails at the back.
    g.fillStyle(c.hat);
    g.fillTriangle(sx(38), sy(24), sx(44), sy(7), sx(50), sy(22));
    g.fillTriangle(sx(50), sy(22), sx(56), sy(5), sx(62), sy(24));
    g.fillRoundedRect(sx(18), sy(22), 64 * S, 10 * S, 5 * S);
    g.fillTriangle(sx(22), sy(27), sx(6), sy(18), sx(11), sy(28));
    g.fillTriangle(sx(22), sy(27), sx(11), sy(28), sx(5), sy(38));
  }
}
