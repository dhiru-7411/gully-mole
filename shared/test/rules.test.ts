import { describe, expect, it } from "vitest";
import {
  CONFIG,
  MAP,
  MAP_SCALE,
  bestAction,
  canGrab,
  canPass,
  canSnatch,
  canTag,
  canUnfreeze,
  goalDen,
  inDen,
  inGoal,
  isActionAllowed,
  passTarget,
  speedMultiplier,
  type RulePlayer,
  type RulePotli,
} from "../src";

const blueSpot = { x: 900 * MAP_SCALE, y: 675 * MAP_SCALE }; // on the Blue half
const greenSpot = { x: 1500 * MAP_SCALE, y: 675 * MAP_SCALE }; // on the Green half

const p = (id: string, team: string, at: { x: number; y: number }, extra: Partial<RulePlayer> = {}): RulePlayer => ({
  id,
  team,
  role: "",
  x: at.x,
  y: at.y,
  frozen: false,
  protected: false,
  ...extra,
});
const loose = (at = { x: 0, y: 0 }): RulePotli => ({ ...at, carrierId: "", snatcherId: "" });
const near = (at: { x: number; y: number }, dx = 40) => ({ x: at.x + dx, y: at.y });

describe("tagging (D1: target must be on the tagger's half)", () => {
  it("Blue can tag a Green player standing on the Blue half", () => {
    expect(canTag(p("b", "blue", blueSpot), p("g", "green", near(blueSpot)))).toBe(true);
  });

  it("Blue can't tag a Green player on the Green half", () => {
    expect(canTag(p("b", "blue", greenSpot), p("g", "green", near(greenSpot)))).toBe(false);
  });

  it("can't tag teammates, frozen or protected players, or from too far", () => {
    const me = p("b", "blue", blueSpot);
    expect(canTag(me, p("b2", "blue", near(blueSpot)))).toBe(false);
    expect(canTag(me, p("g", "green", near(blueSpot), { frozen: true }))).toBe(false);
    expect(canTag(me, p("g", "green", near(blueSpot), { protected: true }))).toBe(false);
    expect(canTag(me, p("g", "green", near(blueSpot, CONFIG.distances.tag + 1)))).toBe(false);
  });

  it("can't tag again during the 10 s cooldown (D63)", () => {
    const me = p("b", "blue", blueSpot, { tagCooldown: 7 });
    expect(canTag(me, p("g", "green", near(blueSpot)))).toBe(false);
    expect(canTag({ ...me, tagCooldown: 0 }, p("g", "green", near(blueSpot)))).toBe(true);
  });

  it("a frozen player can't tag", () => {
    expect(canTag(p("b", "blue", blueSpot, { frozen: true }), p("g", "green", near(blueSpot)))).toBe(false);
  });
});

describe("Leader's fire lamp", () => {
  it("only the Leader can unfreeze, only teammates", () => {
    const leader = p("L", "blue", blueSpot, { role: "leader" });
    const normal = p("n", "blue", blueSpot);
    const frozenMate = p("m", "blue", near(blueSpot), { frozen: true });
    const frozenEnemy = p("e", "green", near(blueSpot), { frozen: true });
    expect(canUnfreeze(leader, frozenMate)).toBe(true);
    expect(canUnfreeze(normal, frozenMate)).toBe(false);
    expect(canUnfreeze(leader, frozenEnemy)).toBe(false);
  });

  it("a frozen Leader can't use the lamp", () => {
    const leader = p("L", "blue", blueSpot, { role: "leader", frozen: true });
    expect(canUnfreeze(leader, p("m", "blue", near(blueSpot), { frozen: true }))).toBe(false);
  });
});

