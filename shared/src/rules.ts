/**
 * The game rules as pure functions: "can this player do that, right now?"
 *
 * The SERVER uses them to decide (and never trusts the client).
 * The CLIENT uses the same functions only to label its buttons, so a label
 * always matches what the server will accept. (A client only knows the
 * secrets it's allowed to; that's enough to label its OWN buttons.)
 */
import { CONFIG } from "./config";
import { MAP, halfAt, type Rect, type Team } from "./map";

/** The fields of a player the rules need. Works on server Schemas and plain objects. */
export interface RulePlayer {
  id: string;
  /** The team you SIT in (a spy sits in the other team). */
  team: string;
  role: string;
  x: number;
  y: number;
  frozen: boolean;
  protected: boolean;
  /** Seconds until this player may Tag again (D63). */
  tagCooldown?: number;
  /** "ice" | "shame" | "out" | "" (missing = "ice" when frozen). */
  freeze?: string;
  /** Secret, when known: "detective" | "spy" | "". */
  secretRole?: string;
  /** Secret, when known: the team they really play for. */
  realTeam?: string;
  icedHand?: boolean;
  draggedBy?: string;
  rescueUsed?: boolean;
}

export interface RulePotli {
  /** "north" | "south" (D68). */
  id: string;
  /** Team that scored it into its goal den, or "". */
  scoredBy?: string;
  x: number;
  y: number;
  carrierId: string;
  snatcherId: string;
}

/** Both potlis (D68), as any iterable (a MapSchema's values, an array…). */
export type Potlis = Iterable<RulePotli>;

/** The potli this player is carrying, if any (one at a time, D68). */
export function carrying<T extends RulePotli>(me: { id: string }, potlis: Iterable<T>): T | undefined {
  for (const p of potlis) if (p.carrierId === me.id) return p;
  return undefined;
}

/** The big smart button (D32). */
export type ActionKind = "unfreeze" | "tag" | "snatch" | "grab";
/** The role button (D42): Detective, spy, and anyone rescuing a shamed Detective. */
export type RoleActionKind = "arrest" | "ice" | "free" | "drag" | "release";

export interface Action {
  kind: ActionKind;
  /** Who the action is aimed at ("" for grab). */
  targetId: string;
}

export interface RoleAction {
  kind: RoleActionKind;
  targetId: string;
}

const D = CONFIG.distances;

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const isLeader = (p: RulePlayer) => p.role === "leader";
const freezeOf = (p: RulePlayer) => (p.frozen ? p.freeze || "ice" : "");
/** The team someone really plays for, as far as this caller knows. */
export const realTeamOf = (p: RulePlayer) => p.realTeam || p.team;
const isSpy = (p: RulePlayer) => p.secretRole === "spy";

// ---------------------------------------------------------------- smart button

/**
 * Tag: freeze an enemy who is standing on YOUR half (D1), within reach.
 * You can't tag the spy YOUR team planted: they look like an enemy, but your
 * team knows they're yours (GDD), so freezing them would only hurt you (D54).
 */
export function canTag(me: RulePlayer, target: RulePlayer): boolean {
  const myOwnSpy = target.secretRole === "spy" && realTeamOf(target) === realTeamOf(me);
  return (
    !me.frozen &&
    !(me.tagCooldown && me.tagCooldown > 0) && // D63: 10 s between your tags
    !target.frozen &&
    !target.protected &&
    !myOwnSpy &&
    target.team !== me.team &&
    target.team !== "" &&
    // Your half, or inside your goal den: the den is the attackers' turf (D68).
    (halfAt(target.x) === me.team || (me.team !== "" && inDen(enemyOf(me.team as Team), target))) &&
    dist(me, target) <= D.tag
  );
}

/** Fire lamp: only the Leader, only teammates in normal ice (not shame/out). */
export function canUnfreeze(me: RulePlayer, target: RulePlayer): boolean {
  return (
    isLeader(me) &&
    !me.frozen &&
    target.id !== me.id &&
    freezeOf(target) === "ice" &&
    target.team === me.team &&
    dist(me, target) <= D.lampUnfreeze
  );
}

