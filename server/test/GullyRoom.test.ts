/**
 * Integration tests: boot a real Colyseus server in-process and talk to it
 * through the real client SDK, exactly like the browser does.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  CONFIG,
  ClientMsg,
  MAP,
  Phase,
  ROOM_NAME,
  ServerMsg,
  isBlocked,
  isValidRoomCode,
  type MoveInput,
} from "@gully/shared";
import appConfig from "../src/app.config";

let colyseus: ColyseusTestServer<any>;

beforeAll(async () => {
  colyseus = await boot(appConfig, 2599);
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
});

/** Create a room with a host already in it. */
async function createWithHost(nickname = "Host") {
  const room = await colyseus.createRoom(ROOM_NAME, {});
  const host = await colyseus.connectTo(room, { nickname });
  return { room, host };
}

describe("GullyRoom lobby", () => {
  it("uses a 4-digit code as the room id and makes the creator host", async () => {
    const { room, host } = await createWithHost();
    expect(isValidRoomCode(room.roomId)).toBe(true);
    expect(room.state.code).toBe(room.roomId);
    expect(room.state.hostId).toBe(host.sessionId);
    expect(room.state.phase).toBe(Phase.Lobby);
  });

  it("lets a friend join by code, numbering duplicate nicknames", async () => {
    const { room } = await createWithHost("Ravi");
    const friend = await colyseus.sdk.joinById(room.roomId, { nickname: "ravi" });
    await room.waitForNextPatch();
    expect(room.state.players.get(friend.sessionId)?.nickname).toBe("ravi 2");
    expect(room.state.players.size).toBe(2);
  });

  it("rejects an empty nickname and a wrong code", async () => {
    const { room } = await createWithHost();
    await expect(colyseus.sdk.joinById(room.roomId, { nickname: "   " })).rejects.toThrow();
    await expect(colyseus.sdk.joinById("0000", { nickname: "Ghost" })).rejects.toThrow();
  });

  it("only the host can start, and only with 8+ players", async () => {
    const { room, host } = await createWithHost();
    const friend = await colyseus.connectTo(room, { nickname: "Friend" });

    // Non-host start is refused.
    friend.send(ClientMsg.Start);
    const refused = friend.waitForMessage(ServerMsg.Notice);
    expect(await refused).toMatch(/host/i);

    // Host with 2 players is refused.
    const tooFew = host.waitForMessage(ServerMsg.Notice);
    host.send(ClientMsg.Start);
    expect(await tooFew).toMatch(/at least 8/);

    // Fill with bots (default fills to the minimum), then start.
    host.send(ClientMsg.AddBots, {});
    await room.waitForNextMessage();
    expect(room.state.players.size).toBe(8);
    expect([...room.state.players.values()].filter((p) => p.isBot)).toHaveLength(6);

    host.send(ClientMsg.Start);
    await room.waitForNextMessage();
    expect(room.state.phase).toBe(Phase.Playing);

    // Nobody can join mid-round.
    await expect(colyseus.sdk.joinById(room.roomId, { nickname: "Late" })).rejects.toThrow();
  });

  it("host can remove a bot; non-host cannot add bots", async () => {
    const { room, host } = await createWithHost();
    const friend = await colyseus.connectTo(room, { nickname: "Friend" });

    friend.send(ClientMsg.AddBots, { count: 3 });
    await room.waitForNextMessage();
    expect(room.state.players.size).toBe(2);

    host.send(ClientMsg.AddBots, { count: 3 });
    await room.waitForNextMessage();
    expect(room.state.players.size).toBe(5);

    host.send(ClientMsg.RemoveBot, "bot-2");
    await room.waitForNextMessage();
    expect(room.state.players.has("bot-2")).toBe(false);
    expect(room.state.players.size).toBe(4);
  });

  it("passes host to the next human when the host leaves the lobby", async () => {
    const { room, host } = await createWithHost();
    const friend = await colyseus.connectTo(room, { nickname: "Friend" });

    await host.leave(); // consented leave: gone for good
    await room.waitForNextPatch();
    expect(room.state.players.has(host.sessionId)).toBe(false);
    expect(room.state.hostId).toBe(friend.sessionId);
  });

  it("keeps a player's character (disconnected) when they leave mid-round", async () => {
    const { room, host } = await createWithHost();
    const friend = await colyseus.connectTo(room, { nickname: "Friend" });
    host.send(ClientMsg.AddBots, {});
    await room.waitForNextMessage();
    host.send(ClientMsg.Start);
    await room.waitForNextMessage();

    await friend.leave();
    await room.waitForNextPatch();
    const p = room.state.players.get(friend.sessionId);
    expect(p).toBeDefined();
    expect(p!.connected).toBe(false);
  });
});

// ------------------------------------------------------------------ M1

/** Host + friend + bots up to 8, round started. */
async function startedRoom() {
  const { room, host } = await createWithHost();
  const friend = await colyseus.connectTo(room, { nickname: "Friend" });
  host.send(ClientMsg.AddBots, {});
  await room.waitForNextMessage();
  host.send(ClientMsg.Start);
  await room.waitForNextMessage();
  return { room, host, friend };
}

