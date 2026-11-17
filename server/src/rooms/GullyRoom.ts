/**
 * One Gully Mole room = one group of friends. Its roomId IS the 4-digit code,
 * so joining is just `client.joinById(code)`.
 *
 * M0: lobby (join, nicknames, host, dev bots, start).
 * M1: teams, spawns, server-authoritative movement at a fixed tick rate.
 * M2: the round itself (see game/round.ts): potli, tagging, the Leader's lamp,
 *     timer, winning, and back to the lobby.
 * M3: secret roles, limited vision and per-player views (see views.ts), the
 *     role button, whispers, Detective pings and announcements.
 * All decisions happen here on the server; clients only send inputs and requests.
 */
import { Room, ServerError, type Client, type StepContext } from "colyseus";
import {
  BOT_NAMES,
  CONFIG,
  ClientMsg,
  Freeze,
  GameState,
  MoveInput,
  Phase,
  PlayerState,
  Role,
  SecretRole,
  ServerEvent,
  ServerMsg,
  WHISPER_MAX_LENGTH,
  canStart,
  cleanNickname,
  generateRoomCode,
  pickNextHost,
  stepPlayer,
  type ActionKind,
  type ActionPayload,
  type AddBotsPayload,
  type JoinOptions,
  type RoleActionKind,
  type RoleActionPayload,
} from "@gully/shared";
import { BotBrain } from "../bots";
import { Round } from "../game/round";
import { ViewSync } from "../views";

/** Codes in use on this server process (one process on Render's free tier). */
const codesInUse = new Set<string>();
const ACTION_KINDS: readonly ActionKind[] = ["unfreeze", "tag", "snatch", "grab"];
const ROLE_ACTION_KINDS: readonly RoleActionKind[] = ["arrest", "ice", "free", "drag", "release"];

export class GullyRoom extends Room<{ state: GameState; input: MoveInput }> {
  // Humans only: bots have no connection, so we cap the total ourselves.
  maxClients = CONFIG.lobby.maxPlayers;
  state = new GameState();