/** Grab: a loose potli is at your feet and your hands are free (D33, D68). */
export function canGrab(me: RulePlayer, potli: RulePotli, potlis: Potlis = [potli]): boolean {
  return (
    !me.frozen &&
    !carrying(me, potlis) && // one at a time (D68)
    potli.carrierId === "" &&
    potli.scoredBy !== me.team && // you can't take your own scored potli back out (D68)
    dist(me, potli) <= D.grab
  );
}

/** Snatch: start the countdown on an enemy carrier beside you (any half), hands free. */
export function canSnatch(me: RulePlayer, carrier: RulePlayer, potli: RulePotli, potlis: Potlis = [potli]): boolean {
  return (
    !me.frozen &&
    !carrying(me, potlis) &&
    potli.carrierId === carrier.id &&
    potli.snatcherId === "" &&
    carrier.team !== me.team &&
    dist(me, carrier) <= D.snatch
  );
}

/**
 * Pass: you carry a potli and a free player with empty hands is right beside
 * you: a teammate, or (spy only) a player of your REAL team (the silent pass).
 */
export function canPass(me: RulePlayer, mate: RulePlayer, potlis: Potlis): boolean {
  const list = [...potlis];
  const sameSide = mate.team === me.team;
  const silent = isSpy(me) && realTeamOf(mate) === realTeamOf(me);
  return (
    !me.frozen &&
    !!carrying(me, list) &&
    !carrying(mate, list) &&
    mate.id !== me.id &&
    (sameSide || silent) &&
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
export function bestAction(me: RulePlayer, players: Iterable<RulePlayer>, potlis: Potlis): Action | null {
  if (me.frozen) return null;
  const list = [...players];
  const pots = [...potlis];

  const frozenMate = nearest(me, list, (p) => canUnfreeze(me, p));
  if (frozenMate) return { kind: "unfreeze", targetId: frozenMate.id };

  const enemy = nearest(me, list, (p) => canTag(me, p));
  if (enemy) return { kind: "tag", targetId: enemy.id };

  for (const potli of pots) {
    const carrier = list.find((p) => p.id === potli.carrierId);
    if (carrier && canSnatch(me, carrier, potli, pots)) return { kind: "snatch", targetId: carrier.id };
  }

  // Grab names WHICH potli (D68).
  const grabbable = pots.filter((potli) => canGrab(me, potli, pots)).sort((a, b) => dist(me, a) - dist(me, b))[0];
  if (grabbable) return { kind: "grab", targetId: grabbable.id };
  return null;
}

/** Who a Pass would go to (nearest eligible), or null. */
export function passTarget(me: RulePlayer, players: Iterable<RulePlayer>, potlis: Potlis): RulePlayer | null {
  const pots = [...potlis];
  return nearest(me, players, (p) => canPass(me, p, pots));
}

/** Is this big-button action allowed right now? Server-side check. */
export function isActionAllowed(
  me: RulePlayer,
  action: Action,
  players: Map<string, RulePlayer>,
  potlis: Potlis,
): boolean {
  const pots = [...potlis];
  const target = players.get(action.targetId);
  switch (action.kind) {
    case "unfreeze":
      return !!target && canUnfreeze(me, target);
    case "tag":
      return !!target && canTag(me, target);
    case "snatch": {
      const potli = target ? carrying(target, pots) : undefined;
      return !!target && !!potli && canSnatch(me, target, potli, pots);
    }
    case "grab": {
      const potli = pots.find((p) => p.id === action.targetId);
      return !!potli && canGrab(me, potli, pots);
    }
    default:
      return false;
  }
}

// ----------------------------------------------------------------- role button

/** Detective: handcuff a teammate within reach (frozen or not, but not Out). D47. */
export function canArrest(me: RulePlayer, target: RulePlayer): boolean {
  return (
    me.secretRole === "detective" &&
    !me.frozen &&
    target.id !== me.id &&
    target.team === me.team &&
    freezeOf(target) !== "out" &&
    dist(me, target) <= D.arrest
  );
}

/**
 * Spy: secretly freeze a FAKE teammate (sits with you, plays for the other side),
 * anywhere on the map. Not while your hand is still iced (D5).
 */
export function canIce(me: RulePlayer, target: RulePlayer): boolean {
  return (
    isSpy(me) &&
    !me.frozen &&
    !me.icedHand &&
    target.id !== me.id &&
    target.team === me.team &&
    realTeamOf(target) !== realTeamOf(me) &&
    !target.frozen &&
    !target.protected &&
    dist(me, target) <= D.secretFreeze
  );
}

/** Spy: secretly unfreeze a player of your REAL team (normal ice only). */
export function canFree(me: RulePlayer, target: RulePlayer): boolean {
  return (
    isSpy(me) &&
    !me.frozen &&
    target.id !== me.id &&
    realTeamOf(target) === realTeamOf(me) &&
    freezeOf(target) === "ice" &&
    dist(me, target) <= D.lampUnfreeze
  );
}

/** Anyone: start dragging a shame-frozen Detective of your team toward a fireplace (D48). */
export function canDrag(me: RulePlayer, target: RulePlayer): boolean {
  return (
    !me.frozen &&
    target.id !== me.id &&
    target.team === me.team &&
    freezeOf(target) === "shame" &&
    !target.rescueUsed &&
    !target.draggedBy &&
    dist(me, target) <= D.drag
  );
}

/**
 * What the role button does right now, or null (hidden).
 * Release > Drag > Free > Ice > Arrest.
 */
export function bestRoleAction(me: RulePlayer, players: Iterable<RulePlayer>): RoleAction | null {
  if (me.frozen) return null;
  const list = [...players];

  const dragging = list.find((p) => p.draggedBy === me.id);
  if (dragging) return { kind: "release", targetId: dragging.id };

  const shamed = nearest(me, list, (p) => canDrag(me, p));
  if (shamed) return { kind: "drag", targetId: shamed.id };

  const free = nearest(me, list, (p) => canFree(me, p));
  if (free) return { kind: "free", targetId: free.id };

  const ice = nearest(me, list, (p) => canIce(me, p));
  if (ice) return { kind: "ice", targetId: ice.id };

  const suspect = nearest(me, list, (p) => canArrest(me, p));
  if (suspect) return { kind: "arrest", targetId: suspect.id };

  return null;
}

/** Is this role action allowed right now? Server-side check. */
export function isRoleActionAllowed(me: RulePlayer, action: RoleAction, players: Map<string, RulePlayer>): boolean {
  const target = players.get(action.targetId);
  if (!target) return false;
  switch (action.kind) {
    case "arrest":
      return canArrest(me, target);
    case "ice":
      return canIce(me, target);
    case "free":
      return canFree(me, target);
    case "drag":
      return canDrag(me, target);
    case "release":
      return target.draggedBy === me.id;
    default:
      return false;
  }
}

// ------------------------------------------------------------- dens and speed

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

/** Within reach of a fireplace (melt the iced hand, rescue a shamed Detective). */
export function nearFireplace(p: { x: number; y: number }): boolean {
  return MAP.circles.some((c) => c.kind === "fireplace" && dist(p, c) <= c.r + D.fireplaceUse);
}

/**
 * Speed multiplier for one player:
 * - carrying the potli slows you down (D38), so chasers can catch you;
 * - GDD: a Leader carrying it runs faster, but only if no teammate is frozen;
 * - dragging a shamed Detective halves your speed (D9).
 */
export function speedMultiplier(me: RulePlayer, players: Iterable<RulePlayer>, potlis: Potlis): number {
  const list = [...players];
  const drag = list.some((p) => p.draggedBy === me.id) ? CONFIG.movement.dragSpeedMultiplier : 1;
  if (!carrying(me, potlis)) return drag;
  const carry = CONFIG.movement.carrierSpeedMultiplier * drag;
  if (!isLeader(me)) return carry;
  for (const p of list) if (p.team === me.team && p.frozen) return carry;
  return carry * CONFIG.movement.leaderCarrySpeedBonus;
}
