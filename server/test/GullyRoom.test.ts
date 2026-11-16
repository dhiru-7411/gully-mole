/**
 * Integration tests: boot a real Colyseus server in-process and talk to it
 * through the real client SDK, exactly like the browser does.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { ClientMsg, Phase, ROOM_NAME, ServerMsg, isValidRoomCode } from "@gully/shared";
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
