/**
 * Bot navigation. The map is a maze of lanes, so "walk straight at it" gets
 * bots stuck. Instead we lay a grid over the map and flood-fill distances from
 * the target ("flow field"); a bot then just steps toward a neighbour that's
 * closer to the target. Fields are cached per target cell.
 */
import { AXIS_MAX, CONFIG, MAP, isBlocked, type MoveCommand, type Point } from "@gully/shared";

/** 15 divides both 2400 and 1350 exactly, so the grid is as symmetric as the map (fair bots). */
const CELL = 15;
const COLS = Math.ceil(MAP.width / CELL);
const ROWS = Math.ceil(MAP.height / CELL);
const R = CONFIG.movement.playerRadius;

/** Cells a blob's centre can stand in. Built once. */
const walkable = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    walkable[r * COLS + c] = isBlocked(c * CELL + CELL / 2, r * CELL + CELL / 2, R + 1) ? 0 : 1;
  }
}

const cellOf = (p: Point) => {
  const c = Math.min(COLS - 1, Math.max(0, Math.floor(p.x / CELL)));
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor(p.y / CELL)));
  return r * COLS + c;
};
const centre = (i: number): Point => ({ x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 });

/** Nearest walkable cell to a point (targets can sit next to walls). */
function nearestWalkable(p: Point): number {
  const start = cellOf(p);
  if (walkable[start]) return start;
  for (let ring = 1; ring < 8; ring++) {
    const c0 = start % COLS;
    const r0 = Math.floor(start / COLS);
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c >= 0 && r >= 0 && c < COLS && r < ROWS && walkable[r * COLS + c]) return r * COLS + c;
      }
    }
  }
  return start;
}

const cache = new Map<number, Int32Array>();

/** Steps-to-target for every cell (-1 = unreachable). */
function flowField(target: Point): Int32Array {
  const goal = nearestWalkable(target);
  const hit = cache.get(goal);
  if (hit) return hit;

  const d = new Int32Array(COLS * ROWS).fill(-1);
  const queue = new Int32Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  d[goal] = 0;
  queue[tail++] = goal;
  while (head < tail) {
    const i = queue[head++];
    const c = i % COLS;
    const r = (i - c) / COLS;
    const next = [c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1, r > 0 ? i - COLS : -1, r < ROWS - 1 ? i + COLS : -1];
    for (const j of next) {
      if (j >= 0 && walkable[j] && d[j] < 0) {
        d[j] = d[i] + 1;
        queue[tail++] = j;
      }
    }
  }

  if (cache.size > 200) cache.clear();
  cache.set(goal, d);
  return d;
}

/** True if a blob could walk straight from a to b. */
function clearLine(a: Point, b: Point): boolean {
  const steps = Math.ceil(Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) / 10);
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    if (isBlocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, R + 1)) return false;
  }
  return true;
}

/** Joystick input that moves `from` one step along the best route to `to`. */
export function steer(from: Point, to: Point): MoveCommand {
  let aim: Point = to;
  if (!clearLine(from, to)) {
    const field = flowField(to);
    const here = nearestWalkable(from);
    let best = here;
    let bestD = field[here] < 0 ? Infinity : field[here];
    let bestAlign = -Infinity;
    const c0 = here % COLS;
    const r0 = Math.floor(here / COLS);
    // Direction to the target, used to break ties fairly (no "always up-left" bias).
    const tx = to.x - from.x;
    const ty = to.y - from.y;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS || (dc === 0 && dr === 0)) continue;
        const j = r * COLS + c;
        if (field[j] < 0) continue;
        const align = (dc * tx + dr * ty) / Math.sqrt(dc * dc + dr * dr);
        if (field[j] < bestD || (field[j] === bestD && align > bestAlign)) {
          best = j;
          bestD = field[j];
          bestAlign = align;
        }
      }
    }
    aim = centre(best);
  }
  const dx = aim.x - from.x;
  const dy = aim.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return { moveX: 0, moveY: 0 };
  return { moveX: Math.round((dx / len) * AXIS_MAX), moveY: Math.round((dy / len) * AXIS_MAX) };
}

/** A random free spot within `radius` of `from`, on a given half if asked. */
export function randomSpot(from: Point, radius: number, random: () => number, half?: "blue" | "green"): Point {
  for (let i = 0; i < 60; i++) {
    const x = from.x + (random() * 2 - 1) * radius;
    const y = from.y + (random() * 2 - 1) * radius;
    if (half === "blue" && x >= MAP.halfLine) continue;
    if (half === "green" && x < MAP.halfLine) continue;
    if (!isBlocked(x, y, R + 4)) return { x, y };
  }
  return { x: MAP.middleZone.x, y: MAP.middleZone.y };
}
