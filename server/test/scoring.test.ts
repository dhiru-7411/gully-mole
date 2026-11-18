/**
 * M5: automatic stats, the timeout winner, the reveal summary, peer awards and MVP.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ArraySchema } from "@colyseus/schema";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  CONFIG,
  ClientMsg,
  FACTORS,
  GameState,
  MAP,
  MAP_SCALE,
  Phase,
  PlayerState,
  ROOM_NAME,
} from "@gully/shared";
import appConfig from "../src/app.config";
import { AwardsPhase } from "../src/game/awards";
import { Round } from "../src/game/round";

const DT = 1 / CONFIG.movement.tickRate;
const BLUE_SIDE = { x: 900 * MAP_SCALE, y: 675 * MAP_SCALE };
const GREEN_SIDE = { x: 1500 * MAP_SCALE, y: 675 * MAP_SCALE };

/** Blue: b0 Leader, b1 Detective, b2 = Green's spy, b3. Green: g0 Leader, g1 Detective, g2 = Blue's spy, g3. */
function setup() {
  const state = new GameState();
  for (let i = 0; i < 8; i++) {
    const id = i < 4 ? `b${i}` : `g${i - 4}`;
    state.players.set(id, new PlayerState({ id, nickname: id, isBot: true, connected: true }));
  }
  const round = new Round(state);
  round.start();
  for (const [id, p] of state.players) {
    p.team = id.startsWith("b") ? "blue" : "green";
    const n = Number(id[1]);
    p.role = n === 0 ? "leader" : "";
    p.secretRole = n === 1 ? "detective" : n === 2 ? "spy" : "";
    p.realTeam = n === 2 ? (p.team === "blue" ? "green" : "blue") : p.team;
  }
  // Park everyone in their dens so nothing happens by accident.
  let i = 0;
  for (const p of state.players.values()) Object.assign(p, MAP.spawns[p.team as "blue" | "green"][i++ % 12]);
  state.phase = Phase.Playing;
  const P = (id: string) => state.players.get(id)!;
  const place = (id: string, at: { x: number; y: number }, dx = 0) => Object.assign(P(id), { x: at.x + dx, y: at.y });
  const ticks = (s: number) => {
    for (let k = 0; k < Math.round(s / DT); k++) round.tick(DT);
  };
  const row = (key: string) => state.summary.factors.find((f) => f.key === key)!;
  const endNow = () => {
    state.timeLeft = 1;
    ticks(1.1);
  };
  return { state, round, P, place, ticks, row, endNow };
}

describe("automatic stats (GDD factors)", () => {
  it("a tag counts as 'enemies frozen' for the tagger and 'own players frozen' for the victim", () => {
    const { round, place, row, endNow } = setup();
    place("b3", BLUE_SIDE);
    place("g3", BLUE_SIDE, 40);
    round.act("b3", { kind: "tag", targetId: "g3" });
    endNow();
    expect(row("enemiesFrozen").blue).toBe(1);
    expect(row("ownPlayersFrozen").green).toBe(1);
  });

  it("a completed snatch counts for both teams", () => {
    const { state, round, place, ticks, row, endNow } = setup();
    place("b3", GREEN_SIDE);
    place("g3", GREEN_SIDE, 40);
    state.potlis.get("north")!.carrierId = "b3";
    round.act("g3", { kind: "snatch", targetId: "b3" });
    ticks(CONFIG.timers.snatchCountdownSec + 0.2);
    endNow();
    expect(row("objectSnatched").green).toBe(1);
    expect(row("objectLostToEnemy").blue).toBe(1);
  });

  it("an uncaught spy's secret freezes and survival count for their REAL team", () => {
    const { round, place, row, endNow } = setup();
    place("b2", GREEN_SIDE); // Green's spy in Blue
    place("b3", GREEN_SIDE, 40);
    round.roleAct("b2", { kind: "ice", targetId: "b3" });
    endNow();
    expect(row("spyUntracedFreezes").green).toBe(1);
    expect(row("spySurvived").green).toBe(1); // Green's spy (b2) survived
    expect(row("spySurvived").blue).toBe(1); // Blue's spy (g2) too
  });

  it("a caught spy earns nothing for survival; arrests count both ways", () => {
    const { round, place, row, endNow } = setup();
    place("b1", BLUE_SIDE);
    place("b2", BLUE_SIDE, 40);
    round.roleAct("b1", { kind: "arrest", targetId: "b2" }); // correct
    place("g1", GREEN_SIDE);
    place("g3", GREEN_SIDE, 40);
    round.roleAct("g1", { kind: "arrest", targetId: "g3" }); // wrong
    endNow();
    expect(row("correctArrest").blue).toBe(1);
    expect(row("spySurvived").green).toBe(0);
    expect(row("wrongArrest").green).toBe(1);
  });
});

