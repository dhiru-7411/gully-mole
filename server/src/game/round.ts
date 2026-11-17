/**
 * One round of capture-the-potli (M2). Every rule that plays out over time
 * lives here: actions, the snatch countdown, the Leader's auto-thaw and
 * protection, the potli following its carrier, the timer, and the three ways a
 * round ends (GDD "Round timer and win conditions").
 *
 * It only touches the GameState, so tests can drive it directly without any
 * networking.
 */
import {
  CONFIG,
  MAP,
  Phase,
  Role,
  TEAMS,
  assignTeams,
  inGoal,
  isActionAllowed,
  passTarget,
  roundDurationSeconds,
  shuffled,
  spawnPoint,
  speedMultiplier,
  dist,
  type Action,
  type GameState,
  type PlayerState,
  type Team,
} from "@gully/shared";

export class Round {
  /** Seconds until each frozen Leader thaws (fractional, server-only). */
  private thawTimers = new Map<string, number>();
  /** Seconds of post-thaw protection left. */
  private protectTimers = new Map<string, number>();
  private secondAcc = 0;

  constructor(
    private readonly state: GameState,
    private readonly random: () => number = Math.random,
  ) {}

  // ------------------------------------------------------------- setup

  /** Teams, a Leader per team, spawns, potli in the middle, timer. */
  start() {
    const s = this.state;
    const teams = assignTeams([...s.players.keys()], this.random);
    const nextSpot: Record<Team, number> = { blue: 0, green: 0 };

    for (const [id, p] of s.players) {
      const team = teams.get(id)!;
      const spot = spawnPoint(team, nextSpot[team]++);
      p.team = team;
      p.role = Role.Normal;
      p.x = spot.x;
      p.y = spot.y;
      p.fx = team === "blue" ? 127 : -127;
      p.fy = 0;
      p.frozen = false;
      p.thawIn = 0;
      p.protected = false;
    }

    // One random Leader per team (DECISIONS D35).
    for (const team of TEAMS) {
      const members = [...s.players.values()].filter((p) => p.team === team);
      const leader = shuffled(members, this.random)[0];
      if (leader) leader.role = Role.Leader;
    }

    s.potli.x = MAP.middleZone.x;
    s.potli.y = MAP.middleZone.y;
    s.potli.carrierId = "";
    this.cancelSnatch();

    s.timeLeft = roundDurationSeconds(s.players.size);
    s.winner = "";
    s.endReason = "";
    this.thawTimers.clear();
    this.protectTimers.clear();
    this.secondAcc = 0;
  }

  // ----------------------------------------------------------- actions

  /** The big button. Returns true if it happened. The server never trusts the client. */
  act(playerId: string, action: Action): boolean {
    const s = this.state;
    const me = s.players.get(playerId);
    if (!me || s.phase !== Phase.Playing) return false;
    if (!isActionAllowed(me, action, s.players, s.potli)) return false;

    const target = s.players.get(action.targetId);
    switch (action.kind) {
      case "tag":
        this.freeze(target!);
        break;
      case "unfreeze":
        this.unfreeze(target!);
        break;
      case "snatch":
        s.potli.snatcherId = me.id;
        s.potli.snatchLeft = CONFIG.timers.snatchCountdownSec;
        break;
      case "grab":
        s.potli.carrierId = me.id;
        break;
    }
    return true;
  }

  /** The Pass button: hand the potli to the nearest free teammate beside you. */
  pass(playerId: string): boolean {
    const s = this.state;
    const me = s.players.get(playerId);
    if (!me || s.phase !== Phase.Playing) return false;
    const mate = passTarget(me, s.players.values(), s.potli);
    if (!mate) return false;
    s.potli.carrierId = mate.id;
    this.cancelSnatch(); // a hand-off beats the countdown
    return true;
  }

  /** How fast this player moves right now (Leader carry bonus). */
  speedFor(p: PlayerState): number {
    return speedMultiplier(p, this.state.players.values(), this.state.potli);
  }

  // -------------------------------------------------------------- tick

