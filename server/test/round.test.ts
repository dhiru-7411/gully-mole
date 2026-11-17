/**
 * Round rules (M2), tested directly on a GameState: no networking needed.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  GameState,
  MAP,
  Phase,
  PlayerState,
  roundDurationSeconds,
  stepPlayer,
} from "@gully/shared";
import { Round } from "../src/game/round";
import { BotBrain } from "../src/bots";

const DT = 1 / CONFIG.movement.tickRate;
const BLUE_SIDE = { x: 900, y: 675 }; // Blue half, open ground
const GREEN_SIDE = { x: 1500, y: 675 }; // Green half, open ground

/** A started round with 4 Blue (b0..b3) and 4 Green (g0..g3). b0 and g0 lead. */
function setup() {
  const state = new GameState();
  for (let i = 0; i < 8; i++) {
    const id = i < 4 ? `b${i}` : `g${i - 4}`;
    state.players.set(id, new PlayerState({ id, nickname: id, isBot: true, connected: true }));
  }
  const round = new Round(state);
  round.start();
  // Force known teams/roles for readable tests.
  for (const [id, p] of state.players) {
    p.team = id.startsWith("b") ? "blue" : "green";
    p.role = id === "b0" || id === "g0" ? "leader" : "";
  }
  state.phase = Phase.Playing;
  const P = (id: string) => state.players.get(id)!;
  const place = (id: string, at: { x: number; y: number }, dx = 0) => {
    P(id).x = at.x + dx;
    P(id).y = at.y;
  };
  const ticks = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) round.tick(DT);
  };
  return { state, round, P, place, ticks };
}

describe("round setup", () => {
  it("one Leader per team, potli in the middle, timer from the GDD formula", () => {
    const state = new GameState();
    for (let i = 0; i < 9; i++) state.players.set(`p${i}`, new PlayerState({ id: `p${i}`, nickname: `p${i}` }));
    new Round(state).start();
    const leaders = [...state.players.values()].filter((p) => p.role === "leader");
    expect(leaders.map((l) => l.team).sort()).toEqual(["blue", "green"]);
    expect(state.potli.x).toBe(MAP.middleZone.x);
    expect(state.potli.carrierId).toBe("");
    expect(state.timeLeft).toBe(roundDurationSeconds(9));
  });
});

describe("tagging and freezing", () => {
  it("Blue tags a Green intruder on the Blue half", () => {
    const { round, P, place } = setup();
    place("b1", BLUE_SIDE);
    place("g1", BLUE_SIDE, 40);
    expect(round.act("b1", { kind: "tag", targetId: "g1" })).toBe(true);
    expect(P("g1").frozen).toBe(true);
  });

  it("can't tag on the enemy's half", () => {
    const { round, P, place } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    expect(round.act("b1", { kind: "tag", targetId: "g1" })).toBe(false);
    expect(P("g1").frozen).toBe(false);
  });

  it("a frozen carrier drops the potli where they stand", () => {
    const { state, round, P, place, ticks } = setup();
    place("g1", BLUE_SIDE, 40);
    state.potli.carrierId = "g1";
    ticks(0.1);
    place("b1", BLUE_SIDE);
    round.act("b1", { kind: "tag", targetId: "g1" });
    expect(state.potli.carrierId).toBe("");
    expect(state.potli.x).toBeCloseTo(P("g1").x);
  });
});