describe("timeout winner and the summary", () => {
  it("when time runs out, the better stats score wins (GDD)", () => {
    const { state, round, place, endNow } = setup();
    place("b3", BLUE_SIDE);
    place("g3", BLUE_SIDE, 40);
    round.act("b3", { kind: "tag", targetId: "g3" });
    endNow();
    expect(state.endReason).toBe("time");
    expect(state.summary.blueScore).toBeGreaterThan(state.summary.greenScore);
    expect(state.winner).toBe("blue");
  });

  it("equal scores are a draw", () => {
    const { state, endNow } = setup();
    endNow();
    expect(state.summary.blueScore).toBe(state.summary.greenScore);
    expect(state.winner).toBe("draw");
  });

  it("the summary has every factor, key moments, and only awards that apply", () => {
    const { state, round, place, endNow } = setup();
    place("b3", MAP.potliStarts[0]);
    round.act("b3", { kind: "grab", targetId: "north" });
    endNow();
    const s = state.summary;
    expect(s.factors.length).toBe(FACTORS.length);
    expect(s.moments.some((m) => m.includes("grabbed the potli first"))).toBe(true);
    expect([...s.awardIds]).toEqual(expect.arrayContaining(["ate", "lowkey", "npc", "rizz", "sus", "maincharacter", "yapper"]));
    // Situational awards only if the moment happened: no wrong arrest, no fumble, no spy caught.
    expect(s.awardIds.includes("delulu")).toBe(false);
    expect(s.awardIds.includes("fumbled")).toBe(false);
    expect(s.awardIds.includes("caught4k")).toBe(false);
  });

  it("the host can switch the 'settings' awards off", () => {
    const { state, endNow } = setup();
    state.extraAwards = new ArraySchema<string>("yapper");
    endNow();
    expect(state.summary.awardIds.includes("maincharacter")).toBe(false);
    expect(state.summary.awardIds.includes("yapper")).toBe(true);
  });
});

