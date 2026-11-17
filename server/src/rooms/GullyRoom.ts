/**
 * One Gully Mole room = one group of friends. Its roomId IS the 4-digit code,
 * so joining is just `client.joinById(code)`.
 *
 * M0 covers the lobby: join, nicknames, host, dev bots, start.
 * All decisions happen here on the server; clients only send requests.
 */
import { Room, ServerError, type Client } from "colyseus";
import {
  BOT_NAMES,
  CONFIG,
  ClientMsg,
  GameState,
  Phase,
  PlayerState,
  ServerMsg,
  canStart,
  cleanNickname,
  generateRoomCode,
  pickNextHost,
  type AddBotsPayload,
  type JoinOptions,
} from "@gully/shared";

/** Codes in use on this server process (one process on Render's free tier). */
const codesInUse = new Set<string>();

export class GullyRoom extends Room<{ state: GameState }> {
  // Humans only: bots have no connection, so we cap the total ourselves.
  maxClients = CONFIG.lobby.maxPlayers;
  state = new GameState();

  private botCounter = 0;

  messages = {
    [ClientMsg.Start]: (client: Client) => this.handleStart(client),
    [ClientMsg.AddBots]: (client: Client, payload?: AddBotsPayload) => this.handleAddBots(client, payload),
    [ClientMsg.RemoveBot]: (client: Client, botId?: unknown) => this.handleRemoveBot(client, botId),
  };

  onCreate() {
    this.roomId = generateRoomCode((code) => codesInUse.has(code));
    codesInUse.add(this.roomId);
    this.state.code = this.roomId;
    this.state.botsAllowed =
      process.env.NODE_ENV !== "production" || process.env.ALLOW_BOTS === "true";
    console.log(`[room ${this.roomId}] created`);
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
      player.connected = false;
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

    this.state.phase = Phase.Playing;
    this.lock(); // no new joins mid-round
    console.log(`[room ${this.roomId}] round started with ${this.state.players.size} players`);
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
    if (this.state.players.get(botId)?.isBot) this.state.players.delete(botId);
  }

  // ----------------------------------------------------------------- helpers

  private addBot() {
    const id = `bot-${++this.botCounter}`;
    const used = new Set(this.nicknames().map((n) => n.toLowerCase()));
    const name = BOT_NAMES.find((n) => !used.has(n.toLowerCase())) ?? "Bot";
    const nickname = cleanNickname(name, this.nicknames())!;
    this.state.players.set(id, new PlayerState({ id, nickname, isBot: true, connected: true }));
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
