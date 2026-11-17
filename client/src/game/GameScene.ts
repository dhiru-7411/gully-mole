/**
 * The round: map, blobs, camera and controls.
 *
 * How smooth movement works (the important bit):
 * - YOUR blob is PREDICTED: we run the same stepPlayer() the server runs, the
 *   moment you press a key, so it feels instant. When the server's answer
 *   arrives, the "reconciler" quietly corrects any small difference.
 * - EVERYONE ELSE is INTERPOLATED: we draw them smoothly between the last
 *   positions the server sent, so they glide instead of teleporting 20×/s.
 */
import Phaser from "phaser";
import { Predict, type InputHandle } from "@colyseus/sdk";
import { CONFIG, MAP, stepPlayer, type MoveInput, type PlayerState, type Team } from "@gully/shared";
import type { GameRoom } from "../net";
import { Blob } from "./Blob";
import { Controls } from "./controls";
import { drawMap, drawPotli } from "./draw";
import { COLORS } from "./colors";

export class GameScene extends Phaser.Scene {
  private room!: GameRoom;
  private predict!: ReturnType<typeof Predict.get>;
  private moveInput!: InputHandle<MoveInput>;
  private controls!: Controls;
  private blobs = new Map<string, Blob>();

  constructor() {
    super("game");
  }

  init(data: { room: GameRoom }) {
    this.room = data.room;
  }

  create() {
    drawMap(this);
    drawPotli(this, MAP.middleZone.x, MAP.middleZone.y);

    // Networking: smoothing for others, prediction for me.
    this.predict = Predict.get(this.room);
    this.predict.attachAll("players", { mode: "lerp", fields: ["x", "y"], smoothMs: 65 });
    this.moveInput = this.room.input<MoveInput>({ mode: "reliable" });

    const me = this.room.state.players.get(this.room.sessionId);
    if (me) {
      this.predict.reconciler(me, {
        input: this.moveInput,
        fields: ["x", "y", "fx", "fy"],
        // The very same function the server runs. That's the whole trick.
        step: (ctx, predicted, command) => stepPlayer(predicted, command as MoveInput, ctx.dt),
      });
    }

    this.controls = new Controls(this.game.canvas.parentElement!);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());

    // Camera: follow me, zoomed so every screen shows the same height of map.
    const cam = this.cameras.main;
    cam.setBackgroundColor(COLORS.background);
    cam.setBounds(0, 0, MAP.width, MAP.height);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());

    this.syncBlobs();
    const myBlob = this.blobs.get(this.room.sessionId);
    if (myBlob) {
      cam.startFollow(myBlob, false, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
      cam.centerOn(myBlob.x, myBlob.y);
    }
  }

  update() {
    // Drives prediction + smoothing, and tells us how many fixed steps are due,
    // so we send exactly one input per server step.
    const steps = this.predict.tick(performance.now());
    const { moveX, moveY } = this.controls.axes();
    for (let i = 0; i < steps; i++) {
      this.moveInput.data.moveX = moveX;
      this.moveInput.data.moveY = moveY;
      this.moveInput.send();
    }

    this.syncBlobs();
  }

  /** Create blobs for new players and move every blob to its latest position. */
  private syncBlobs() {
    for (const [id, p] of this.room.state.players) {
      let blob = this.blobs.get(id);
      if (!blob) {
        if (!p.team) continue;
        blob = new Blob(this, p.team as Team, p.nickname, id === this.room.sessionId);
        blob.setLabelZoom(this.cameras.main.zoom);
        this.blobs.set(id, blob);
      }
      const isMe = id === this.room.sessionId;
      blob.setPosition(this.predict.value(p, "x"), this.predict.value(p, "y"));
      blob.setFacing(isMe ? this.predict.value(p, "fx") : (p as PlayerState).fx, isMe ? this.predict.value(p, "fy") : (p as PlayerState).fy);
      blob.setConnected(p.connected);
    }
  }

  private applyZoom() {
    const zoom = this.scale.height / CONFIG.camera.viewHeight;
    this.cameras.main.setZoom(zoom);
    for (const blob of this.blobs.values()) blob.setLabelZoom(zoom);
  }
}

export function startGame(parent: HTMLElement, room: GameRoom): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#1b1d24",
    antialias: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    // Use the screen's real pixel density so shapes stay sharp on phones.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    scene: [],
    callbacks: {
      postBoot: (game) => game.scene.add("game", GameScene, true, { room }),
    },
  } as Phaser.Types.Core.GameConfig);
}
