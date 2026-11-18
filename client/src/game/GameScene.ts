/**
 * The round: map, blobs, potli, arrows, camera, controls and HUD.
 *
 * How smooth movement works (the important bit):
 * - YOUR blob is PREDICTED: we run the same stepPlayer() the server runs, the
 *   moment you press a key, so it feels instant. When the server's answer
 *   arrives, the "reconciler" quietly corrects any small difference.
 * - EVERYONE ELSE is INTERPOLATED: we draw them smoothly between the last
 *   positions the server sent, so they glide instead of teleporting 20×/s.
 *
 * The big button's label comes from the same shared rules the server uses
 * (bestAction), so what it says is what the server will accept.
 */
import Phaser from "phaser";
import { Predict, type InputHandle } from "@colyseus/sdk";
import {
  CONFIG,
  MAP,
  bestAction,
  bestRoleAction,
  passTarget,
  speedMultiplier,
  stepPlayer,
  visibilityPolygon,
  visionRadius,
  type MoveInput,
  type PlayerState,
  type RulePlayer,
  type Team,
} from "@gully/shared";
import type { GameRoom } from "../net";
import { Blob } from "./Blob";
import { Controls } from "./controls";
import { drawMap } from "./draw";
import { Hud } from "./hud";
import { Potli } from "./Potli";
import { COLORS, TEAM_COLORS } from "./colors";
import { bubbles, pings } from "./feed";

type Predictor = ReturnType<typeof Predict.get>;

/**
 * Prediction is set up once per room connection and reused by every round,
 * so playing again doesn't stack up duplicate predictors.
 */
const NO_POTLI = { x: 0, y: 0, carrierId: "", snatcherId: "" };

const netByRoom = new WeakMap<GameRoom, { predict: Predictor; input: InputHandle<MoveInput> }>();

function netFor(room: GameRoom) {
  let net = netByRoom.get(room);
  if (net) return net;

  const predict = Predict.get(room);
  predict.attachAll("players", { mode: "lerp", fields: ["x", "y"], smoothMs: 65 });
  const input = room.input<MoveInput>({ mode: "reliable" });
  const me = room.state.players.get(room.sessionId);
  if (me) {
    predict.reconciler(me, {
      input,
      fields: ["x", "y", "fx", "fy"],
      // The very same function the server runs, with the same rules:
      // frozen players don't move, a Leader carrying the potli is faster.
      step: (ctx, predicted, command) => {
        const s = room.state;
        const self = s.players.get(room.sessionId);
        if (!self || self.frozen || s.huddle?.active) return; // frozen, or game paused for a huddle
        const potli = s.potli ?? NO_POTLI; // may be out of my view
        stepPlayer(predicted, command as MoveInput, ctx.dt, speedMultiplier(self, s.players.values(), potli));
      },
    });
  }
  net = { predict, input };
  netByRoom.set(room, net);
  return net;
}

export class GameScene extends Phaser.Scene {
  private room!: GameRoom;
  private predict!: Predictor;
  private moveInput!: InputHandle<MoveInput>;
  private controls!: Controls;
  private hud!: Hud;
  private blobs = new Map<string, Blob>();
  private potli!: Potli;
  private arrows!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private prints!: Phaser.GameObjects.Graphics;

  constructor() {
    super("game");
  }

  init(data: { room: GameRoom }) {
    this.room = data.room;
  }

  create() {
    drawMap(this);
    this.prints = this.add.graphics().setDepth(5);
    this.fog = this.add.graphics().setDepth(8);
    this.potli = new Potli(this);
    this.arrows = this.add.graphics().setDepth(30);

    const net = netFor(this.room);
    this.predict = net.predict;
    this.moveInput = net.input;

    this.controls = new Controls(this.game.canvas.parentElement!);
    this.hud = new Hud(this.room);
    const cleanup = () => {
      this.controls.destroy();
      this.hud.destroy();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    // Camera: follow me, zoomed so every screen shows the same height of map.
    const cam = this.cameras.main;
    cam.setBackgroundColor(COLORS.background);
    cam.setBounds(0, 0, MAP.width, MAP.height);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.applyZoom());

    // My blob starts the camera following as soon as it's created (syncBlobs).
    if (this.overview) cam.centerOn(MAP.width / 2, MAP.height / 2);
    this.syncBlobs();
  }

