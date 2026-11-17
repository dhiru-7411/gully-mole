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
  /** "ice" | "shame" | "out" | "" */
  freeze: string;
  leader: boolean;
  protected: boolean;
  carrying: boolean;
  /** 0..1 while an enemy is snatching from this blob, else 0. */
  snatch: number;
  /** Frozen Leader: seconds until the lamp thaws them (0 = hide). */
  thawIn: number;
  /** Detective badge (only shown to people allowed to know). */
  detective: boolean;
  /** "Our mole": the spy my real team planted (only my real team sees this). */
  mole: string;
  /** A spy everyone now knows about. */
  exposed: boolean;
  /** The spy's iced hand (only sent to players close by). */
  icedHand: boolean;
  /** Shame-frozen and the one fireplace rescue is still available. */
  rescueLeft: boolean;
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

    this.rescueText = scene.add
      .text(0, R + 22, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "12px",
        fontStyle: "bold",
        color: "#ffd0d7",
        backgroundColor: "#8b1e2d",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 0)
      .setResolution(Math.min(window.devicePixelRatio || 1, 3));

    this.add([this.under, body, this.eyes, this.over, this.thawText, this.label, this.rescueText]);
    scene.add.existing(this);
    this.setDepth(isMe ? 11 : 10);
  }

  private rescueText: Phaser.GameObjects.Text;

  /** Keep the name the same size on screen at any zoom. */
  setLabelZoom(zoom: number) {
    this.label.setScale(1 / zoom);
    this.thawText.setScale(1 / zoom);
    this.rescueText.setScale(1 / zoom);
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

    if (look.mole) {
      // "Our mole": dashed ring in our (real) team's color.
      u.lineStyle(3, TEAM_COLORS[look.mole as Team].body);
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) {
        u.beginPath();
        u.arc(0, 0, R + 9, a, a + Math.PI / 15);
        u.strokePath();
      }
    }

    const o = this.over.clear();
    const box = (fill: number, alpha: number, line: number) => {
      o.fillStyle(fill, alpha).fillRoundedRect(-R - 4, -R - 4, 2 * R + 8, 2 * R + 8, 14);
      o.lineStyle(3, line).strokeRoundedRect(-R - 4, -R - 4, 2 * R + 8, 2 * R + 8, 14);
    };
    if (look.freeze === "ice") {
      box(0x9be7ff, 0.55, 0xd5f6ff); // light blue ice (tagged by an enemy or the spy: identical)
    } else if (look.freeze === "shame") {
      box(0x8b1e2d, 0.7, 0xe0566b); // dark red ice + handcuffs (wrong arrest)
      this.badge(o, 0xe0566b, (bx, by) => {
        o.lineStyle(2, COLORS.outline).strokeCircle(bx - 3.5, by, 3.5).strokeCircle(bx + 3.5, by, 3.5);
      });
    } else if (look.freeze === "out") {
      box(0x9aa0b4, 0.5, 0xc4c8d4); // grey cracked ice
      o.lineStyle(2, 0xeef0f5);
      o.beginPath();
      o.moveTo(-R + 2, -R + 4).lineTo(-4, -2).lineTo(-10, R - 6);
      o.moveTo(-4, -2).lineTo(R - 4, -8);
      o.strokePath();
    }

    if (look.icedHand) {
      // A small blue glow on one hand (GDD).
      o.fillStyle(0x7fdcff, 0.35).fillCircle(R * 0.8, R * 0.75, 10);
      o.fillStyle(0xbff0ff).fillCircle(R * 0.8, R * 0.75, 5);
      o.lineStyle(1.5, COLORS.outline).strokeCircle(R * 0.8, R * 0.75, 5);
    }
    if (look.leader) {
      // Fire-lamp badge.
      this.badge(o, COLORS.fire, (bx, by) => {
        o.fillStyle(COLORS.gold).fillTriangle(bx, by - 6, bx - 4, by + 3, bx + 4, by + 3);
        o.fillCircle(bx, by + 2, 3.5);
      });
    } else if (look.detective) {
      // Star badge: only the Detective's team sees it.
      this.badge(o, COLORS.gold, (bx, by) => {
        o.fillStyle(COLORS.outline);
        const pts: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? 6 : 2.6;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          pts.push(new Phaser.Math.Vector2(bx + Math.cos(a) * r, by + Math.sin(a) * r));
        }
        o.fillPoints(pts, true);
      });
    }

    this.thawText.setText(look.thawIn > 0 ? `${look.thawIn}` : look.exposed ? "SPY" : "");
    this.thawText.setColor(look.exposed && !look.thawIn ? "#ff6b6b" : "#ffd43b");
    const rescue = look.freeze === "shame" && look.rescueLeft;
    this.rescueText.setText(rescue ? "1 rescue left" : "").setVisible(rescue);
  }

  /** A round badge at the top right of the blob. */
  private badge(o: Phaser.GameObjects.Graphics, color: number, icon: (x: number, y: number) => void) {
    const bx = R * 0.85;
    const by = -R * 0.85;
    o.fillStyle(color).fillCircle(bx, by, 9);
    o.lineStyle(2, COLORS.outline).strokeCircle(bx, by, 9);
    icon(bx, by);
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