  tick(dt: number) {
    const s = this.state;
    if (s.phase !== Phase.Playing) return;

    // Timer.
    this.secondAcc += dt;
    while (this.secondAcc >= 1 && s.timeLeft > 0) {
      this.secondAcc -= 1;
      s.timeLeft--;
    }

    // Frozen Leaders thaw on their own after ~10 s, then get brief protection.
    for (const [id, left] of this.thawTimers) {
      const p = s.players.get(id);
      if (!p || !p.frozen) {
        this.thawTimers.delete(id);
        continue;
      }
      const now = left - dt;
      if (now <= 0) {
        this.unfreeze(p);
        p.protected = true;
        this.protectTimers.set(id, CONFIG.timers.leaderProtectionSec);
      } else {
        this.thawTimers.set(id, now);
        p.thawIn = Math.ceil(now);
      }
    }
    for (const [id, left] of this.protectTimers) {
      const now = left - dt;
      const p = s.players.get(id);
      if (now <= 0 || !p) {
        if (p) p.protected = false;
        this.protectTimers.delete(id);
      } else {
        this.protectTimers.set(id, now);
      }
    }

    // The potli moves with its carrier.
    const carrier = s.players.get(s.potli.carrierId);
    if (carrier) {
      s.potli.x = carrier.x;
      s.potli.y = carrier.y;
    } else if (s.potli.carrierId) {
      s.potli.carrierId = ""; // carrier vanished (shouldn't happen mid-round)
    }

    this.tickSnatch(dt);
    this.checkEnd();
  }

  private tickSnatch(dt: number) {
    const s = this.state;
    if (!s.potli.snatcherId) return;
    const snatcher = s.players.get(s.potli.snatcherId);
    const carrier = s.players.get(s.potli.carrierId);
    // The countdown only continues while the snatcher stays beside the carrier (D36).
    const stillOn =
      snatcher && carrier && !snatcher.frozen && dist(snatcher, carrier) <= CONFIG.distances.snatch * 1.25;
    if (!stillOn) return this.cancelSnatch();

    s.potli.snatchLeft = Math.max(0, s.potli.snatchLeft - dt);
    if (s.potli.snatchLeft === 0) {
      s.potli.carrierId = snatcher.id;
      this.cancelSnatch();
    }
  }

  /** GDD order: score, then wipe-out, then time. */
  private checkEnd() {
    const s = this.state;
    const carrier = s.players.get(s.potli.carrierId);
    // D39: you score by carrying the potli into the ENEMY's den.
    if (carrier && inGoal(carrier.team as Team, carrier)) return this.end(carrier.team, "home");

    for (const team of TEAMS) {
      const members = [...s.players.values()].filter((p) => p.team === team);
      // (M3 adds: plus the spy they planted in your team.)
      if (members.length > 0 && members.every((p) => p.frozen)) {
        return this.end(team === "blue" ? "green" : "blue", "wipeout");
      }
    }

    // Until M5's stats exist, a timed-out round is a draw (D37).
    if (s.timeLeft === 0) return this.end("draw", "time");
  }

  private end(winner: string, reason: string) {
    const s = this.state;
    s.winner = winner;
    s.endReason = reason;
    s.phase = Phase.Ended;
    this.cancelSnatch();
  }

  // ------------------------------------------------------------ helpers

  private freeze(p: PlayerState) {
    const s = this.state;
    p.frozen = true;
    // GDD: a frozen carrier drops the potli where they stand.
    if (s.potli.carrierId === p.id) {
      s.potli.carrierId = "";
      s.potli.x = p.x;
      s.potli.y = p.y;
      this.cancelSnatch();
    }
    if (s.potli.snatcherId === p.id) this.cancelSnatch();
    if (p.role === Role.Leader) {
      this.thawTimers.set(p.id, CONFIG.timers.leaderAutoThawSec);
      p.thawIn = CONFIG.timers.leaderAutoThawSec;
    }
  }

  private unfreeze(p: PlayerState) {
    p.frozen = false;
    p.thawIn = 0;
    this.thawTimers.delete(p.id);
  }

  private cancelSnatch() {
    this.state.potli.snatcherId = "";
    this.state.potli.snatchLeft = 0;
  }
}
