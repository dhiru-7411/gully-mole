/**
 * Round rules (M2), tested directly on a GameState: no networking needed.
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG,
  GameState,
  MAP,
  MAP_SCALE,
  Phase,
  PlayerState,
  roundDurationSeconds,
  stepPlayer,
} from "@gully/shared";
import { Round } from "../src/game/round";
import { BotBrain } from "../src/bots";

const DT = 1 / CONFIG.movement.tickRate;
const BLUE_SIDE = { x: 900 * MAP_SCALE, y: 675 * MAP_SCALE }; // Blue half, open ground
const GREEN_SIDE = { x: 1500 * MAP_SCALE, y: 675 * MAP_SCALE }; // Green half, open ground

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
    // No secret roles unless a test sets them (M3 tests below do).
    p.secretRole = "";
    p.realTeam = p.team;
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
  it("one Leader per team, two potlis on the half line (north + south), timer from the GDD formula", () => {
    const state = new GameState();
    for (let i = 0; i < 9; i++) state.players.set(`p${i}`, new PlayerState({ id: `p${i}`, nickname: `p${i}` }));
    new Round(state).start();
    const leaders = [...state.players.values()].filter((p) => p.role === "leader");
    expect(leaders.map((l) => l.team).sort()).toEqual(["blue", "green"]);
    const north = state.potlis.get("north")!;
    const south = state.potlis.get("south")!;
    expect(north.x).toBe(MAP.halfLine);
    expect(south.x).toBe(MAP.halfLine);
    expect(north.y).toBeLessThan(MAP.middleZone.y);
    expect(south.y).toBeGreaterThan(MAP.middleZone.y);
    expect(north.carrierId + south.carrierId + north.scoredBy + south.scoredBy).toBe("");
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
    state.potlis.get("north")!.carrierId = "g1";
    ticks(0.1);
    place("b1", BLUE_SIDE);
    round.act("b1", { kind: "tag", targetId: "g1" });
    expect(state.potlis.get("north")!.carrierId).toBe("");
    expect(state.potlis.get("north")!.x).toBeCloseTo(P("g1").x);
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
    place("b1", MAP.potliStarts[0]); // the north potli
    expect(round.act("b1", { kind: "grab", targetId: "north" })).toBe(true);
    expect(state.potlis.get("north")!.carrierId).toBe("b1");
  });

  it("pass only to a teammate right beside you", () => {
    const { state, round, place } = setup();
    place("b1", BLUE_SIDE);
    place("b2", BLUE_SIDE, 300);
    state.potlis.get("north")!.carrierId = "b1";
    expect(round.pass("b1")).toBe(false);
    place("b2", BLUE_SIDE, 40);
    expect(round.pass("b1")).toBe(true);
    expect(state.potlis.get("north")!.carrierId).toBe("b2");
  });

  it("snatch takes the full countdown, then the potli changes hands", () => {
    const { state, round, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    state.potlis.get("north")!.carrierId = "b1";
    expect(round.act("g1", { kind: "snatch", targetId: "b1" })).toBe(true);
    ticks(CONFIG.timers.snatchCountdownSec - 0.5);
    expect(state.potlis.get("north")!.carrierId).toBe("b1");
    ticks(0.6);
    expect(state.potlis.get("north")!.carrierId).toBe("g1");
  });

  it("running away cancels the snatch", () => {
    const { state, round, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    state.potlis.get("north")!.carrierId = "b1";
    round.act("g1", { kind: "snatch", targetId: "b1" });
    ticks(1);
    place("b1", GREEN_SIDE, 300);
    ticks(0.1);
    expect(state.potlis.get("north")!.snatcherId).toBe("");
    ticks(3);
    expect(state.potlis.get("north")!.carrierId).toBe("b1");
  });

  it("passing during the countdown beats the snatch", () => {
    const { state, round, place, ticks } = setup();
    place("b1", GREEN_SIDE);
    place("g1", GREEN_SIDE, 40);
    place("b2", GREEN_SIDE, -40);
    state.potlis.get("north")!.carrierId = "b1";
    round.act("g1", { kind: "snatch", targetId: "b1" });
    ticks(1);
    expect(round.pass("b1")).toBe(true);
    ticks(3);
    expect(state.potlis.get("north")!.carrierId).toBe("b2");
  });
});

describe("winning (score, wipe-out, time)", () => {
  it("carrying a potli into the ENEMY den drops it there, scored; both scored = win (D39, D68)", () => {
    const { state, P, ticks } = setup();
    const north = state.potlis.get("north")!;
    const south = state.potlis.get("south")!;
    north.carrierId = "b1";
    P("b1").x = MAP.spawns.green[4].x;
    P("b1").y = MAP.spawns.green[4].y;
    ticks(0.1);
    expect(north.scoredBy).toBe("blue");
    expect(north.carrierId).toBe(""); // dropped in the den, hands free
    expect(state.phase).toBe(Phase.Playing); // one isn't enough

    south.carrierId = "b2";
    P("b2").x = MAP.spawns.green[5].x;
    P("b2").y = MAP.spawns.green[5].y;
    ticks(0.1);
    expect(state.phase).toBe(Phase.Ended);
    expect(state.winner).toBe("blue");
    expect(state.endReason).toBe("home");
  });

  it("the defenders can steal a scored potli back out of their den (but the scorers can't re-grab it)", () => {
    const { state, round, P, ticks } = setup();
    const north = state.potlis.get("north")!;
    north.carrierId = "b1";
    P("b1").x = MAP.spawns.green[4].x;
    P("b1").y = MAP.spawns.green[4].y;
    ticks(0.1);
    expect(north.scoredBy).toBe("blue");
    // Blue can't take its own scored potli back out.
    expect(round.act("b1", { kind: "grab", targetId: "north" })).toBe(false);
    // A Green player in their den grabs it: no longer scored.
    P("g3").x = north.x;
    P("g3").y = north.y;
    expect(round.act("g3", { kind: "grab", targetId: "north" })).toBe(true);
    expect(north.scoredBy).toBe("");
    expect(north.carrierId).toBe("g3");
  });

  it("one at a time: you can't grab a second potli while carrying one", () => {
    const { state, round, P } = setup();
    state.potlis.get("north")!.carrierId = "b1";
    const south = state.potlis.get("south")!;
    P("b1").x = south.x;
    P("b1").y = south.y;
    expect(round.act("b1", { kind: "grab", targetId: "south" })).toBe(false);
  });

  it("inside their den, defenders can be tagged by the attackers (D68)", () => {
    const { round, P } = setup();
    const den = MAP.dens.green; // Blue's goal, on the Green half
    P("g3").x = den.x + den.w / 2;
    P("g3").y = den.y + den.h / 2;
    P("b3").x = P("g3").x - 40;
    P("b3").y = P("g3").y;
    expect(round.act("b3", { kind: "tag", targetId: "g3" })).toBe(true);
    expect(P("g3").frozen).toBe(true);
  });

  it("carrying it into your OWN den does nothing", () => {
    const { state, P, ticks } = setup();
    state.potlis.get("north")!.carrierId = "b1";
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
    state.potlis.get("north")!.carrierId = "b0";
    expect(round.speedFor(P("b0"))).toBeCloseTo(carry * bonus);
    P("b2").frozen = true;
    expect(round.speedFor(P("b0"))).toBe(carry);
  });
});

describe("spy bots and cover", () => {
  it("a spy bot never freezes its real teammates when no fake teammate is watching", () => {
    const { state, P, place } = setup();
    // b2 becomes Green's spy sitting in Blue; g1 (Green) stands on the Blue half beside it.
    P("b2").secretRole = "spy";
    P("b2").realTeam = "green";
    // Everyone else far away in their dens.
    let i = 0;
    for (const [id, p] of state.players) if (id !== "b2" && id !== "g1") place(id, MAP.spawns[p.team as "blue" | "green"][i++ % 12]);
    place("b2", BLUE_SIDE);
    place("g1", BLUE_SIDE, 40);
    const brain = new BotBrain(() => 0.99); // "random" never forces anything
    for (let t = 0; t < 60; t++) {
      const d = brain.next(P("b2"), state, CONFIG.movement.tickRate);
      expect(d.action?.kind === "tag" && d.action.targetId === "g1").toBe(false);
    }
  });
});

describe("bots (simulation)", () => {
  /** Runs a whole bots-only game on the server logic, no network. */
  function simulate(seconds: number, setupFn?: (s: ReturnType<typeof setup>) => void, activeIds?: string[]) {
    const s = setup();
    s.state.easyBots = false; // normal bots (easy bots never grab)
    setupFn?.(s);
    const active = activeIds ?? [...s.state.players.keys()];
    const brains = new Map(active.map((id) => [id, new BotBrain()]));
    let grabs = 0;
    let freezes = 0;
    for (let i = 0; i < seconds * CONFIG.movement.tickRate && s.state.phase === Phase.Playing; i++) {
      const carriedBefore = [...s.state.potlis.values()].filter((p) => p.carrierId).length;
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
      if ([...s.state.potlis.values()].filter((p) => p.carrierId).length > carriedBefore) grabs++;
      if ([...s.state.players.values()].filter((p) => p.frozen).length > frozenBefore) freezes++;
    }
    return { ...s, grabs, freezes };
  }

  it("a bot carrying the potli finds its way into the enemy den through the zig-zag", () => {
    const { state } = simulate(
      40,
      ({ state, P }) => {
        // Everyone else stands still in their dens; only b1 plays. South is already scored,
        // so delivering north wins (D68).
        P("b1").x = MAP.middleZone.x;
        P("b1").y = MAP.middleZone.y;
        state.potlis.get("north")!.carrierId = "b1";
        const den = MAP.dens.green;
        Object.assign(state.potlis.get("south")!, { scoredBy: "blue", x: den.x + den.w / 2, y: den.y + den.h / 2 });
      },
      ["b1"],
    );
    expect(state.winner).toBe("blue");
    expect(state.endReason).toBe("home");
  });

  it("easy bots (D52) never take the potli", () => {
    const { grabs, state } = simulate(30, (s) => {
      s.state.easyBots = true;
    });
    expect(grabs).toBe(0);
    expect(state.potlis.get("north")!.carrierId).toBe("");
  });

  it("a full bots game has grabs and tags, and finishes or keeps going sensibly", () => {
    const { grabs, freezes, state } = simulate(120);
    expect(grabs).toBeGreaterThan(0);
    expect(freezes).toBeGreaterThan(0);
    expect([Phase.Playing, Phase.Ended]).toContain(state.phase);
  });
});
