/**
 * The M2 game rules as pure functions: "can this player do that, right now?"
 *
 * The SERVER uses them to decide (and never trusts the client).
 * The CLIENT uses the same functions only to label the big button, so the
 * label always matches what the server will accept.
 */
import { CONFIG } from "./config";
import { MAP, halfAt, type Rect, type Team } from "./map";

/** The fields of a player the rules need. Works on server Schemas and plain objects. */
export interface RulePlayer {
  id: string;
  team: string;
  role: string;
  x: number;
  y: number;
  frozen: boolean;
  protected: boolean;
}

export interface RulePotli {
  x: number;
  y: number;
  carrierId: string;
  snatcherId: string;
}

export type ActionKind = "unfreeze" | "tag" | "snatch" | "grab";

export interface Action {
  kind: ActionKind;
  /** Who the action is aimed at ("" for grab). */
  targetId: string;
}

const D = CONFIG.distances;

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const isLeader = (p: RulePlayer) => p.role === "leader";

/** Tag: freeze an enemy who is standing on YOUR half (D1), within reach. */
export function canTag(me: RulePlayer, target: RulePlayer): boolean {
  return (
    !me.frozen &&
    !target.frozen &&
    !target.protected &&
    target.team !== me.team &&
    target.team !== "" &&
    halfAt(target.x) === me.team &&
    dist(me, target) <= D.tag
  );
}

/** Fire lamp: only the Leader, only teammates, only when the Leader isn't frozen. */
export function canUnfreeze(me: RulePlayer, target: RulePlayer): boolean {
  return (
    isLeader(me) &&
    !me.frozen &&
    target.id !== me.id &&
    target.frozen &&
    target.team === me.team &&
    dist(me, target) <= D.lampUnfreeze
  );
}

/** Grab: the potli is lying loose and you're standing on it (D33). */
export function canGrab(me: RulePlayer, potli: RulePotli): boolean {
  return !me.frozen && potli.carrierId === "" && dist(me, potli) <= D.grab;
}

/** Snatch: start the countdown on an enemy carrier beside you (any half). */
export function canSnatch(me: RulePlayer, carrier: RulePlayer, potli: RulePotli): boolean {
  return (
    !me.frozen &&
    potli.carrierId === carrier.id &&
    potli.snatcherId === "" &&
    carrier.team !== me.team &&
    dist(me, carrier) <= D.snatch
  );
}

/** Pass: you carry the potli and a free teammate is right beside you. */
export function canPass(me: RulePlayer, mate: RulePlayer, potli: RulePotli): boolean {
  return (
    !me.frozen &&
    potli.carrierId === me.id &&
    mate.id !== me.id &&
    mate.team === me.team &&
    !mate.frozen &&
    dist(me, mate) <= D.handOff
  );
}

/** Nearest player for whom `check` passes. */
function nearest(me: RulePlayer, players: Iterable<RulePlayer>, check: (p: RulePlayer) => boolean) {
  let best: RulePlayer | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.id === me.id || !check(p)) continue;
    const d = dist(me, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * What the big button does right now. Priority (D32): Unfreeze > Tag > Snatch > Grab.
 * Returns null when nothing is possible (the button greys out).
 */
export function bestAction(me: RulePlayer, players: Iterable<RulePlayer>, potli: RulePotli): Action | null {
  if (me.frozen) return null;
  const list = [...players];

  const frozenMate = nearest(me, list, (p) => canUnfreeze(me, p));
  if (frozenMate) return { kind: "unfreeze", targetId: frozenMate.id };

  const enemy = nearest(me, list, (p) => canTag(me, p));
  if (enemy) return { kind: "tag", targetId: enemy.id };

  const carrier = list.find((p) => p.id === potli.carrierId);
  if (carrier && canSnatch(me, carrier, potli)) return { kind: "snatch", targetId: carrier.id };

  if (canGrab(me, potli)) return { kind: "grab", targetId: "" };
  return null;
}

/** Who a Pass would go to (nearest eligible teammate), or null. */
export function passTarget(me: RulePlayer, players: Iterable<RulePlayer>, potli: RulePotli): RulePlayer | null {
  return nearest(me, players, (p) => canPass(me, p, potli));
}

/** Is this action (as sent by a client) allowed right now? Server-side check. */
export function isActionAllowed(
  me: RulePlayer,
  action: Action,
  players: Map<string, RulePlayer>,
  potli: RulePotli,
): boolean {
  const target = players.get(action.targetId);
  switch (action.kind) {
    case "unfreeze":
      return !!target && canUnfreeze(me, target);
    case "tag":
      return !!target && canTag(me, target);
    case "snatch":
      return !!target && canSnatch(me, target, potli);
    case "grab":
      return canGrab(me, potli);
    default:
      return false;
  }
}

/** True if a point is inside a team's (home) den. */
export function inDen(team: Team, p: { x: number; y: number }): boolean {
  const d: Rect = MAP.dens[team];
  return p.x >= d.x && p.x <= d.x + d.w && p.y >= d.y && p.y <= d.y + d.h;
}

export const enemyOf = (team: Team): Team => (team === "blue" ? "green" : "blue");

/**
 * Where a team SCORES (D39, owner): the enemy's den, at the far end of the
 * enemy's half, like a football goal. Your own den is the goal you defend.
 */
export function goalDen(team: Team): Rect {
  return MAP.dens[enemyOf(team)];
}

/** True if this team's carrier at `p` has scored. */
export function inGoal(team: Team, p: { x: number; y: number }): boolean {
  return inDen(enemyOf(team), p);
}

/**
 * Speed multiplier for one player:
 * - carrying the potli slows you down (D38), so chasers can catch you;
 * - GDD: a Leader carrying it runs faster, but only if no teammate is frozen.
 */
export function speedMultiplier(me: RulePlayer, players: Iterable<RulePlayer>, potli: RulePotli): number {
  if (potli.carrierId !== me.id) return 1;
  const carry = CONFIG.movement.carrierSpeedMultiplier;
  if (!isLeader(me)) return carry;
  for (const p of players) if (p.team === me.team && p.frozen) return carry;
  return carry * CONFIG.movement.leaderCarrySpeedBonus;
}
