/**
 * Line of sight (GDD "Limited vision"): you see a small circle around you, and
 * obstacles block it. The SERVER uses `canSee` to decide what to send each
 * player; the CLIENT uses `visibilityPolygon` to draw the shadows. Same
 * geometry on both sides, so what looks hidden IS hidden.
 */
import { CONFIG } from "./config";
import { MAP, type Circle, type Point, type Rect } from "./map";

/** Obstacles that block sight (D51): buildings, carts, chai stalls, trees. Fireplaces are low. */
const BLOCK_RECTS: Rect[] = MAP.rects;
const BLOCK_CIRCLES: Circle[] = MAP.circles.filter((c) => c.kind === "tree");

/**
 * Where along a→b (0..1) the segment first enters the rect, or Infinity.
 * (Liang–Barsky clipping.)
 */
function hitRect(ax: number, ay: number, dx: number, dy: number, r: Rect): number {
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return Infinity;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return Infinity;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return Infinity;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0;
}

/** Where along a→b (0..1) the segment first enters the circle, or Infinity. */
function hitCircle(ax: number, ay: number, dx: number, dy: number, c: Circle): number {
  const fx = ax - c.x;
  const fy = ay - c.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - c.r * c.r;
  if (cc <= 0) return 0; // starts inside
  const disc = b * b - 4 * a * cc;
  if (disc < 0 || a === 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : Infinity;
}

/** Fraction (0..1) along a→b where sight is first blocked, or 1 if clear. */
export function sightFraction(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let best = 1;
  for (const r of BLOCK_RECTS) {
    const t = hitRect(a.x, a.y, dx, dy, r);
    if (t < best) best = t;
  }
  for (const c of BLOCK_CIRCLES) {
    const t = hitCircle(a.x, a.y, dx, dy, c);
    if (t < best) best = t;
  }
  return best;
}

/** True if nothing blocks the straight line from a to b. */
export function clearSight(a: Point, b: Point): boolean {
  return sightFraction(a, b) >= 1;
}

/**
 * Can a viewer at `from` see a blob at `to`? Within `radius`, and at least
 * part of the blob is unblocked (centre or either side), so a half-hidden blob
 * still shows.
 */
export function canSee(from: Point, to: Point, radius: number = CONFIG.vision.radius): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > radius) return false;
  if (d < 1) return true;
  if (clearSight(from, to)) return true;
  // Try the blob's two sides (perpendicular offsets).
  const off = CONFIG.movement.playerRadius * 0.8;
  const px = (-dy / d) * off;
  const py = (dx / d) * off;
  return clearSight(from, { x: to.x + px, y: to.y + py }) || clearSight(from, { x: to.x - px, y: to.y - py });
}

/**
 * The visible area around `origin` as a polygon (one point per ray), for
 * drawing shadows on the client.
 */
export function visibilityPolygon(origin: Point, radius: number = CONFIG.vision.radius, rays = 180): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const end = { x: origin.x + Math.cos(a) * radius, y: origin.y + Math.sin(a) * radius };
    const f = sightFraction(origin, end);
    pts.push({ x: origin.x + (end.x - origin.x) * f, y: origin.y + (end.y - origin.y) * f });
  }
  return pts;
}
