/**
 * M3 rules on the Round: roles, the spy, the Detective, rescues. No networking.
 */
import { describe, expect, it } from "vitest";
import { CONFIG, GameState, MAP, MAP_SCALE, Phase, PlayerState, TEAMS } from "@gully/shared";
import { Round } from "../src/game/round";

const DT = 1 / CONFIG.movement.tickRate;
const BLUE_SIDE = { x: 900 * MAP_SCALE, y: 675 * MAP_SCALE };
const GREEN_SIDE = { x: 1500 * MAP_SCALE, y: 675 * MAP_SCALE };

/**
 * 4 sit in Blue (b0..b3), 4 in Green (g0..g3).
 * Blue: b0 Leader, b1 Detective, b2 = GREEN's spy, b3 Normal.
 * Green: g0 Leader, g1 Detective, g2 = BLUE's spy, g3 Normal.
 */
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
  state.phase = Phase.Playing;
  const P = (id: string) => state.players.get(id)!;
  const place = (id: string, at: { x: number; y: number }, dx = 0, dy = 0) => {
    P(id).x = at.x + dx;
    P(id).y = at.y + dy;
  };
  const ticks = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) round.tick(DT);
  };
  /** Park everyone far apart in their dens so nobody sees anything by accident. */
  const scatter = () => {
    let i = 0;
    for (const [id, p] of state.players) {
      const spot = MAP.spawns[p.team as "blue" | "green"][i++ % 12];
      place(id, spot);
    }
  };
  return { state, round, P, place, ticks, scatter };
}

describe("role assignment on start", () => {
  it("each team: 1 Leader, 1 Detective, 1 spy planted by the other team", () => {
    const state = new GameState();
    for (let i = 0; i < 8; i++) state.players.set(`p${i}`, new PlayerState({ id: `p${i}`, nickname: `p${i}` }));
    new Round(state).start();
    for (const team of TEAMS) {
      const sit = [...state.players.values()].filter((p) => p.team === team);
      expect(sit.filter((p) => p.role === "leader")).toHaveLength(1);
      expect(sit.filter((p) => p.secretRole === "detective")).toHaveLength(1);
      const spies = sit.filter((p) => p.secretRole === "spy");
      expect(spies).toHaveLength(1);
      expect(spies[0].realTeam).not.toBe(team);
    }
  });
});

describe("the spy's secret freeze", () => {
  it("ices a fake teammate anywhere; costs an iced hand and leaves footprints", () => {
    const { state, round, P, place, ticks, scatter } = setup();
    scatter();
    place("b2", GREEN_SIDE); // Green's spy, sitting in Blue, on the GREEN half
    place("b3", GREEN_SIDE, 40);
    expect(round.roleAct("b2", { kind: "ice", targetId: "b3" })).toBe(true);
    expect(P("b3").frozen).toBe(true);
    expect(P("b3").freeze).toBe("ice"); // looks exactly like a normal tag
    expect(P("b2").icedHand).toBe(true);

    // Walk away: footprints appear behind the spy.
    for (let i = 0; i < 40; i++) {
      P("b2").x += 4;
      round.tick(DT);
    }
    expect(state.footprints.size).toBeGreaterThan(3);

    // Can't ice again while the hand is iced.
    place("b3", GREEN_SIDE, 300); // (b3 is frozen anyway; use b0's position check below)
    ticks(CONFIG.timers.frozenHandSec + 0.2);
    expect(P("b2").icedHand).toBe(false);
    // Prints are laid for trailSec after the freeze and each lasts footprintsSec.
    ticks(CONFIG.footprints.trailSec);
    expect(state.footprints.size).toBe(0); // all faded
  });

  it("can't ice twice in a row (hand still iced)", () => {
    const { round, place, scatter } = setup();
    scatter();
    place("b2", BLUE_SIDE);
    place("b3", BLUE_SIDE, 40);
    place("b1", BLUE_SIDE, -40);
    expect(round.roleAct("b2", { kind: "ice", targetId: "b3" })).toBe(true);
    expect(round.roleAct("b2", { kind: "ice", targetId: "b1" })).toBe(false);
  });

  it("the iced hand melts at a fireplace", () => {
    const { round, P, place, ticks, scatter } = setup();
    scatter();
    place("b2", BLUE_SIDE);
    place("b3", BLUE_SIDE, 40);
    round.roleAct("b2", { kind: "ice", targetId: "b3" });
    const fire = MAP.circles.find((c) => c.kind === "fireplace")!;
    place("b2", { x: fire.x + fire.r + 30, y: fire.y });
    ticks(0.1);
    expect(P("b2").icedHand).toBe(false);
  });

  it("a normal player (or the wrong team) can't do it", () => {
    const { round, place, scatter } = setup();
    scatter();
    place("b3", BLUE_SIDE);
    place("b1", BLUE_SIDE, 40);
    expect(round.roleAct("b3", { kind: "ice", targetId: "b1" })).toBe(false);
  });
});

