/**
 * One Gully Mole room = one group of friends. Its roomId IS the 4-digit code,
 * so joining is just `client.joinById(code)`.
 *
 * M0: lobby (join, nicknames, host, dev bots, start).
 * M1: teams, spawns, server-authoritative movement at a fixed tick rate.
 * M2: the round itself (see game/round.ts): potli, tagging, the Leader's lamp,
 *     timer, winning, and back to the lobby.
 * All decisions happen here on the server; clients only send inputs and requests.
 */
import { Room, ServerError, type Client, type StepContext } from "colyseus";
import {
  BOT_NAMES,
  CONFIG,
  ClientMsg,
  GameState,
  MoveInput,
  Phase,
  PlayerState,
  Role,
  ServerMsg,
  canStart,
  cleanNickname,
  generateRoomCode,
  pickNextHost,
  stepPlayer,
  type ActionKind,
  type ActionPayload,
  type AddBotsPayload,
  type JoinOptions,
} from "@gully/shared";
import { BotBrain } from "../bots";
import { Round } from "../game/round";

/** Codes in use on this server process (one process on Render's free tier). */
const codesInUse = new Set<string>();
const ACTION_KINDS: readonly ActionKind[] = ["unfreeze", "tag", "snatch", "grab"];

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
  private botCounter = 0;
  private brains = new Map<string, BotBrain>();
  /** Humans who left for good during a round: removed when everyone returns to the lobby. */
  private goneForGood = new Set<string>();

  messages = {
    [ClientMsg.Start]: (client: Client) => this.handleStart(client),
    [ClientMsg.AddBots]: (client: Client, payload?: AddBotsPayload) => this.handleAddBots(client, payload),
    [ClientMsg.RemoveBot]: (client: Client, botId?: unknown) => this.handleRemoveBot(client, botId),
    [ClientMsg.Action]: (client: Client, payload?: ActionPayload) => this.handleAction(client, payload),
    [ClientMsg.Pass]: (client: Client) => this.round.pass(client.sessionId),
    [ClientMsg.BackToLobby]: (client: Client) => this.handleBackToLobby(client),
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
   * 3. The round advances (timers, snatch countdown, win checks).
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
  }

  /** Gone for good (left on purpose, or reconnection window ran out). */
  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (this.state.phase === Phase.Lobby) {
      this.state.players.delete(client.sessionId);
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
    console.log(`[room ${this.roomId}] round started with ${this.state.players.size} players`);
  }

  private handleAction(client: Client, payload?: ActionPayload) {
    // Validate the shape; Round re-checks the rules.
    if (!payload || !ACTION_KINDS.includes(payload.kind as ActionKind)) return;
    const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
    this.round.act(client.sessionId, { kind: payload.kind as ActionKind, targetId });
  }

  /** Host only: after a round, everyone back to the lobby to play again. */
  private handleBackToLobby(client: Client) {
    if (!this.isHost(client) || this.state.phase !== Phase.Ended) return;
    for (const id of this.goneForGood) this.state.players.delete(id);
    this.goneForGood.clear();
    for (const p of this.state.players.values()) {
      p.team = "";
      p.role = Role.Normal;
      p.frozen = false;
      p.thawIn = 0;
      p.protected = false;
    }
    this.state.potli.carrierId = "";
    this.state.potli.snatcherId = "";
    this.state.winner = "";
    this.state.endReason = "";
    this.state.timeLeft = 0;
    this.state.phase = Phase.Lobby;
    this.unlock(); // friends can join again
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
  }

  private handleRemoveBot(client: Client, botId: unknown) {
    if (!this.isHost(client) || this.state.phase !== Phase.Lobby) return;
    if (typeof botId !== "string") return;
    if (this.state.players.get(botId)?.isBot) {
      this.state.players.delete(botId);
      this.brains.delete(botId);
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
