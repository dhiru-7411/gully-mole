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

/** Everything about a player that changes how their blob looks (docs/design states board). */
export interface BlobLook {
  frozen: boolean;
  leader: boolean;
  protected: boolean;
  carrying: boolean;
  /** 0..1 while an enemy is snatching from this blob, else 0. */
  snatch: number;
  /** Frozen Leader: seconds until the lamp thaws them (0 = hide). */
  thawIn: number;
}

export class Blob extends Phaser.GameObjects.Container {
  private eyes: Phaser.GameObjects.Graphics;
  /** Under the body: carrying ring, protection ring, snatch ring. */
  private under: Phaser.GameObjects.Graphics;
  /** Over the body: ice and badges. */
  private over: Phaser.GameObjects.Graphics;
  private thawText: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;
  private lastFx = NaN;
  private lastFy = NaN;
  private lastLook = "";

  constructor(scene: Phaser.Scene, team: Team, nickname: string, isMe: boolean) {
    super(scene, 0, 0);

    this.under = scene.add.graphics();
    const body = scene.add.graphics();
    drawBody(body, team);
    this.eyes = scene.add.graphics();
    this.over = scene.add.graphics();
    this.thawText = scene.add
      .text(0, -R - 10, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffd43b",
        stroke: "#11131a",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setResolution(Math.min(window.devicePixelRatio || 1, 3));

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

    this.add([this.under, body, this.eyes, this.over, this.thawText, this.label]);
    scene.add.existing(this);
    this.setDepth(isMe ? 11 : 10);
  }

  /** Keep the name the same size on screen at any zoom. */
  setLabelZoom(zoom: number) {
    this.label.setScale(1 / zoom);
    this.thawText.setScale(1 / zoom);
  }

  /** Redraw rings, ice and badges, only when something changed. */
  setLook(look: BlobLook) {
    const key = JSON.stringify(look);
    if (key === this.lastLook) return;
    this.lastLook = key;

    const u = this.under.clear();
    if (look.carrying) u.lineStyle(4, COLORS.gold).strokeCircle(0, 0, R + 6);
    if (look.protected) {
      // Dashed white ring: just-thawed Leader can't be frozen.
      u.lineStyle(3, 0xf1f2f6, 0.9);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        u.beginPath();
        u.arc(0, 0, R + 11, a, a + Math.PI / 14);
        u.strokePath();
      }
    }
    if (look.snatch > 0) {
      // Shrinking orange arc: the snatch countdown everyone can see.
      u.lineStyle(5, COLORS.fire);
      u.beginPath();
      u.arc(0, 0, R + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * look.snatch);
      u.strokePath();
    }

    const o = this.over.clear();
    if (look.frozen) {
      // Light blue ice block (docs/design: "Frozen").
      o.fillStyle(0x9be7ff, 0.55).fillRoundedRect(-R - 4, -R - 4, 2 * R + 8, 2 * R + 8, 14);
      o.lineStyle(3, 0xd5f6ff).strokeRoundedRect(-R - 4, -R - 4, 2 * R + 8, 2 * R + 8, 14);
    }
    if (look.leader) {
      // Fire-lamp badge, top right.
      const bx = R * 0.85;
      const by = -R * 0.85;
      o.fillStyle(COLORS.fire).fillCircle(bx, by, 9);
      o.lineStyle(2, COLORS.outline).strokeCircle(bx, by, 9);
      o.fillStyle(COLORS.gold).fillTriangle(bx, by - 6, bx - 4, by + 3, bx + 4, by + 3);
      o.fillCircle(bx, by + 2, 3.5);
    }
    this.thawText.setText(look.thawIn > 0 ? `${look.thawIn}` : "");
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