  /**
   * Each client's queued joystick inputs. `sanitize` clamps every value as it
   * arrives, so a modified client can't send "move 100× faster".
   */
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-127, 127], moveY: [-127, 127] },
  });

  private round = new Round(this.state);
  private views = new ViewSync(this.state);
  private botCounter = 0;
  private brains = new Map<string, BotBrain>();
  /** Humans who left for good during a round: removed when everyone returns to the lobby. */
  private goneForGood = new Set<string>();

  messages = {
    [ClientMsg.Start]: (client: Client) => this.handleStart(client),
    [ClientMsg.AddBots]: (client: Client, payload?: AddBotsPayload) => this.handleAddBots(client, payload),
    [ClientMsg.RemoveBot]: (client: Client, botId?: unknown) => this.handleRemoveBot(client, botId),
    [ClientMsg.Action]: (client: Client, payload?: ActionPayload) => this.handleAction(client, payload),
    [ClientMsg.RoleAction]: (client: Client, payload?: RoleActionPayload) => this.handleRoleAction(client, payload),
    [ClientMsg.Pass]: (client: Client) => this.round.pass(client.sessionId),
    [ClientMsg.Whisper]: (client: Client, text?: unknown) => this.handleWhisper(client, text),
    [ClientMsg.BackToLobby]: (client: Client) => this.handleBackToLobby(client),
    [ClientMsg.SetEasyBots]: (client: Client, on?: unknown) => {
      if (this.isHost(client) && this.state.phase === Phase.Lobby && typeof on === "boolean") {
        this.state.easyBots = on;
      }
    },
  };

  onCreate() {
    this.roomId = generateRoomCode((code) => codesInUse.has(code));
    codesInUse.add(this.roomId);
    this.state.code = this.roomId;
    this.state.botsAllowed =
      process.env.NODE_ENV !== "production" || process.env.ALLOW_BOTS === "true";

    // The heartbeat: run the simulation tickRate times per second.
    this.setFixedTimestep((ctx) => this.step(ctx), CONFIG.movement.tickRate);
    console.log(`[room ${this.roomId}] created`);
  }

  /**
   * One simulation step:
   * 1. Humans move once per input they sent (the same step their browser predicted).
   * 2. Bots ask their brain what to do.
   * 3. The round advances (timers, countdowns, win checks).
   * 4. Events are delivered and every player's view is updated.
   * Frozen players don't move.
   */
  private step(ctx: StepContext) {
    const playing = this.state.phase === Phase.Playing;

    for (const [id, player] of this.state.players) {
      if (player.isBot) {
        if (!playing) continue;
        const d = this.brains.get(id)!.next(player, this.state, CONFIG.movement.tickRate);
        if (!player.frozen) stepPlayer(player, d.move, ctx.dt, this.round.speedFor(player));
        if (d.action) this.round.act(id, d.action);
        if (d.roleAction) this.round.roleAct(id, d.roleAction);
        if (d.pass) this.round.pass(id);
        continue;
      }
      const channel = this.inputs.get(id);
      if (!channel) continue;
      // Iterating drains the queue. Outside a round we just throw inputs away.
      for (const input of channel) {
        if (playing && player.connected && !player.frozen) {
          stepPlayer(player, input, ctx.dt, this.round.speedFor(player));
        }
      }
    }

    this.round.tick(ctx.dt);
    this.deliverEvents();
    this.views.update(this.clients);
  }

  /** Round events -> messages. Pings go only to that Detective. */
  private deliverEvents() {
    for (const e of this.round.events) {
      if (e.type === "announce") {
        this.broadcast(ServerEvent.Announce, e.text);
      } else if (e.type === "frozenPing") {
        this.clientFor(e.to)?.send(ServerEvent.FrozenPing, { x: e.x, y: e.y, name: e.name });
      }
    }
    this.round.events = [];
  }

  /** Runs before onJoin. Throwing here rejects the join with a message the client can show. */
  onAuth(_client: Client, options: Partial<JoinOptions>) {
    if (this.state.phase !== Phase.Lobby) {
      throw new ServerError(403, "That game already started.");
    }
    if (this.state.players.size >= CONFIG.lobby.maxPlayers) {
      throw new ServerError(403, "Room is full.");
    }
    if (cleanNickname(options?.nickname) === null) {
      throw new ServerError(400, "Pick a nickname first.");
    }
    return true;
  }

  onJoin(client: Client, options: JoinOptions) {
    const nickname = cleanNickname(options.nickname, this.nicknames())!;
    this.state.players.set(
      client.sessionId,
      new PlayerState({ id: client.sessionId, nickname, isBot: false, connected: true }),
    );
    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.state.playerCount = this.state.players.size;
    this.views.attach(client);
    this.views.update([client]); // see the lobby right away
    console.log(`[room ${this.roomId}] ${nickname} joined (${this.state.players.size} players)`);
  }

  /** Connection lost without saying goodbye (phone locked, wifi blip). Keep their seat for a while. */
  async onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.passHostIfNeeded(client.sessionId);

    const seconds =
      this.state.phase === Phase.Lobby
        ? CONFIG.lobby.lobbyReconnectSeconds
        : CONFIG.lobby.gameReconnectSeconds;
    this.allowReconnection(client, seconds);
  }

  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    if (!this.isConnectedHuman(this.state.hostId)) this.state.hostId = client.sessionId;
    this.views.attach(client); // fresh view: the server re-sends what they may see
    this.views.update([client]);
  }

  /** Gone for good (left on purpose, or reconnection window ran out). */
  onLeave(client: Client) {
    this.views.detach(client);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase === Phase.Lobby) {
      this.state.players.delete(client.sessionId);
      this.state.playerCount = this.state.players.size;
    } else {
      // GDD: a disconnected player's character stays on the map and can't move.
      // They can still be frozen, and the potli can be snatched from them.
      player.connected = false;
      this.goneForGood.add(client.sessionId);
    }
    this.passHostIfNeeded(client.sessionId);
    console.log(`[room ${this.roomId}] ${player.nickname} left`);
  }

  onDispose() {
    codesInUse.delete(this.roomId);
    console.log(`[room ${this.roomId}] closed`);
  }

  // ---------------------------------------------------------------- handlers

  private handleStart(client: Client) {
    if (!this.isHost(client)) return this.notice(client, "Only the host can start.");
    if (this.state.phase !== Phase.Lobby) return;

    const check = canStart(this.state.players.size);
    if (!check.ok) return this.notice(client, check.reason);

    this.round.start();
    this.state.phase = Phase.Playing;
    this.lock(); // no new joins mid-round
    this.views.update(this.clients);
    console.log(`[room ${this.roomId}] round started with ${this.state.players.size} players`);
  }

  private handleAction(client: Client, payload?: ActionPayload) {
    // Validate the shape; Round re-checks the rules.
    if (!payload || !ACTION_KINDS.includes(payload.kind as ActionKind)) return;
    const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
    this.round.act(client.sessionId, { kind: payload.kind as ActionKind, targetId });
  }

  private handleRoleAction(client: Client, payload?: RoleActionPayload) {
    if (!payload || !ROLE_ACTION_KINDS.includes(payload.kind as RoleActionKind)) return;
    if (typeof payload.targetId !== "string") return;
    this.round.roleAct(client.sessionId, { kind: payload.kind as RoleActionKind, targetId: payload.targetId });
  }

  /** Spy -> their real team (D49). Nobody else receives it. */
  private handleWhisper(client: Client, text: unknown) {
    const me = this.state.players.get(client.sessionId);
    if (!me || this.state.phase !== Phase.Playing || me.secretRole !== SecretRole.Spy) return;
    if (typeof text !== "string") return;
    const clean = text.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, WHISPER_MAX_LENGTH);
    if (!clean) return;
    for (const p of this.state.players.values()) {
      if (p.realTeam === me.realTeam) this.clientFor(p.id)?.send(ServerEvent.Whisper, { from: me.nickname, text: clean });
    }
  }

  /** Host only: after a round, everyone back to the lobby to play again. */
  private handleBackToLobby(client: Client) {
    if (!this.isHost(client) || this.state.phase !== Phase.Ended) return;
    for (const id of this.goneForGood) this.state.players.delete(id);
    this.goneForGood.clear();
    for (const p of this.state.players.values()) {
      Object.assign(p, {
        team: "",
        role: Role.Normal,
        secretRole: SecretRole.None,
        realTeam: "",
        frozen: false,
        freeze: Freeze.None,
        thawIn: 0,
        protected: false,
        exposed: false,
        draggedBy: "",
        rescueUsed: false,
        icedHand: false,
      });
    }
    this.state.potli.carrierId = "";
    this.state.potli.snatcherId = "";
    this.state.footprints.clear();
    this.state.winner = "";
    this.state.endReason = "";
    this.state.timeLeft = 0;
    this.state.phase = Phase.Lobby;
    this.state.playerCount = this.state.players.size;
    this.unlock(); // friends can join again
    this.views.update(this.clients);
  }

  private handleAddBots(client: Client, payload?: AddBotsPayload) {
    if (!this.isHost(client)) return this.notice(client, "Only the host can add bots.");
    if (!this.state.botsAllowed) return this.notice(client, "Bots are off on this server.");
    if (this.state.phase !== Phase.Lobby) return;

    const room = CONFIG.lobby.maxPlayers - this.state.players.size;
    const fillToMin = CONFIG.lobby.minPlayers - this.state.players.size;
    const requested =
      typeof payload?.count === "number" && Number.isFinite(payload.count)
        ? Math.floor(payload.count)
        : Math.max(1, fillToMin);
    const count = Math.max(0, Math.min(requested, room));
    if (count === 0) return this.notice(client, "Room is full.");

    for (let i = 0; i < count; i++) this.addBot();
    this.state.playerCount = this.state.players.size;
    this.views.update(this.clients);
  }

  private handleRemoveBot(client: Client, botId: unknown) {
    if (!this.isHost(client) || this.state.phase !== Phase.Lobby) return;
    if (typeof botId !== "string") return;
    if (this.state.players.get(botId)?.isBot) {
      this.state.players.delete(botId);
      this.brains.delete(botId);
      this.state.playerCount = this.state.players.size;
    }
  }

  // ----------------------------------------------------------------- helpers

  private addBot() {
    const id = `bot-${++this.botCounter}`;
    const used = new Set(this.nicknames().map((n) => n.toLowerCase()));
    const name = BOT_NAMES.find((n) => !used.has(n.toLowerCase())) ?? "Bot";
    const nickname = cleanNickname(name, this.nicknames())!;
    this.state.players.set(id, new PlayerState({ id, nickname, isBot: true, connected: true }));
    this.brains.set(id, new BotBrain());
  }

  private clientFor(sessionId: string) {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  private passHostIfNeeded(leavingId: string) {
    if (this.state.hostId !== leavingId) return;
    const next = pickNextHost(this.state.players.values(), leavingId);
    // If nobody else is around, keep the old id so they get it back on reconnect.
    if (next) this.state.hostId = next;
  }

  private nicknames(): string[] {
    return [...this.state.players.values()].map((p) => p.nickname);
  }

  private isHost(client: Client) {
    return client.sessionId === this.state.hostId;
  }

  private isConnectedHuman(id: string) {
    const p = this.state.players.get(id);
    return !!p && !p.isBot && p.connected;
  }

  private notice(client: Client, text: string) {
    client.send(ServerMsg.Notice, text);
  }
}
