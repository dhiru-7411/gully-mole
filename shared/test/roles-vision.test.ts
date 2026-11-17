import { describe, expect, it } from "vitest";
import {
  CONFIG,
  MAP,
  assignRoles,
  bestRoleAction,
  canArrest,
  canDrag,
  canFree,
  canIce,
  canPass,
  canSee,
  canUnfreeze,
  clearSight,
  nearFireplace,
  spiesFor,
  visibilityPolygon,
  visionRadius,
  type RulePlayer,
} from "../src";

const ids = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("role assignment (GDD team-size table)", () => {
  it("team of 4: Leader, Detective, 1 spy from the other team, 1 Normal", () => {
    const r = assignRoles("blue", ids(4));
    const v = [...r.values()];
    expect(v.filter((a) => a.role === "leader")).toHaveLength(1);
    expect(v.filter((a) => a.secretRole === "detective")).toHaveLength(1);
    const spies = v.filter((a) => a.secretRole === "spy");
    expect(spies).toHaveLength(1);
    expect(spies[0].realTeam).toBe("green"); // planted by the other team
    expect(v.filter((a) => a.secretRole === "" && a.role === "")).toHaveLength(1);
  });

  it("teams of 7+ get a second spy", () => {
    expect(spiesFor(4)).toBe(1);
    expect(spiesFor(6)).toBe(1);
    expect(spiesFor(7)).toBe(2);
    const v = [...assignRoles("green", ids(8)).values()];
    expect(v.filter((a) => a.secretRole === "spy" && a.realTeam === "blue")).toHaveLength(2);
  });

  it("only spies have a different real team", () => {
    for (const a of assignRoles("blue", ids(6)).values()) {
      expect(a.realTeam === "blue").toBe(a.secretRole !== "spy");
    }
  });

  it("roles are random each round", () => {
    const leader = () => [...assignRoles("blue", ids(6)).entries()].find(([, a]) => a.role === "leader")![0];
    const seen = new Set(Array.from({ length: 40 }, leader));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("line of sight (D51)", () => {
  it("open ground is clear, a building blocks", () => {
    expect(clearSight({ x: 1100, y: 675 }, { x: 1300, y: 675 })).toBe(true);
    // Building at x 560..760, y 470..580: look straight through it.
    expect(clearSight({ x: 660, y: 440 }, { x: 660, y: 610 })).toBe(false);
  });

  it("canSee respects the vision radius", () => {
    // Straight up from the potli spot is open ground.
    const r = CONFIG.vision.radius;
    expect(canSee({ x: 1200, y: 675 }, { x: 1200, y: 675 - r + 5 })).toBe(true);
    expect(canSee({ x: 1200, y: 675 }, { x: 1200, y: 675 - r - 5 })).toBe(false);
  });

  it("Detectives and spies see further than everyone else (D53)", () => {
    expect(visionRadius({ secretRole: "" })).toBe(CONFIG.vision.radius);
    expect(visionRadius({ secretRole: "detective" })).toBe(CONFIG.vision.roleRadius);
    expect(visionRadius({ secretRole: "spy" })).toBe(CONFIG.vision.roleRadius);
    expect(CONFIG.vision.roleRadius).toBeGreaterThan(CONFIG.vision.radius);
    // A blob just beyond normal range, straight up from the potli spot (open ground):
    const from = { x: 1200, y: 675 };
    const to = { x: 1200, y: 675 - (CONFIG.vision.radius + 20) };
    expect(canSee(from, to, visionRadius({ secretRole: "" }))).toBe(false);
    expect(canSee(from, to, visionRadius({ secretRole: "spy" }))).toBe(true);
  });

  it("the vision circle fits on screen (camera shows more than you can see)", () => {
    expect(CONFIG.vision.roleRadius * 2).toBeLessThanOrEqual(CONFIG.camera.viewHeight + 60);
  });

  it("fireplaces don't block sight", () => {
    const f = MAP.circles.find((c) => c.kind === "fireplace")!;
    expect(clearSight({ x: f.x - 60, y: f.y }, { x: f.x + 60, y: f.y })).toBe(true);
  });

  it("the visibility polygon stops at walls", () => {
    const poly = visibilityPolygon({ x: 660, y: 440 }, 300, 360);
    const down = poly[90]; // angle 90° = straight down, into the building top at y=470
    expect(down.y).toBeLessThan(475);
    // ...while some other directions are open all the way to the vision radius.
    const longest = Math.max(...poly.map((p) => Math.hypot(p.x - 660, p.y - 440)));
    expect(longest).toBeCloseTo(300, 0);
  });
});

// ------------------------------------------------------------- role rules

const base = (id: string, team: string, x: number, extra: Partial<RulePlayer> = {}): RulePlayer => ({
  id,
  team,
  role: "",
  x,
  y: 675,
  frozen: false,
  protected: false,
  freeze: "",
  secretRole: "",
  realTeam: team,
  ...extra,
});

describe("Detective", () => {
  it("can arrest a teammate within reach, not an enemy, not someone Out", () => {
    const det = base("d", "blue", 900, { secretRole: "detective" });
    expect(canArrest(det, base("m", "blue", 940))).toBe(true);
    expect(canArrest(det, base("e", "green", 940))).toBe(false);
    expect(canArrest(det, base("m", "blue", 940, { frozen: true, freeze: "out" }))).toBe(false);
    expect(canArrest(det, base("m", "blue", 940, { frozen: true, freeze: "ice" }))).toBe(true);
    expect(canArrest(base("n", "blue", 900), base("m", "blue", 940))).toBe(false); // not a detective
  });
});

describe("spy", () => {
  // A Green spy sitting in Blue.
  const spy = base("s", "blue", 1500, { secretRole: "spy", realTeam: "green" });

  it("can secretly ice a fake teammate anywhere (even on the enemy half)", () => {
    expect(canIce(spy, base("b", "blue", 1540))).toBe(true);
  });

  it("can't ice while the hand is still iced, or a real teammate", () => {
    expect(canIce({ ...spy, icedHand: true }, base("b", "blue", 1540))).toBe(false);
    expect(canIce(spy, base("g", "green", 1540))).toBe(false);
  });

  it("can secretly free a frozen player of the real team, never the fake team", () => {
    expect(canFree(spy, base("g", "green", 1540, { frozen: true, freeze: "ice" }))).toBe(true);
    expect(canFree(spy, base("b", "blue", 1540, { frozen: true, freeze: "ice" }))).toBe(false);
    expect(canFree(spy, base("g", "green", 1540, { frozen: true, freeze: "out" }))).toBe(false);
  });

  it("can pass silently to the real team; normal players can't pass to enemies", () => {
    const potli = { x: 0, y: 0, carrierId: "s", snatcherId: "" };
    expect(canPass(spy, base("g", "green", 1540), potli)).toBe(true);
    const normal = base("n", "blue", 1500);
    expect(canPass(normal, base("g", "green", 1540), { ...potli, carrierId: "n" })).toBe(false);
  });
});

describe("shame freeze and rescue", () => {
  const shamed = base("d", "blue", 940, { frozen: true, freeze: "shame", secretRole: "detective" });

  it("the Leader's lamp can't melt shame ice", () => {
    expect(canUnfreeze(base("L", "blue", 900, { role: "leader" }), shamed)).toBe(false);
  });

  it("a teammate can drag them, once", () => {
    expect(canDrag(base("m", "blue", 900), shamed)).toBe(true);
    expect(canDrag(base("m", "blue", 900), { ...shamed, rescueUsed: true })).toBe(false);
    expect(canDrag(base("e", "green", 900), shamed)).toBe(false);
  });

  it("the role button offers Drag, then Release while dragging", () => {
    const me = base("m", "blue", 900);
    expect(bestRoleAction(me, [me, shamed])?.kind).toBe("drag");
    expect(bestRoleAction(me, [me, { ...shamed, draggedBy: "m" }])?.kind).toBe("release");
  });

  it("fireplaces are where the rescue happens", () => {
    const f = MAP.circles.find((c) => c.kind === "fireplace")!;
    expect(nearFireplace({ x: f.x + f.r + 20, y: f.y })).toBe(true);
    expect(nearFireplace({ x: 1200, y: 675 })).toBe(false);
  });
});