describe("the potli", () => {
  it("grab only when it's loose and you're on it", () => {
    const me = p("b", "blue", blueSpot);
    expect(canGrab(me, loose(blueSpot))).toBe(true);
    expect(canGrab(me, loose(near(blueSpot, 200)))).toBe(false);
    expect(canGrab(me, { ...loose(blueSpot), carrierId: "x" })).toBe(false);
    expect(canGrab(p("b", "blue", blueSpot, { frozen: true }), loose(blueSpot))).toBe(false);
  });

  it("snatch an enemy carrier beside you, on either half", () => {
    const carrier = p("g", "green", greenSpot);
    const potli = { ...loose(greenSpot), carrierId: "g" };
    expect(canSnatch(p("b", "blue", near(greenSpot)), carrier, potli)).toBe(true);
    expect(canSnatch(p("g2", "green", near(greenSpot)), carrier, potli)).toBe(false); // own team
    expect(canSnatch(p("b", "blue", near(greenSpot, 200)), carrier, potli)).toBe(false); // too far
    expect(canSnatch(p("b", "blue", near(greenSpot)), carrier, { ...potli, snatcherId: "other" })).toBe(false);
  });

  it("pass only to a free teammate right beside you", () => {
    const me = p("b", "blue", blueSpot);
    const potli = { ...loose(blueSpot), carrierId: "b" };
    expect(canPass(me, p("b2", "blue", near(blueSpot)), potli)).toBe(true);
    expect(canPass(me, p("b2", "blue", near(blueSpot, CONFIG.distances.handOff + 5)), potli)).toBe(false);
    expect(canPass(me, p("b2", "blue", near(blueSpot), { frozen: true }), potli)).toBe(false);
    expect(canPass(me, p("g", "green", near(blueSpot)), potli)).toBe(false);
    expect(canPass(me, p("b2", "blue", near(blueSpot)), loose(blueSpot))).toBe(false); // not carrying
  });

  it("passTarget picks the nearest eligible teammate", () => {
    const me = p("b", "blue", blueSpot);
    const potli = { ...loose(blueSpot), carrierId: "b" };
    const players = [me, p("far", "blue", near(blueSpot, 60)), p("close", "blue", near(blueSpot, 30))];
    expect(passTarget(me, players, potli)?.id).toBe("close");
  });
});

describe("the smart button (D32: Unfreeze > Tag > Snatch > Grab)", () => {
  it("prefers unfreezing a teammate over tagging", () => {
    const me = p("L", "blue", blueSpot, { role: "leader" });
    const players = [me, p("m", "blue", near(blueSpot), { frozen: true }), p("g", "green", near(blueSpot, -40))];
    expect(bestAction(me, players, loose({ x: 0, y: 0 }))?.kind).toBe("unfreeze");
  });

  it("prefers tagging over grabbing", () => {
    const me = p("b", "blue", blueSpot);
    const players = [me, p("g", "green", near(blueSpot))];
    expect(bestAction(me, players, loose(blueSpot))?.kind).toBe("tag");
  });

  it("offers Grab when standing on a loose potli and nothing else is possible", () => {
    const me = p("b", "blue", blueSpot);
    expect(bestAction(me, [me], loose(blueSpot))).toEqual({ kind: "grab", targetId: "" });
  });

  it("nothing to do -> null (button greys out)", () => {
    const me = p("b", "blue", blueSpot);
    expect(bestAction(me, [me], loose({ x: 0, y: 0 }))).toBeNull();
  });

  it("server double-checks what the client asked for", () => {
    const me = p("b", "blue", greenSpot);
    const enemy = p("g", "green", near(greenSpot)); // enemy on the GREEN half
    const players = new Map([[me.id, me], [enemy.id, enemy]]);
    expect(isActionAllowed(me, { kind: "tag", targetId: "g" }, players, loose())).toBe(false);
    expect(isActionAllowed(me, { kind: "fly" as any, targetId: "g" }, players, loose())).toBe(false);
  });
});

describe("dens and the Leader speed bonus", () => {
  it("inDen knows each den", () => {
    expect(inDen("blue", MAP.spawns.blue[0])).toBe(true);
    expect(inDen("green", MAP.spawns.blue[0])).toBe(false);
  });

  it("you score in the ENEMY den, at the far end of their half (D39)", () => {
    expect(goalDen("blue")).toBe(MAP.dens.green);
    expect(goalDen("green")).toBe(MAP.dens.blue);
    expect(inGoal("blue", MAP.spawns.green[0])).toBe(true);
    expect(inGoal("blue", MAP.spawns.blue[0])).toBe(false);
  });

  it("carrying slows you; a Leader carrier gets the bonus only with no teammate frozen", () => {
    const { carrierSpeedMultiplier: carry, leaderCarrySpeedBonus: bonus } = CONFIG.movement;
    const leader = p("L", "blue", blueSpot, { role: "leader" });
    const mate = p("m", "blue", blueSpot);
    const leaderCarrying = { ...loose(), carrierId: "L" };
    expect(speedMultiplier(leader, [leader, mate], loose())).toBe(1);
    expect(speedMultiplier(mate, [leader, mate], { ...loose(), carrierId: "m" })).toBe(carry);
    expect(speedMultiplier(leader, [leader, mate], leaderCarrying)).toBeCloseTo(carry * bonus);
    expect(speedMultiplier(leader, [leader, { ...mate, frozen: true }], leaderCarrying)).toBe(carry);
  });
});