describe("the Leader's fire lamp", () => {
  it("the Leader unfreezes a teammate; a normal player can't", () => {
    const { round, P, place } = setup();
    place("b0", BLUE_SIDE);
    place("b1", BLUE_SIDE, 40);
    place("b2", BLUE_SIDE, -40);
    P("b1").frozen = true;
    expect(round.act("b2", { kind: "unfreeze", targetId: "b1" })).toBe(false);
    expect(round.act("b0", { kind: "unfreeze", targetId: "b1" })).toBe(true);
    expect(P("b1").frozen).toBe(false);
  });

  it("a frozen Leader thaws after ~10 s, then is protected for a moment", () => {
    const { round, P, place, ticks } = setup();
    place("b0", BLUE_SIDE);
    place("g1", BLUE_SIDE, 40);
    // Green intruder can't tag on the Blue half... so freeze b0 on the Green half instead.
    place("b0", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    round.act("g1", { kind: "tag", targetId: "b0" });
    expect(P("b0").frozen).toBe(true);
    expect(P("b0").thawIn).toBe(CONFIG.timers.leaderAutoThawSec);

    ticks(CONFIG.timers.leaderAutoThawSec - 0.5);
    expect(P("b0").frozen).toBe(true);
    expect(P("b0").thawIn).toBe(1);
    ticks(0.6);
    expect(P("b0").frozen).toBe(false);
    expect(P("b0").protected).toBe(true);
    expect(round.act("g1", { kind: "tag", targetId: "b0" })).toBe(false); // protected
    ticks(CONFIG.timers.leaderProtectionSec + 0.1);
    expect(P("b0").protected).toBe(false);
  });

  it("a normal frozen player never thaws on their own", () => {
    const { round, P, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    round.act("g1", { kind: "tag", targetId: "b1" });
    ticks(30);
    expect(P("b1").frozen).toBe(true);
  });
});

describe("grab, pass, snatch", () => {
  it("grab a loose potli by pressing the button on it (D33)", () => {
    const { state, round, place } = setup();
    place("b1", MAP.middleZone);
    expect(round.act("b1", { kind: "grab", targetId: "" })).toBe(true);
    expect(state.potli.carrierId).toBe("b1");
  });

  it("pass only to a teammate right beside you", () => {
    const { state, round, place } = setup();
    place("b1", BLUE_SIDE);
    place("b2", BLUE_SIDE, 300);
    state.potli.carrierId = "b1";
    expect(round.pass("b1")).toBe(false);
    place("b2", BLUE_SIDE, 40);
    expect(round.pass("b1")).toBe(true);
    expect(state.potli.carrierId).toBe("b2");
  });

  it("snatch takes the full countdown, then the potli changes hands", () => {
    const { state, round, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    state.potli.carrierId = "b1";
    expect(round.act("g1", { kind: "snatch", targetId: "b1" })).toBe(true);
    ticks(CONFIG.timers.snatchCountdownSec - 0.5);
    expect(state.potli.carrierId).toBe("b1");
    ticks(0.6);
    expect(state.potli.carrierId).toBe("g1");
  });

  it("running away cancels the snatch", () => {
    const { state, round, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    state.potli.carrierId = "b1";
    round.act("g1", { kind: "snatch", targetId: "b1" });
    ticks(1);
    place("b1", GREEN_SIDE, 300);
    ticks(0.1);
    expect(state.potli.snatcherId).toBe("");
    ticks(3);
    expect(state.potli.carrierId).toBe("b1");
  });

  it("passing during the countdown beats the snatch", () => {
    const { state, round, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    place("b2", GREEN_SIDE, -40);
    state.potli.carrierId = "b1";
    round.act("g1", { kind: "snatch", targetId: "b1" });
    ticks(1);
    expect(round.pass("b1")).toBe(true);
    ticks(3);
    expect(state.potli.carrierId).toBe("b2");
  });
});

describe("winning (score, wipe-out, time)", () => {
  it("carrying the potli into the ENEMY den scores (D39)", () => {
    const { state, P, ticks } = setup();
    state.potli.carrierId = "b1";
    P("b1").x = MAP.spawns.green[4].x;
    P("b1").y = MAP.spawns.green[4].y;
    ticks(0.1);
    expect(state.phase).toBe(Phase.Ended);
    expect(state.winner).toBe("blue");
    expect(state.endReason).toBe("home");
  });

  it("carrying it into your OWN den does nothing", () => {
    const { state, P, ticks } = setup();
    state.potli.carrierId = "b1";
    P("b1").x = MAP.spawns.blue[4].x;
    P("b1").y = MAP.spawns.blue[4].y;
    ticks(0.1);
    expect(state.phase).toBe(Phase.Playing);
  });

  it("freezing the whole enemy team at once wins (wipe-out)", () => {
    const { state, P, ticks } = setup();
    for (const id of ["g0", "g1", "g2", "g3"]) P(id).frozen = true;
    ticks(0.1);
    expect(state.winner).toBe("blue");
    expect(state.endReason).toBe("wipeout");
  });

  it("time running out is a draw for now (D37)", () => {
    const { state, ticks } = setup();
    state.timeLeft = 2;
    ticks(2.1);
    expect(state.winner).toBe("draw");
    expect(state.endReason).toBe("time");
  });

  it("the Leader runs faster while carrying, unless a teammate is frozen", () => {
    const { state, round, P } = setup();
    const { carrierSpeedMultiplier: carry, leaderCarrySpeedBonus: bonus } = CONFIG.movement;
    state.potli.carrierId = "b0";
    expect(round.speedFor(P("b0"))).toBeCloseTo(carry * bonus);
    P("b2").frozen = true;
    expect(round.speedFor(P("b0"))).toBe(carry);
  });
});

describe("bots (simulation)", () => {
  /** Runs a whole bots-only game on the server logic, no network. */
  function simulate(seconds: number, setupFn?: (s: ReturnType<typeof setup>) => void, activeIds?: string[]) {
    const s = setup();
    setupFn?.(s);
    const active = activeIds ?? [...s.state.players.keys()];
    const brains = new Map(active.map((id) => [id, new BotBrain()]));
    let grabs = 0;
    let freezes = 0;
    for (let i = 0; i < seconds * CONFIG.movement.tickRate && s.state.phase === Phase.Playing; i++) {
      const carrierBefore = s.state.potli.carrierId;
      const frozenBefore = [...s.state.players.values()].filter((p) => p.frozen).length;
      for (const [id, p] of s.state.players) {
        const brain = brains.get(id);
        if (!brain) continue; // inactive: stands still
        const d = brain.next(p, s.state, CONFIG.movement.tickRate);
        if (!p.frozen) stepPlayer(p, d.move, DT, s.round.speedFor(p));
        if (d.action) s.round.act(id, d.action);
        if (d.pass) s.round.pass(id);
      }
      s.round.tick(DT);
      if (!carrierBefore && s.state.potli.carrierId) grabs++;
      if ([...s.state.players.values()].filter((p) => p.frozen).length > frozenBefore) freezes++;
    }
    return { ...s, grabs, freezes };
  }

  it("a bot carrying the potli finds its way into the enemy den through the zig-zag", () => {
    const { state } = simulate(
      40,
      ({ state, P }) => {
        // Everyone else stands still in their dens; only b1 plays.
        P("b1").x = MAP.middleZone.x;
        P("b1").y = MAP.middleZone.y;
        state.potli.carrierId = "b1";
      },
      ["b1"],
    );
    expect(state.winner).toBe("blue");
    expect(state.endReason).toBe("home");
  });

  it("a full bots game has grabs and tags, and finishes or keeps going sensibly", () => {
    const { grabs, freezes, state } = simulate(120);
    expect(grabs).toBeGreaterThan(0);
    expect(freezes).toBeGreaterThan(0);
    expect([Phase.Playing, Phase.Ended]).toContain(state.phase);
  });
});
