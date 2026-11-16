/**
 * M0 placeholder: proves the round started and Phaser runs on this device.
 * The real map, movement and joystick arrive in M1.
 */
import Phaser from "phaser";
import type { GameRoom } from "../net";

export class GameScene extends Phaser.Scene {
  private room!: GameRoom;
  private dots: Phaser.GameObjects.Container[] = [];

  constructor() {
    super("game");
  }

  init(data: { room: GameRoom }) {
    this.room = data.room;
  }

  create() {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, 48, "Round started!", { fontSize: "28px", fontStyle: "bold", color: "#ffd43b" })
      .setOrigin(0.5);
    this.add
      .text(width / 2, 84, "Map + movement arrive in M1", { fontSize: "16px", color: "#9aa0b4" })
      .setOrigin(0.5);

    this.drawPlayers();
    this.scale.on("resize", () => this.scene.restart({ room: this.room }));
  }

  /** One circle per player in a ring, so you can see everyone made it in. */
  private drawPlayers() {
    this.dots.forEach((d) => d.destroy());
    const players = [...this.room.state.players.values()];
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2 + 30;
    const r = Math.min(width, height) * 0.3;

    players.forEach((p, i) => {
      const a = (i / players.length) * Math.PI * 2 - Math.PI / 2;
      const me = p.id === this.room.sessionId;
      const circle = this.add.circle(0, 0, 16, me ? 0xffd43b : 0xf1f2f6, p.connected ? 1 : 0.35);
      const label = this.add
        .text(0, 26, p.nickname, { fontSize: "13px", color: "#f1f2f6" })
        .setOrigin(0.5, 0);
      this.dots.push(this.add.container(cx + Math.cos(a) * r, cy + Math.sin(a) * r, [circle, label]));
    });
  }
}

export function startGame(parent: HTMLElement, room: GameRoom): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#1b1d24",
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: [],
    callbacks: {
      postBoot: (game) => game.scene.add("game", GameScene, true, { room }),
    },
  });
}
