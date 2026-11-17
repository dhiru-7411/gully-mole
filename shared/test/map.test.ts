import { describe, expect, it } from "vitest";
import { CONFIG, MAP, TEAMS, halfAt, isBlocked, mirrorPoint, type Point } from "../src";

const R = CONFIG.movement.playerRadius;

describe("map data", () => {
  it("matches docs/ART.md counts", () => {
    const count = (k: string) => [...MAP.rects, ...MAP.circles].filter((o) => o.kind === k).length;
    expect(count("building")).toBe(30);
    expect(count("cart")).toBe(8);
    expect(count("chai")).toBe(4);
    expect(count("tree")).toBe(12);
    expect(count("fireplace")).toBe(2);
    expect(MAP.width).toBe(3600);
    expect(MAP.height).toBe(2025);
  });

  it("is fair: every obstacle has a twin turned 180°", () => {
    const key = (x: number, y: number, k: string) => `${k}:${x},${y}`;
    const rects = new Set(MAP.rects.map((r) => key(r.x + r.w / 2, r.y + r.h / 2, r.kind)));
    for (const r of MAP.rects) {
      const m = mirrorPoint({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      expect(rects.has(key(m.x, m.y, r.kind))).toBe(true);
    }
    const circles = new Set(MAP.circles.map((c) => key(c.x, c.y, c.kind)));
    for (const c of MAP.circles) {
      const m = mirrorPoint(c);
      expect(circles.has(key(m.x, m.y, c.kind))).toBe(true);
    }
  });

  it("each den sits on its own half", () => {
    expect(halfAt(MAP.dens.blue.x + MAP.dens.blue.w / 2)).toBe("blue");
    expect(halfAt(MAP.dens.green.x + MAP.dens.green.w / 2)).toBe("green");
  });

  it("spawn spots are free and inside their own den", () => {
    for (const team of TEAMS) {
      const den = MAP.dens[team];
      expect(MAP.spawns[team].length).toBeGreaterThanOrEqual(CONFIG.lobby.maxPlayers / 2);
      for (const s of MAP.spawns[team]) {
        expect(isBlocked(s.x, s.y, R)).toBe(false);
        expect(s.x).toBeGreaterThan(den.x);
        expect(s.x).toBeLessThan(den.x + den.w);
        expect(s.y).toBeGreaterThan(den.y);
        expect(s.y).toBeLessThan(den.y + den.h);
      }
    }
  });

  it("has no gaps a blob could get wedged in (open gaps are at least 44 wide)", () => {
    type O = { x: number; y: number; w?: number; h?: number; r?: number };
    const all: O[] = [...MAP.rects, ...MAP.circles];
    const rectCircle = (a: O, c: O) => {
      const cx = Math.max(a.x, Math.min(c.x, a.x + a.w!));
      const cy = Math.max(a.y, Math.min(c.y, a.y + a.h!));
      return Math.hypot(c.x - cx, c.y - cy) - c.r!;
    };
    const gap = (a: O, b: O) => {
      if (a.r === undefined && b.r === undefined) {
        const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w!, b.x + b.w!));
        const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h!, b.y + b.h!));
        return Math.hypot(dx, dy);
      }
      if (a.r !== undefined && b.r !== undefined) return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
      return a.r === undefined ? rectCircle(a, b) : rectCircle(b, a);
    };
    const tight: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const d = gap(all[i], all[j]);
        if (d > 0 && d < 2 * R) tight.push(`${d.toFixed(0)}: ${JSON.stringify(all[i])} / ${JSON.stringify(all[j])}`);
      }
    }
    expect(tight).toEqual([]);
  });

  it("dens sit on the end lines like goals", () => {
    expect(MAP.dens.blue.x).toBe(0);
    expect(MAP.dens.green.x + MAP.dens.green.w).toBe(MAP.width);
  });

  it("there's no straight run from the potli to either den (D31)", () => {
    // Sweep a blob along the straight line from the potli to each den's mouth,
    // and also along every row through the den mouth. Something must be in the way.
    for (const team of ["blue", "green"] as const) {
      const den = MAP.dens[team];
      const mouthX = team === "blue" ? den.x + den.w + R : den.x - R;
      for (let y = den.y + R; y <= den.y + den.h - R; y += 10) {
        let blocked = false;
        for (let t = 0; t <= 1 && !blocked; t += 0.005) {
          const x = MAP.middleZone.x + (mouthX - MAP.middleZone.x) * t;
          const yy = MAP.middleZone.y + (y - MAP.middleZone.y) * t;
          blocked = isBlocked(x, yy, R);
        }
        expect(blocked, `${team} den, row y=${y}`).toBe(true);
      }
    }
  });

  it("nothing blocks the potli's starting spot", () => {
    expect(isBlocked(MAP.middleZone.x, MAP.middleZone.y, R)).toBe(false);
  });

  it("a blob can walk from each den to the middle, the other den and both fireplaces", () => {
    // Flood-fill a 10-unit grid of spots where a blob fits.
    const step = 10;
    const cols = Math.floor(MAP.width / step);
    const rows = Math.floor(MAP.height / step);
    const free = (c: number, r: number) => !isBlocked(c * step, r * step, R);
    const cell = (p: Point) => [Math.round(p.x / step), Math.round(p.y / step)] as const;

    const [sc, sr] = cell(MAP.spawns.blue[0]);
    const seen = new Uint8Array(cols * rows);
    const queue: number[] = [sr * cols + sc];
    seen[sr * cols + sc] = 1;
    while (queue.length) {
      const i = queue.pop()!;
      const c = i % cols;
      const r = (i - c) / cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const j = nr * cols + nc;
        if (!seen[j] && free(nc, nr)) {
          seen[j] = 1;
          queue.push(j);
        }
      }
    }
    const reachable = (p: Point) => {
      const [c, r] = cell(p);
      return seen[r * cols + c] === 1;
    };

    expect(reachable(MAP.spawns.green[0])).toBe(true);
    expect(reachable({ x: MAP.middleZone.x, y: MAP.middleZone.y })).toBe(true);
    for (const f of MAP.circles.filter((c) => c.kind === "fireplace")) {
      // Somewhere just beside the fire must be walkable.
      const near = [
        { x: f.x + f.r + R + 10, y: f.y },
        { x: f.x - f.r - R - 10, y: f.y },
        { x: f.x, y: f.y + f.r + R + 10 },
        { x: f.x, y: f.y - f.r - R - 10 },
      ];
      expect(near.some(reachable)).toBe(true);
    }
  });
});
