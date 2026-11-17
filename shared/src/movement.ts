/**
 * The ONE movement step.
 *
 * The server runs it to decide where everyone really is. Your own browser runs
 * the exact same function to move your blob instantly (prediction), then
 * quietly corrects itself if the server disagrees. Because both sides use this
 * file, they almost never disagree.
 *
 * Rules for this file: no clocks, no randomness, no reading anything except its
 * arguments and the fixed map. Same inputs -> same result, every time.
 */
import { CONFIG } from "./config";
import { MAP, isBlocked } from "./map";

/** Joystick axes travel as whole numbers -127..127 (small to send, easy to validate). */
export const AXIS_MAX = 127;

/** What moves. Plain fields so a server Schema and a client copy both fit. */
export interface Body {
  x: number;
  y: number;
  /** Facing direction (for the eyes), -127..127 each. Kept when standing still. */
  fx: number;
  fy: number;
}

export interface MoveCommand {
  moveX: number;
  moveY: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Turn raw axes into a direction of length 0..1, with the deadzone applied. */
export function normalizeAxes(moveX: number, moveY: number): { ax: number; ay: number; len: number } {
  let ax = clamp(moveX, -AXIS_MAX, AXIS_MAX) / AXIS_MAX;
  let ay = clamp(moveY, -AXIS_MAX, AXIS_MAX) / AXIS_MAX;
  let len = Math.sqrt(ax * ax + ay * ay);
  if (len < CONFIG.movement.deadzone) return { ax: 0, ay: 0, len: 0 };
  // Diagonals aren't faster than straight lines.
  if (len > 1) {
    ax /= len;
    ay /= len;
    len = 1;
  }
  return { ax, ay, len };
}

/**
 * Advance one body by one fixed step.
 * `speedMultiplier` is for later rules (Leader carry bonus, dragging).
 */
export function stepPlayer(body: Body, cmd: MoveCommand, dt: number, speedMultiplier = 1): void {
  const { ax, ay, len } = normalizeAxes(cmd.moveX, cmd.moveY);
  if (len === 0) return;

  body.fx = Math.round((ax / len) * AXIS_MAX);
  body.fy = Math.round((ay / len) * AXIS_MAX);

  const speed = CONFIG.movement.playerSpeed * speedMultiplier;
  const r = CONFIG.movement.playerRadius;
  const prevX = body.x;
  const prevY = body.y;
  body.x += ax * speed * dt;
  body.y += ay * speed * dt;
  resolveCollisions(body, r);

  // Safety net: if pushing out couldn't find a free spot (a corner squeeze),
  // stay where we were. The previous spot was free, so we never end up in a wall.
  if (isBlocked(body.x, body.y, r - 0.01)) {
    body.x = prevX;
    body.y = prevY;
  }
}

/**
 * Push a circle out of every obstacle it overlaps, then keep it inside the world.
 * Pushing out along the contact normal is what makes you slide along walls
 * instead of sticking to them.
 */
export function resolveCollisions(body: { x: number; y: number }, r: number): void {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;

    for (const o of MAP.rects) {
      const cx = clamp(body.x, o.x, o.x + o.w);
      const cy = clamp(body.y, o.y, o.y + o.h);
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;

      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        body.x += (dx / d) * (r - d);
        body.y += (dy / d) * (r - d);
      } else {
        // Centre is inside the rectangle: leave through the nearest side.
        const left = body.x - o.x;
        const right = o.x + o.w - body.x;
        const top = body.y - o.y;
        const bottom = o.y + o.h - body.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) body.x = o.x - r;
        else if (m === right) body.x = o.x + o.w + r;
        else if (m === top) body.y = o.y - r;
        else body.y = o.y + o.h + r;
      }
      moved = true;
    }

    for (const c of MAP.circles) {
      const dx = body.x - c.x;
      const dy = body.y - c.y;
      const min = r + c.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d > 1e-9) {
        body.x += (dx / d) * (min - d);
        body.y += (dy / d) * (min - d);
      } else {
        body.x += min; // exactly on the centre: pick a side
      }
      moved = true;
    }

    body.x = clamp(body.x, r, MAP.width - r);
    body.y = clamp(body.y, r, MAP.height - r);
    if (!moved) break;
  }
}
