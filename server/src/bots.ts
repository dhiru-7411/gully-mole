/**
 * Dev bots: server-side players with a small "brain" so you can test a full
 * game alone. They're beatable on purpose: they react after a short random
 * delay and don't coordinate much.
 *
 * Positions, like a football team (re-decided every tick from the team list,
 * so they stay balanced as players freeze and thaw):
 *  - LEADER:    rescues frozen teammates, otherwise plays attacker.
 *  - DEFENDERS: about half the team. Stay on our half, guard our den, tag
 *               intruders and chase the enemy carrier.
 *  - ATTACKERS: the rest. Go for the potli, escort our carrier, carry it into
 *               the ENEMY den (D39), and back off from nearby defenders.
 * Whenever the smart button has something to do, the bot presses it.
 */
import {
  MAP,
  bestAction,
  dist,
  enemyOf,
  goalDen,
  halfAt,
  passTarget,
  type Action,
  type GameState,
  type MoveCommand,
  type PlayerState,
  type Point,
  type Team,
} from "@gully/shared";
import { randomSpot, steer } from "./nav";

const IDLE: MoveCommand = { moveX: 0, moveY: 0 };

export interface BotDecision {
  move: MoveCommand;
  action?: Action;
  pass?: boolean;
}

export class BotBrain {
  private wanderTo: Point | null = null;
  private wanderTicks = 0;
  /** Reaction delay before pressing the button, in ticks. */
  private reactIn = -1;

  constructor(private readonly random: () => number = Math.random) {}

  next(me: PlayerState, s: GameState, tickRate: number): BotDecision {
    if (me.frozen) {
      this.reactIn = -1;
      return { move: IDLE };
    }
    const players = [...s.players.values()];
    const potli = s.potli;
    const team = me.team as Team;
    const enemy = enemyOf(team);
    const carrier = s.players.get(potli.carrierId);
    const onOurHalf = (p: Point) => halfAt(p.x) === team;
    const d: BotDecision = { move: IDLE };

    // Press the smart button after a short, human-ish delay.
    const action = bestAction(me, players, potli);
    if (action) {
      if (this.reactIn < 0) this.reactIn = Math.floor((0.35 + this.random() * 0.55) * tickRate);
      if (this.reactIn-- === 0) d.action = action;
    } else {
      this.reactIn = -1;
    }

    // Carrying: into the enemy den. Pass if a defender is right on us and a mate is beside us.
    if (carrier?.id === me.id) {
      const goal = goalDen(team);
      d.move = steer(me, { x: goal.x + goal.w / 2, y: goal.y + goal.h / 2 });
      const threatened = players.some((p) => p.team === enemy && !p.frozen && dist(p, me) < 90);
      if (threatened && passTarget(me, players, potli) && this.random() < 0.1) d.pass = true;
      return d;
    }

    // Leader: rescue the nearest frozen teammate.
    if (me.role === "leader") {
      const frozenMate = nearestOf(me, players, (p) => p.team === team && p.frozen && p.id !== me.id);
      if (frozenMate && dist(me, frozenMate) < 1000) return { ...d, move: steer(me, frozenMate) };
    }

    const defender = this.isDefender(me, players);

    if (defender) {
      // The enemy carrier is heading for OUR den: stop them.
      if (carrier && carrier.team === enemy) return { ...d, move: steer(me, carrier) };
      // Tag intruders on our half.
      const intruder = nearestOf(me, players, (p) => p.team === enemy && !p.frozen && onOurHalf(p));
      if (intruder && dist(me, intruder) < 700) return { ...d, move: steer(me, intruder) };
      // Loose potli on our half and close: clear it.
      if (!carrier && onOurHalf(potli) && dist(me, potli) < 400) return { ...d, move: steer(me, potli) };
      return { ...d, move: this.wander(me, team, tickRate, "defend") };
    }

    // ---- attacker
    // Back off from a nearby defender while on their half (they can tag us there).
    if (!onOurHalf(me)) {
      const threat = nearestOf(me, players, (p) => p.team === enemy && !p.frozen && dist(p, me) < 180);
      if (threat && !(carrier && carrier.team === team && dist(me, carrier) < 150)) {
        const away = { x: me.x + (me.x - threat.x) * 3, y: me.y + (me.y - threat.y) * 3 };
        return { ...d, move: steer(me, away) };
      }
    }
    if (carrier && carrier.team === enemy) return { ...d, move: steer(me, carrier) };
    if (!carrier) return { ...d, move: steer(me, potli) };
    if (carrier.team === team && dist(me, carrier) > 110) return { ...d, move: steer(me, carrier) };
    return { ...d, move: this.wander(me, team, tickRate, "attack") };
  }

  /** About half of each team (not the Leader) defends; chosen by a stable order. */
  private isDefender(me: PlayerState, players: PlayerState[]): boolean {
    if (me.role === "leader") return false;
    const mates = players.filter((p) => p.team === me.team && p.role !== "leader").sort((a, b) => (a.id < b.id ? -1 : 1));
    return mates.findIndex((p) => p.id === me.id) % 2 === 0;
  }

  /** Defenders roam between our den and the middle; attackers around the middle. */
  private wander(me: PlayerState, team: Team, tickRate: number, mode: "defend" | "attack"): MoveCommand {
    if (!this.wanderTo || this.wanderTicks-- <= 0 || dist(me, this.wanderTo) < 30) {
      const den = MAP.dens[team];
      const anchor =
        mode === "defend"
          ? { x: (den.x + den.w / 2 + MAP.halfLine) / 2, y: MAP.middleZone.y }
          : { x: MAP.middleZone.x, y: MAP.middleZone.y };
      this.wanderTo = randomSpot(anchor, 350, this.random, mode === "defend" ? team : undefined);
      this.wanderTicks = Math.floor(3 * tickRate);
    }
    return steer(me, this.wanderTo);
  }
}

function nearestOf(me: Point, players: PlayerState[], ok: (p: PlayerState) => boolean): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (!ok(p)) continue;
    const d = dist(me, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