  update(time: number) {
    // Drives prediction + smoothing, and tells us how many fixed steps are due,
    // so we send exactly one input per server step.
    const steps = this.predict.tick(performance.now());
    // During a huddle the game is paused: send "standing still".
    const paused = !!this.room.state.huddle?.active;
    const { moveX, moveY } = paused ? { moveX: 0, moveY: 0 } : this.controls.axes();
    for (let i = 0; i < steps; i++) {
      this.moveInput.data.moveX = moveX;
      this.moveInput.data.moveY = moveY;
      this.moveInput.send();
    }

    this.syncBlobs();
    this.syncPotli(time);
    this.drawFootprints();
    this.drawFog();
    this.drawArrows();
    this.updateHud();
  }

  /**
   * Create blobs for players we can see, remove blobs the server stopped
   * sending (they walked out of sight), and restyle the rest.
   */
  private syncBlobs() {
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    const myRealTeam = me?.realTeam || me?.team;
    const carrierId = s.potli?.carrierId ?? "";

    for (const [id, blob] of this.blobs) {
      if (!s.players.has(id)) {
        blob.destroy();
        this.blobs.delete(id);
      }
    }

    for (const [id, p] of s.players) {
      let blob = this.blobs.get(id);
      if (!blob) {
        if (!p.team) continue;
        blob = new Blob(this, p.team as Team, p.nickname, id === this.room.sessionId);
        blob.setLabelZoom(this.cameras.main.zoom);
        this.blobs.set(id, blob);
        if (id === this.room.sessionId && !this.overview) this.followMe(blob);
      }
      const isMe = id === this.room.sessionId;
      blob.setPosition(this.predict.value(p, "x"), this.predict.value(p, "y"));
      blob.setFacing(
        isMe ? this.predict.value(p, "fx") : (p as PlayerState).fx,
        isMe ? this.predict.value(p, "fy") : (p as PlayerState).fy,
      );
      blob.setConnected(p.connected);
      const b = bubbles.get(id);
      blob.setBubble(b && b.until > performance.now() ? b.text : "");
      blob.setLook({
        freeze: p.frozen ? p.freeze || "ice" : "",
        leader: p.role === "leader",
        protected: p.protected,
        carrying: carrierId === id,
        snatch:
          carrierId === id && s.potli.snatcherId
            ? Math.round((s.potli.snatchLeft / CONFIG.timers.snatchCountdownSec) * 20) / 20
            : 0,
        thawIn: p.frozen ? p.thawIn : 0,
        // These secrets only arrive if I'm allowed to know them (server-side views).
        detective: p.secretRole === "detective",
        mole: !isMe && p.secretRole === "spy" && p.realTeam === myRealTeam ? p.realTeam : "",
        exposed: p.exposed,
        icedHand: !!p.icedHand,
        rescueLeft: !p.rescueUsed,
      });
    }
  }

  private followMe(blob: Blob) {
    const cam = this.cameras.main;
    cam.startFollow(blob, false, CONFIG.camera.followLerp, CONFIG.camera.followLerp);
    cam.centerOn(blob.x, blob.y);
  }

  private syncPotli(time: number) {
    const s = this.room.state;
    // Not in my view (hidden behind a wall or out of range): don't draw it.
    if (!s.potli) {
      this.potli.setVisible(false);
      return;
    }
    this.potli.setVisible(true);
    const carrierBlob = this.blobs.get(s.potli.carrierId);
    if (carrierBlob) this.potli.show(carrierBlob.x, carrierBlob.y, true, time);
    else if (!s.potli.carrierId) this.potli.show(s.potli.x, s.potli.y, false, time);
    else this.potli.setVisible(false); // carried by someone I can't see
  }

  /** Footprints left by a secret freeze: only the ones I can see are ever sent. */
  private drawFootprints() {
    const g = this.prints.clear();
    const prints = this.room.state.footprints;
    if (!prints) return;
    g.fillStyle(0xcfd3de, 0.55);
    for (const f of prints.values()) {
      // Two little ovals, side by side, along the walking direction.
      const px = -Math.sin(f.angle) * 5;
      const py = Math.cos(f.angle) * 5;
      g.fillEllipse(f.x + px, f.y + py, 7, 10);
      g.fillEllipse(f.x - px, f.y - py, 7, 10);
    }
  }