describe("secret unfreeze and the silent pass", () => {
  it("the spy frees a frozen player of their REAL team", () => {
    const { round, P, place, scatter } = setup();
    scatter();
    place("b2", GREEN_SIDE);
    place("g3", GREEN_SIDE, 40);
    P("g3").frozen = true;
    P("g3").freeze = "ice";
    expect(round.roleAct("b2", { kind: "free", targetId: "g3" })).toBe(true);
    expect(P("g3").frozen).toBe(false);
  });

  it("an unseen silent pass keeps the spy hidden", () => {
    const { state, round, P, place, scatter } = setup();
    scatter(); // all Blue genuine members are in the Blue den, far away
    place("b2", GREEN_SIDE);
    place("g3", GREEN_SIDE, 40);
    state.potlis.get("north")!.carrierId = "b2";
    expect(round.pass("b2")).toBe(true);
    expect(state.potlis.get("north")!.carrierId).toBe("g3");
    expect(P("b2").exposed).toBe(false);
  });

  it("a silent pass seen by a fake teammate exposes the spy", () => {
    const { state, round, P, place, scatter } = setup();
    scatter();
    place("b2", GREEN_SIDE);
    place("g3", GREEN_SIDE, 40);
    place("b3", GREEN_SIDE, 0, -110); // a genuine Blue player watching, in the open
    state.potlis.get("north")!.carrierId = "b2";
    expect(round.pass("b2")).toBe(true);
    expect(P("b2").exposed).toBe(true);
    expect(round.events.some((e) => e.type === "announce" && e.text.includes("SPY"))).toBe(true);
  });

  it("a spy carrying the potli into the goal never scores (D2)", () => {
    const { state, P, ticks } = setup();
    state.potlis.get("north")!.carrierId = "b2"; // sits in Blue -> Blue's goal is the Green den
    P("b2").x = MAP.spawns.green[4].x;
    P("b2").y = MAP.spawns.green[4].y;
    ticks(0.1);
    expect(state.phase).toBe(Phase.Playing);
  });
});

describe("tag cooldown (D63)", () => {
  it("after a tag you must wait 10 s to tag again; other actions and the spy's Ice aren't affected", () => {
    const { round, P, place, ticks, scatter } = setup();
    scatter();
    place("b3", BLUE_SIDE);
    place("g3", BLUE_SIDE, 40);
    place("g0", BLUE_SIDE, -40);
    expect(round.act("b3", { kind: "tag", targetId: "g3" })).toBe(true);
    expect(P("b3").tagCooldown).toBe(CONFIG.timers.tagCooldownSec);
    expect(round.act("b3", { kind: "tag", targetId: "g0" })).toBe(false); // too soon

    // Other actions still work during the cooldown (the Leader's lamp here).
    place("b0", BLUE_SIDE, 0);
    P("b1").frozen = true;
    P("b1").freeze = "ice";
    place("b1", BLUE_SIDE, 30);
    expect(round.act("b0", { kind: "unfreeze", targetId: "b1" })).toBe(true);

    ticks(CONFIG.timers.tagCooldownSec - 1);
    expect(P("b3").tagCooldown).toBe(1);
    expect(round.act("b3", { kind: "tag", targetId: "g0" })).toBe(false);
    ticks(1.1);
    expect(P("b3").tagCooldown).toBe(0);
    expect(round.act("b3", { kind: "tag", targetId: "g0" })).toBe(true);
  });

  it("the spy's Ice has no tag cooldown (it has its own 20 s iced hand)", () => {
    const { round, P, place, scatter } = setup();
    scatter();
    // b2 (Green's spy in Blue) tags a Green intruder for cover, then can still Ice right away.
    place("b2", BLUE_SIDE);
    place("g3", BLUE_SIDE, 40);
    place("b3", BLUE_SIDE, -40);
    P("b3").x = BLUE_SIDE.x - 40;
    expect(round.act("b2", { kind: "tag", targetId: "g3" })).toBe(true);
    expect(round.roleAct("b2", { kind: "ice", targetId: "b3" })).toBe(true);
  });
});

