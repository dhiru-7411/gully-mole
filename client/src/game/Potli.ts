/**
 * One potli on screen (there are two, D68): lying on the ground, bobbing above
 * its carrier's head, or sitting scored in a den with the scoring team's ring.
 */
import Phaser from "phaser";
import { CONFIG, type Team } from "@gully/shared";
import { COLORS, TEAM_COLORS } from "./colors";

export class Potli extends Phaser.GameObjects.Container {
  private glow: Phaser.GameObjects.Graphics;
  private ring: Phaser.GameObjects.Graphics;
  private ringTeam = "";

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.glow = scene.add.graphics();
    this.glow.fillStyle(COLORS.gold, 0.18).fillCircle(0, 4, 30);
    this.ring = scene.add.graphics();

    const g = scene.add.graphics();
    g.fillStyle(COLORS.gold).lineStyle(3, COLORS.outline);
    g.fillCircle(0, 6, 18).strokeCircle(0, 6, 18);
    g.fillStyle(COLORS.goldDark).fillRoundedRect(-10, -14, 20, 8, 4);
    g.fillStyle(COLORS.gold).fillTriangle(-9, -14, -16, -24, 0, -18).fillTriangle(9, -14, 16, -24, 0, -18);

    this.add([this.glow, this.ring, g]);
    scene.add.existing(this);
    this.setDepth(20);
  }

  /** Scored by a team (D68): a thick ring in that team's colour. "" = in play. */
  setScored(team: string) {
    if (team === this.ringTeam) return;
    this.ringTeam = team;
    this.ring.clear();
    if (team === "blue" || team === "green") {
      this.ring.lineStyle(5, TEAM_COLORS[team as Team].body).strokeCircle(0, 6, 30);
    }
  }

  /** Loose: on the ground at (x, y). Carried: small, above the carrier at (x, y). */
  show(x: number, y: number, carried: boolean, time: number) {
    if (carried) {
      const bob = Math.sin(time / 180) * 2;
      this.setPosition(x, y - CONFIG.movement.playerRadius - 16 + bob).setScale(0.7);
      this.glow.setVisible(false);
    } else {
      this.setPosition(x, y).setScale(1);
      this.glow.setVisible(!this.ringTeam).setAlpha(0.6 + Math.sin(time / 300) * 0.4);
    }
  }
}
