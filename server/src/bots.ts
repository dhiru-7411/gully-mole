/**
 * Dev bots: server-side players with a tiny "brain" so you can test alone.
 *
 * M1 brain: wander. Pick a nearby free spot, walk to it, pause a moment, pick
 * another. If walls stop progress for ~1.5 s, give up and pick a new spot.
 * Later milestones teach bots to chase, tag and carry.
 */
import { AXIS_MAX, CONFIG, MAP, isBlocked, type Body, type MoveCommand, type Point } from "@gully/shared";

const IDLE: MoveCommand = { moveX: 0, moveY: 0 };

export class BotBrain {
  private target: Point | null = null;
  private bestDist = Infinity;
  private ticksWithoutProgress = 0;
  private pauseTicks = 0;

  constructor(private readonly random: () => number = Math.random) {}

  /** Called once per server tick; returns the joystick input for this tick. */
  next(body: Body): MoveCommand {
    if (this.pauseTicks > 0) {
      this.pauseTicks--;
      return IDLE;
    }
    if (!this.target) this.pickTarget(body);

    const dx = this.target!.x - body.x;
    const dy = this.target!.y - body.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 24) {
      this.target = null;
      this.pauseTicks = Math.floor(this.random() * 2 * CONFIG.movement.tickRate); // up to 2 s
      return IDLE;
    }

    if (dist < this.bestDist - 2) {
      this.bestDist = dist;
      this.ticksWithoutProgress = 0;
    } else if (++this.ticksWithoutProgress > 1.5 * CONFIG.movement.tickRate) {
      this.target = null; // stuck behind something: try elsewhere
      return IDLE;
    }

    return { moveX: Math.round((dx / dist) * AXIS_MAX), moveY: Math.round((dy / dist) * AXIS_MAX) };
  }

  private pickTarget(from: Point) {
    const r = CONFIG.movement.playerRadius + 4;
    for (let i = 0; i < 50; i++) {
      const x = from.x + (this.random() * 2 - 1) * 600;
      const y = from.y + (this.random() * 2 - 1) * 600;
      if (x > r && y > r && x < MAP.width - r && y < MAP.height - r && !isBlocked(x, y, r)) {
        this.target = { x, y };
        break;
      }
    }
    this.target ??= { x: MAP.middleZone.x, y: MAP.middleZone.y };
    this.bestDist = Infinity;
    this.ticksWithoutProgress = 0;
  }
}