describe("peer awards", () => {
  /** A finished round where b3 froze two Greens (most impact on Blue). Humans: b0, g0. */
  function finished() {
    const t = setup();
    t.place("b3", BLUE_SIDE);
    t.place("g3", BLUE_SIDE, 40);
    t.round.act("b3", { kind: "tag", targetId: "g3" });
    t.endNow();
    t.P("b0").isBot = false;
    t.P("g0").isBot = false;
    const awards = new AwardsPhase(t.state, t.round.stats, () => 0.3);
    awards.open(["b0", "g0"]);
    return { ...t, awards };
  }

  it("validates picks: 3–5, opponents only, each award once, only awards on offer", () => {
    const { awards } = finished();
    expect(awards.submit("g0", [{ awardId: "ate", toId: "b3" }])).toMatch(/at least 3/);
    expect(
      awards.submit("g0", [
        { awardId: "ate", toId: "g3" }, // own team
        { awardId: "npc", toId: "b1" },
        { awardId: "sus", toId: "b2" },
      ]),
    ).toMatch(/opponents/);
    expect(
      awards.submit("g0", [
        { awardId: "ate", toId: "b3" },
        { awardId: "ate", toId: "b1" },
        { awardId: "sus", toId: "b2" },
      ]),
    ).toMatch(/once/);
    expect(
      awards.submit("g0", [
        { awardId: "delulu", toId: "b3" }, // not on offer (no wrong arrest happened)
        { awardId: "npc", toId: "b1" },
        { awardId: "sus", toId: "b2" },
      ]),
    ).toMatch(/on offer/);
  });

  it("points for every award received, an honesty bonus for matching the stats, and an MVP", () => {
    const { state, awards } = finished();
    // g0 (Green) gives "Ate" to b3, who really had Blue's most impact -> honest.
    expect(
      awards.submit("g0", [
        { awardId: "ate", toId: "b3" },
        { awardId: "lowkey", toId: "b3" },
        { awardId: "sus", toId: "b1" },
      ]),
    ).toBe("");
    expect(
      awards.submit("b0", [
        { awardId: "ate", toId: "g1" },
        { awardId: "npc", toId: "g1" },
        { awardId: "rizz", toId: "g1" },
      ]),
    ).toBe("");
    const s = state.summary;
    expect(s.awardsOpen).toBe(false); // everyone voted -> closed early
    const row = (id: string) => s.points.find((p) => p.id === id)!;
    expect(row("g0").honesty).toBeGreaterThanOrEqual(1);
    expect(row("b3").received).toBeGreaterThanOrEqual(2);
    expect(s.mvpId).toBeTruthy();
    expect(s.results.length).toBeGreaterThanOrEqual(6); // humans' 6 + bots' picks
  });

  it("bots vote on their own; voting also closes when the timer runs out", () => {
    const { state, awards } = finished();
    for (let t = 0; t < CONFIG.awards.votingSec + 1; t += 0.5) awards.tick(0.5);
    expect(state.summary.awardsOpen).toBe(false);
    expect(state.summary.results.length).toBeGreaterThan(0); // the 6 bots' awards
    expect(state.summary.results.every((r) => r.fromId !== "b0" && r.fromId !== "g0")).toBe(true);
  });
});

// ------------------------------------------------------------- over the network

let colyseus: ColyseusTestServer<any>;
beforeAll(async () => {
  colyseus = await boot(appConfig, 2595);
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

describe("awards over the network", () => {
  it("only the host can change the award settings, in the lobby", async () => {
    const room = await colyseus.createRoom(ROOM_NAME, {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const friend = await colyseus.connectTo(room, { nickname: "Friend" });
    friend.send(ClientMsg.SetExtraAwards, []);
    await room.waitForNextMessage();
    expect(room.state.extraAwards.length).toBe(5);
    host.send(ClientMsg.SetExtraAwards, ["yapper", "not-an-award"]);
    await room.waitForNextMessage();
    expect([...room.state.extraAwards]).toEqual(["yapper"]);
  });

  it("a round ends -> voting opens -> a human votes -> results", async () => {
    const room = await colyseus.createRoom(ROOM_NAME, {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    host.send(ClientMsg.AddBots, {});
    await room.waitForNextMessage();
    host.send(ClientMsg.Start);
    await room.waitForNextMessage();

    for (const p of room.state.players.values()) if (p.realTeam === "green") p.frozen = true; // wipe-out
    await room.waitForNextTimestep();
    expect(room.state.phase).toBe(Phase.Ended);
    expect(room.state.summary.awardsOpen).toBe(true);

    const me = room.state.players.get(host.sessionId)!;
    const opponents = [...room.state.players.values()].filter((p) => p.realTeam !== me.realTeam);
    const ids = [...room.state.summary.awardIds].slice(0, 3);
    host.send(
      ClientMsg.SubmitAwards,
      ids.map((awardId, i) => ({ awardId, toId: opponents[i % opponents.length].id })),
    );
    await room.waitForNextMessage();
    expect(room.state.summary.awardsOpen).toBe(false); // the only human voted
    expect(room.state.summary.points.length).toBe(room.state.players.size);
  });
});
