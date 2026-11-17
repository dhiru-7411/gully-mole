import { describe, expect, it } from "vitest";
import { AXIS_MAX, CONFIG, MAP, MAP_SCALE, isBlocked, stepPlayer, type Body } from "../src";

const R = CONFIG.movement.playerRadius;
const SPEED = CONFIG.movement.playerSpeed;
const DT = 1 / CONFIG.movement.tickRate;

const MZ = MAP.middleZone; // the potli spot: open ground
const open = (): Body => ({ x: MZ.x, y: MZ.y, fx: AXIS_MAX, fy: 0 });

describe("stepPlayer", () => {
  it("moves at full speed with a full stick", () => {
    const b = open();
    stepPlayer(b, { moveX: AXIS_MAX, moveY: 0 }, DT);
    expect(b.x).toBeCloseTo(MZ.x + SPEED * DT, 6);
    expect(b.y).toBe(MZ.y);
  });

  it("diagonals are not faster than straight lines", () => {
    const b = open();
    stepPlayer(b, { moveX: AXIS_MAX, moveY: AXIS_MAX }, DT);
    const dist = Math.hypot(b.x - MZ.x, b.y - MZ.y);
    expect(dist).toBeCloseTo(SPEED * DT, 6);
  });

  it("a half-pushed joystick moves at half speed", () => {
    const b = open();
    stepPlayer(b, { moveX: Math.round(AXIS_MAX / 2), moveY: 0 }, DT);
    expect(b.x - MZ.x).toBeCloseTo((SPEED * DT) / 2, 0);
  });

  it("ignores tiny thumb wobble (deadzone) and keeps facing", () => {
    const b = open();
    b.fx = 0;
    b.fy = -AXIS_MAX;
    stepPlayer(b, { moveX: 5, moveY: 5 }, DT);
    expect(b.x).toBe(MZ.x);
    expect(b.fy).toBe(-AXIS_MAX);
  });

  it("clamps out-of-range axes like a modified client would send", () => {
    const b = open();
    stepPlayer(b, { moveX: 10_000, moveY: 0 }, DT);
    expect(b.x).toBeCloseTo(MZ.x + SPEED * DT, 6);
  });

  it("updates facing to the movement direction", () => {
    const b = open();
    stepPlayer(b, { moveX: -AXIS_MAX, moveY: 0 }, DT);
    expect(b.fx).toBe(-AXIS_MAX);
    expect(b.fy).toBe(0);
  });

  it("can't walk through a building, and slides along it", () => {
    // Building at design x 560..760, y 470..580 (× MAP_SCALE). Start left of it, push right, a bit down.
    const L = 560 * MAP_SCALE;
    const BOTTOM = 580 * MAP_SCALE;
    const Y0 = 500 * MAP_SCALE;
    const b: Body = { x: L - 40, y: Y0, fx: 0, fy: 0 };
    for (let i = 0; i < 30; i++) {
      stepPlayer(b, { moveX: AXIS_MAX, moveY: 30 }, DT);
      // While level with the wall, the blob must stay on its left side.
      if (b.y < BOTTOM + R) expect(b.x).toBeLessThanOrEqual(L - R + 1e-6);
    }
    expect(b.y).toBeGreaterThan(Y0); // it kept sliding down along the wall
  });

  it("stays inside the world edges", () => {
    const b: Body = { x: 40, y: 40, fx: 0, fy: 0 };
    for (let i = 0; i < 40; i++) stepPlayer(b, { moveX: -AXIS_MAX, moveY: -AXIS_MAX }, DT);
    expect(b.x).toBeGreaterThanOrEqual(R);
    expect(b.y).toBeGreaterThanOrEqual(R);
  });

  it("never ends a step inside an obstacle (random walk, 20k steps)", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const b: Body = { ...MAP.spawns.blue[0], fx: 0, fy: 0 };
    let mx = 0;
    let my = 0;
    for (let i = 0; i < 20_000; i++) {
      if (i % 15 === 0) {
        mx = Math.round((rand() * 2 - 1) * AXIS_MAX);
        my = Math.round((rand() * 2 - 1) * AXIS_MAX);
      }
      stepPlayer(b, { moveX: mx, moveY: my }, DT);
      // A hair of tolerance for floating point.
      expect(isBlocked(b.x, b.y, R - 0.01)).toBe(false);
    }
  });

  it("is deterministic: same inputs give the same result", () => {
    const run = () => {
      const b: Body = { ...MAP.spawns.green[3], fx: 0, fy: 0 };
      for (let i = 0; i < 500; i++) stepPlayer(b, { moveX: (i * 37) % 255 - 127, moveY: (i * 91) % 255 - 127 }, DT);
      return b;
    };
    expect(run()).toEqual(run());
  });
});