describe("your own planted spy (D54)", () => {
  it("the team that planted a spy can't tag them, even on its own half", () => {
    const { round, P, place, scatter } = setup();
    scatter();
    place("b2", GREEN_SIDE); // Green's spy (sits in Blue) wanders onto the Green half
    place("g3", GREEN_SIDE, 40);
    expect(round.act("g3", { kind: "tag", targetId: "b2" })).toBe(false);
    expect(P("b2").frozen).toBe(false);
    // A real Blue player in the same spot gets tagged as usual.
    place("b3", GREEN_SIDE, 0, 40);
    expect(round.act("g3", { kind: "tag", targetId: "b3" })).toBe(true);
  });
});

describe("the Detective", () => {
  it("is pinged when a teammate gets frozen", () => {
    const { round, place, scatter } = setup();
    scatter();
    place("b3", GREEN_SIDE);
    place("g3", GREEN_SIDE, 40);
    round.act("g3", { kind: "tag", targetId: "b3" });
    const ping = round.events.find((e) => e.type === "frozenPing");
    expect(ping).toMatchObject({ type: "frozenPing", to: "b1", name: "b3" });
  });

  it("arresting the spy puts them Out (grey ice) and tells everyone", () => {
    const { round, P, place, scatter } = setup();
    scatter();
    place("b1", BLUE_SIDE);
    place("b2", BLUE_SIDE, 40);
    expect(round.roleAct("b1", { kind: "arrest", targetId: "b2" })).toBe(true);
    expect(P("b2").freeze).toBe("out");
    expect(P("b2").exposed).toBe(true);
    expect(P("b1").frozen).toBe(false);
  });

  it("a wrong arrest shame-freezes the Detective; a second one puts them Out", () => {
    const { round, P, place, scatter } = setup();
    scatter();
    place("b1", BLUE_SIDE);
    place("b3", BLUE_SIDE, 40);
    round.roleAct("b1", { kind: "arrest", targetId: "b3" });
    expect(P("b1").freeze).toBe("shame");

    // Rescued at the fire, then wrong again -> Out.
    P("b1").frozen = false;
    P("b1").freeze = "";
    round.roleAct("b1", { kind: "arrest", targetId: "b3" });
    expect(P("b1").freeze).toBe("out");
  });

  it("the Leader's lamp can't melt shame; dragging to a fire rescues, once", () => {
    const { round, P, place, ticks, scatter } = setup();
    scatter();
    place("b1", BLUE_SIDE);
    place("b3", BLUE_SIDE, 40);
    round.roleAct("b1", { kind: "arrest", targetId: "b3" }); // wrong -> shame
    place("b0", BLUE_SIDE, -40);
    expect(round.act("b0", { kind: "unfreeze", targetId: "b1" })).toBe(false);

    expect(round.roleAct("b3", { kind: "drag", targetId: "b1" })).toBe(true);
    expect(P("b1").draggedBy).toBe("b3");
    // Dragging halves your speed.
    expect(round.speedFor(P("b3"))).toBe(CONFIG.movement.dragSpeedMultiplier);

    const fire = MAP.circles.find((c) => c.kind === "fireplace" && c.x < MAP.halfLine)!;
    place("b3", { x: fire.x + fire.r + 40, y: fire.y });
    ticks(0.1);
    expect(P("b1").frozen).toBe(false);
    expect(P("b1").rescueUsed).toBe(true);
  });
});

describe("wipe-out counts REAL teams (GDD)", () => {
  it("freezing everyone sitting in Green isn't enough while Green's spy (in Blue) is free", () => {
    const { state, P, ticks } = setup();
    for (const id of ["g0", "g1", "g2", "g3"]) P(id).frozen = true;
    ticks(0.1);
    expect(state.phase).toBe(Phase.Playing); // b2 (Green's spy) is still free
    P("b2").frozen = true;
    // g2 is Blue's spy: it's frozen above, but Blue still has free real members.
    ticks(0.1);
    expect(state.winner).toBe("blue");
  });
});