describe("GullyRoom movement (M1)", () => {
  it("splits players into Blue and Green and spawns them in their own den", async () => {
    const { room } = await startedRoom();
    const players = [...room.state.players.values()];
    expect(players.filter((p) => p.team === "blue")).toHaveLength(4);
    expect(players.filter((p) => p.team === "green")).toHaveLength(4);
    for (const p of players) {
      const den = MAP.dens[p.team as "blue" | "green"];
      expect(p.x).toBeGreaterThan(den.x);
      expect(p.x).toBeLessThan(den.x + den.w);
      expect(p.y).toBeGreaterThan(den.y);
      expect(p.y).toBeLessThan(den.y + den.h);
    }
    // Nobody shares a spawn spot.
    expect(new Set(players.map((p) => `${p.x},${p.y}`)).size).toBe(8);
  });

  it("moves a player one step per input they send", async () => {
    const { room, host } = await startedRoom();
    const me = room.state.players.get(host.sessionId)!;
    const startX = me.x;
    const dir = me.team === "blue" ? 127 : -127; // walk out of the den, towards the middle

    const input = host.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = dir;
    input.data.moveY = 0;
    input.send();
    await room.waitForNextMessage();
    await room.waitForNextTimestep();

    const oneStep = CONFIG.movement.playerSpeed / CONFIG.movement.tickRate;
    expect(Math.abs(me.x - startX)).toBeCloseTo(oneStep, 3);
  });

  it("clamps a hacked input (can't move faster than full stick)", async () => {
    const { room, host } = await startedRoom();
    const me = room.state.players.get(host.sessionId)!;
    const startX = me.x;
    const dir = me.team === "blue" ? 1 : -1;

    const input = host.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = (dir * 10_000) as any;
    input.data.moveY = 0;
    input.send();
    await room.waitForNextMessage();
    await room.waitForNextTimestep();

    const oneStep = CONFIG.movement.playerSpeed / CONFIG.movement.tickRate;
    expect(Math.abs(me.x - startX)).toBeLessThanOrEqual(oneStep + 1e-6);
  });

  it("bots wander around and never end up inside walls", async () => {
    const { room } = await startedRoom();
    const bots = [...room.state.players.values()].filter((p) => p.isBot);
    const start = bots.map((b) => ({ x: b.x, y: b.y }));
    for (let i = 0; i < 40; i++) await room.waitForNextTimestep(); // ~2 s of game time

    const moved = bots.filter((b, i) => Math.hypot(b.x - start[i].x, b.y - start[i].y) > 5);
    expect(moved.length).toBeGreaterThan(0);
    for (const b of bots) expect(isBlocked(b.x, b.y, CONFIG.movement.playerRadius - 0.01)).toBe(false);
  });

  it("the Action message tags an enemy on your half (and the server re-checks the rules)", async () => {
    const { room, host } = await startedRoom();
    const me = room.state.players.get(host.sessionId)!;
    const enemy = [...room.state.players.values()].find((p) => p.team && p.team !== me.team)!;
    // Put both on MY half, side by side, and freeze time for bots by ending their influence.
    const myHalfX = me.team === "blue" ? 900 : 1500;
    me.x = myHalfX;
    me.y = 675;
    enemy.x = myHalfX + 40;
    enemy.y = 675;

    // A wrong kind is ignored.
    host.send(ClientMsg.Action, { kind: "teleport", targetId: enemy.id });
    await room.waitForNextMessage();
    expect(enemy.frozen).toBe(false);

    host.send(ClientMsg.Action, { kind: "tag", targetId: enemy.id });
    await room.waitForNextMessage();
    expect(enemy.frozen).toBe(true);
  });

  it("host sends everyone back to the lobby after a round, and friends can join again", async () => {
    const { room, host } = await startedRoom();
    // End the round: freeze a whole team.
    // Wipe-out counts REAL teams (incl. a spy planted in the other team).
    for (const p of room.state.players.values()) if (p.realTeam === "green") p.frozen = true;
    await room.waitForNextTimestep();
    expect(room.state.phase).toBe(Phase.Ended);

    host.send(ClientMsg.BackToLobby);
    await room.waitForNextMessage();
    expect(room.state.phase).toBe(Phase.Lobby);
    expect([...room.state.players.values()].every((p) => p.team === "" && !p.frozen)).toBe(true);

    const late = await colyseus.sdk.joinById(room.roomId, { nickname: "Late" });
    expect(late.sessionId).toBeTruthy();
  });

  it("ignores movement in the lobby", async () => {
    const { room, host } = await createWithHost();
    const me = room.state.players.get(host.sessionId)!;
    const input = host.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 127;
    input.send();
    await room.waitForNextMessage();
    await room.waitForNextTimestep();
    expect(me.x).toBe(0);
  });
});