  /**
   * Fog of war: everything outside my vision circle, or behind walls, is
   * dimmed (D25). We cast rays from my position (the same geometry the server
   * uses) and darken the area beyond each ray's end.
   */
  private drawFog() {
    const g = this.fog.clear();
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    if (!me || s.phase !== "playing" || this.overview) return;

    const origin = { x: this.predict.value(me, "x"), y: this.predict.value(me, "y") };
    const poly = visibilityPolygon(origin, visionRadius(me), FOG_RAYS); // Detectives and spies see a bit further (D53)
    const FAR = 5000;
    g.fillStyle(COLORS.background, 0.72);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const angA = (i / poly.length) * Math.PI * 2;
      const angB = (((i + 1) % poly.length) / poly.length) * Math.PI * 2;
      const fa = { x: origin.x + Math.cos(angA) * FAR, y: origin.y + Math.sin(angA) * FAR };
      const fb = { x: origin.x + Math.cos(angB) * FAR, y: origin.y + Math.sin(angB) * FAR };
      g.fillTriangle(a.x, a.y, b.x, b.y, fb.x, fb.y);
      g.fillTriangle(a.x, a.y, fb.x, fb.y, fa.x, fa.y);
    }
  }

  /**
   * Navigation arrows around my blob (GDD):
   * - the Leader always gets a gold arrow to the potli;
   * - everyone gets a team-colored arrow to their Leader while the Leader is frozen.
   */
  private drawArrows() {
    const g = this.arrows.clear();
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    const myBlob = this.blobs.get(this.room.sessionId);
    if (!me || !myBlob) return;

    const arrow = (tx: number, ty: number, color: number) => {
      const dx = tx - myBlob.x;
      const dy = ty - myBlob.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 140) return; // close enough to see it
      const ux = dx / d;
      const uy = dy / d;
      const r = CONFIG.movement.playerRadius + 22;
      const cx = myBlob.x + ux * r;
      const cy = myBlob.y + uy * r;
      g.fillStyle(color).lineStyle(2, COLORS.outline);
      const tip = { x: cx + ux * 10, y: cy + uy * 10 };
      const left = { x: cx - uy * 8 - ux * 6, y: cy + ux * 8 - uy * 6 };
      const right = { x: cx + uy * 8 - ux * 6, y: cy - ux * 8 - uy * 6 };
      g.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
      g.strokeTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    };

    if (me.role === "leader" && s.potli && s.potli.carrierId !== me.id) {
      // The Leader is always sent the potli; if its carrier is out of sight, use the potli's position.
      const carrierBlob = this.blobs.get(s.potli.carrierId);
      arrow(carrierBlob?.x ?? s.potli.x, carrierBlob?.y ?? s.potli.y, COLORS.gold);
    }
    for (const [id, p] of s.players) {
      if (id !== me.id && p.team === me.team && p.role === "leader" && p.frozen) {
        const b = this.blobs.get(id);
        if (b) arrow(b.x, b.y, TEAM_COLORS[me.team as Team].body);
      }
    }
    // Detective: where a teammate was just frozen (white arrow + ring, ~8 s).
    const now = performance.now();
    for (let i = pings.length - 1; i >= 0; i--) {
      if (pings[i].until < now) pings.splice(i, 1);
    }
    for (const p of pings) {
      arrow(p.x, p.y, 0xf1f2f6);
      g.lineStyle(3, 0xf1f2f6, 0.5 + 0.4 * Math.sin(now / 150)).strokeCircle(p.x, p.y, 40);
    }
  }

  private updateHud() {
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    if (!me) return;
    // Use my predicted position (what I see) with everyone else's server positions.
    const myView: RulePlayer = { ...plain(me), x: this.predict.value(me, "x"), y: this.predict.value(me, "y") };
    const others = [...s.players.values()].map((p) => (p.id === me.id ? myView : plain(p)));
    const playing = s.phase === "playing" && !!s.potli;
    this.hud.update({
      action: playing ? bestAction(myView, others, s.potli) : null,
      roleAction: s.phase === "playing" ? bestRoleAction(myView, others) : null,
      canPass: playing && !!passTarget(myView, others, s.potli),
    });
  }

  /** Dev only: add ?overview to the URL to see the whole map at once. */
  private overview = import.meta.env.DEV && new URLSearchParams(location.search).has("overview");

  private applyZoom() {
    const zoom = this.overview
      ? Math.min(this.scale.width / MAP.width, this.scale.height / MAP.height)
      : this.scale.height / CONFIG.camera.viewHeight;
    this.cameras.main.setZoom(zoom);
    for (const blob of this.blobs.values()) blob.setLabelZoom(zoom);
  }
}

const FOG_RAYS = 240;

/** What the rules need from a player (only the secrets this client was sent). */
const plain = (p: PlayerState): RulePlayer => ({
  id: p.id,
  team: p.team,
  role: p.role,
  x: p.x,
  y: p.y,
  frozen: p.frozen,
  protected: p.protected,
  tagCooldown: p.tagCooldown,
  freeze: p.freeze,
  secretRole: p.secretRole ?? "",
  realTeam: p.realTeam ?? "",
  icedHand: !!p.icedHand,
  draggedBy: p.draggedBy,
  rescueUsed: p.rescueUsed,
});

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
