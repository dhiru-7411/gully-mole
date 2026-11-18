/**
 * M4: huddles and quick messages.
 * Part 1 drives the Huddles class directly; part 2 uses real clients over the
 * network to check the game pauses and messages only reach the right team.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  CONFIG,
  ClientMsg,
  GameState,
  Phase,
  PlayerState,
  ROOM_NAME,
  ServerEvent,
  type HuddleChatPayload,
  type QuickMessagePayload,
} from "@gully/shared";
import appConfig from "../src/app.config";
import { Huddles } from "../src/game/huddle";

// ------------------------------------------------------------- huddle rules

function huddleSetup() {
  const state = new GameState();
  for (const [id, team, role] of [
    ["L", "blue", "leader"],
    ["n", "blue", ""],
    ["G", "green", "leader"],
  ] as const) {
    state.players.set(id, new PlayerState({ id, nickname: id, team, role }));
  }
  state.phase = Phase.Playing;
  const h = new Huddles(state);
  h.reset();
  const P = (id: string) => state.players.get(id)!;
  return { state, h, P };
}

describe("huddle rules (GDD)", () => {
  it("only a Leader can call one, and not while frozen", () => {
    const { state, h, P } = huddleSetup();
    expect(h.call("n")).toBe(false);
    P("L").frozen = true;
    expect(h.call("L")).toBe(false);
    P("L").frozen = false;
    expect(h.call("L")).toBe(true);
    expect(state.huddle.active).toBe(true);
    expect(state.huddle.callerName).toBe("L");
    expect(state.huddle.secondsLeft).toBe(CONFIG.huddle.durationSec);
  });

  it("2 per team per round; one at a time", () => {
    const { state, h } = huddleSetup();
    expect(h.call("L")).toBe(true);
    expect(h.call("G")).toBe(false); // one at a time
    h.end("L");
    expect(h.call("L")).toBe(true);
    h.end("L");
    expect(h.call("L")).toBe(false); // used both
    expect(state.huddlesLeftBlue).toBe(0);
    expect(h.call("G")).toBe(true); // Green still has theirs
  });

  it("only the caller can end it early; otherwise it ends when time runs out", () => {
    const { state, h } = huddleSetup();
    h.call("L");
    expect(h.end("G")).toBe(false);
    expect(state.huddle.active).toBe(true);
    for (let t = 0; t < CONFIG.huddle.durationSec + 1; t += 0.05) h.tick(0.05);
    expect(state.huddle.active).toBe(false);
  });

  it("bots chat during the huddle, to their own team", () => {
    const { state, h } = huddleSetup();
    for (let i = 0; i < 6; i++) {
      state.players.set(`bot${i}`, new PlayerState({ id: `bot${i}`, nickname: `bot${i}`, team: "blue", isBot: true }));
    }
    h.call("L");
    for (let t = 0; t < 60; t += 0.05) h.tick(0.05);
    expect(h.outbox.length).toBeGreaterThan(0);
    expect(h.outbox.every((l) => l.team === "blue")).toBe(true);
  });
});

// ------------------------------------------------------------- over the network

let colyseus: ColyseusTestServer<any>;
beforeAll(async () => {
  colyseus = await boot(appConfig, 2596);
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

/** Host (Blue Leader) + friend + bots, round started, roles forced for the test. */
async function started(friendSetup: { team: string; secretRole?: string; realTeam?: string }) {
  const room = await colyseus.createRoom(ROOM_NAME, {});
  const host = await colyseus.connectTo(room, { nickname: "Host" });
  const friend = await colyseus.connectTo(room, { nickname: "Friend" });
  host.send(ClientMsg.AddBots, {});
  await room.waitForNextMessage();
  host.send(ClientMsg.Start);
  await room.waitForNextMessage();
  // Make the host Blue's Leader, everyone else not a leader.
  for (const p of room.state.players.values()) if (p.role === "leader") p.role = "";
  Object.assign(room.state.players.get(host.sessionId)!, { team: "blue", realTeam: "blue", role: "leader", secretRole: "", frozen: false });
  Object.assign(room.state.players.get(friend.sessionId)!, {
    team: friendSetup.team,
    realTeam: friendSetup.realTeam ?? friendSetup.team,
    secretRole: friendSetup.secretRole ?? "",
  });
  return { room, host, friend };
}

const collect = <T>(client: any, type: string) => {
  const got: T[] = [];
  client.onMessage(type, (m: T) => got.push(m));
  return got;
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("huddles over the network", () => {
  it("pause the game: positions, timer and actions all stop", async () => {
    const { room, host } = await started({ team: "green" });
    host.send(ClientMsg.CallHuddle);
    await room.waitForNextMessage();
    expect(room.state.huddle.active).toBe(true);

    const timeBefore = room.state.timeLeft;
    const positions = [...room.state.players.values()].map((p) => `${p.x},${p.y}`).join("|");
    await wait(1300);
    expect(room.state.timeLeft).toBe(timeBefore); // round timer paused
    expect([...room.state.players.values()].map((p) => `${p.x},${p.y}`).join("|")).toBe(positions); // nobody moved
    expect(room.state.huddle.secondsLeft).toBeLessThan(CONFIG.huddle.durationSec); // huddle clock runs

    host.send(ClientMsg.EndHuddle);
    await room.waitForNextMessage();
    expect(room.state.huddle.active).toBe(false);
  });

  it("chat reaches only the team you sit in", async () => {
    const { room, host, friend } = await started({ team: "green" });
    const hostGot = collect<HuddleChatPayload>(host, ServerEvent.HuddleChat);
    const friendGot = collect<HuddleChatPayload>(friend, ServerEvent.HuddleChat);
    host.send(ClientMsg.CallHuddle);
    await room.waitForNextMessage();
    host.send(ClientMsg.HuddleChat, "Blue plan: rush left");
    await wait(200);
    expect(hostGot.some((m) => m.text === "Blue plan: rush left")).toBe(true);
    expect(friendGot.some((m) => m.text === "Blue plan: rush left")).toBe(false); // Green never hears it
  });

  it("the spy hiding in Blue hears Blue's huddle (GDD)", async () => {
    const { room, host, friend } = await started({ team: "blue", secretRole: "spy", realTeam: "green" });
    const spyGot = collect<HuddleChatPayload>(friend, ServerEvent.HuddleChat);
    host.send(ClientMsg.CallHuddle);
    await room.waitForNextMessage();
    host.send(ClientMsg.HuddleChat, "Our Detective is Pappu");
    await wait(200);
    expect(spyGot.some((m) => m.text === "Our Detective is Pappu")).toBe(true);
  });

  it("chat outside a huddle is ignored", async () => {
    const { host } = await started({ team: "blue" });
    const got = collect<HuddleChatPayload>(host, ServerEvent.HuddleChat);
    host.send(ClientMsg.HuddleChat, "hello?");
    await wait(200);
    expect(got).toHaveLength(0);
  });
});

describe("quick messages", () => {
  it("go to your team only, and are rate-limited", async () => {
    const { host, friend } = await started({ team: "green" });
    const hostGot = collect<QuickMessagePayload>(host, ServerEvent.QuickMessage);
    const friendGot = collect<QuickMessagePayload>(friend, ServerEvent.QuickMessage);
    host.send(ClientMsg.QuickMessage, 3);
    host.send(ClientMsg.QuickMessage, 0); // too soon: dropped
    host.send(ClientMsg.QuickMessage, 99); // invalid: dropped
    await wait(300);
    expect(hostGot.map((m) => m.index)).toEqual([3]);
    expect(friendGot).toHaveLength(0);
  });
});
