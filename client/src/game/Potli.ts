/** The potli on screen: lying on the ground, or bobbing above its carrier's head. */
import Phaser from "phaser";
import { CONFIG } from "@gully/shared";
import { COLORS } from "./colors";

export class Potli extends Phaser.GameObjects.Container {
  private glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.glow = scene.add.graphics();
    this.glow.fillStyle(COLORS.gold, 0.18).fillCircle(0, 4, 30);

    const g = scene.add.graphics();
    g.fillStyle(COLORS.gold).lineStyle(3, COLORS.outline);
    g.fillCircle(0, 6, 18).strokeCircle(0, 6, 18);
    g.fillStyle(COLORS.goldDark).fillRoundedRect(-10, -14, 20, 8, 4);
    g.fillStyle(COLORS.gold).fillTriangle(-9, -14, -16, -24, 0, -18).fillTriangle(9, -14, 16, -24, 0, -18);

    this.add([this.glow, g]);
    scene.add.existing(this);
    this.setDepth(20);
  }

  /** Loose: on the ground at (x, y). Carried: small, above the carrier at (x, y). */
  show(x: number, y: number, carried: boolean, time: number) {
    if (carried) {
      const bob = Math.sin(time / 180) * 2;
      this.setPosition(x, y - CONFIG.movement.playerRadius - 16 + bob).setScale(0.7);
      this.glow.setVisible(false);
    } else {
      this.setPosition(x, y).setScale(1);
      this.glow.setVisible(true).setAlpha(0.6 + Math.sin(time / 300) * 0.4);
    }
  }
}
