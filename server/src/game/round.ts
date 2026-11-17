/**
 * One round. Every rule that plays out over time lives here.
 *
 * M2: actions, the snatch countdown, the Leader's auto-thaw and protection,
 *     the potli following its carrier, the timer, and the ways a round ends.
 * M3: secret roles (Detective, spies), the spy's secret freeze (iced hand,
 *     footprints, fireplace melt), secret unfreeze, silent pass (and getting
 *     exposed), arrests (Out / shame freeze), dragging a shamed Detective to a
 *     fireplace, spies never scoring, and wipe-out counted by REAL team.
 *
 * It only touches the GameState and pushes `events` (pings, announcements)
 * for the room to deliver, so tests can drive it directly.
 */
import {
  CONFIG,
  Footprint,
  Freeze,
  MAP,
  Phase,
  Role,
  SecretRole,
  TEAMS,
  assignRoles,
  assignTeams,
  canSee,
  dist,
  inGoal,
  isActionAllowed,
  isRoleActionAllowed,
  nearFireplace,
  passTarget,
  resolveCollisions,
  roundDurationSeconds,
  spawnPoint,
  speedMultiplier,
  type Action,
  type GameState,
  type PlayerState,
  type RoleAction,
  type Team,
} from "@gully/shared";

export type RoundEvent =
  | { type: "announce"; text: string }
  | { type: "frozenPing"; to: string; x: number; y: number; name: string };

const names = CONFIG.teams.names as Record<string, string>;

export class Round {
  /** Things the room should tell players (drained every tick). */
  events: RoundEvent[] = [];

  /** Seconds until each frozen Leader thaws (fractional, server-only). */
  private thawTimers = new Map<string, number>();
  /** Seconds of post-thaw protection left. */
  private protectTimers = new Map<string, number>();
  /** Spy id -> seconds until their iced hand thaws by itself. */
  private handTimers = new Map<string, number>();
  /** Spy id -> footprint trail state after a secret freeze. */
  private trails = new Map<string, { left: number; next: number }>();
  /** Footprint id -> seconds until it fades. */
  private printTimers = new Map<string, number>();
  private printCounter = 0;
  /** Detective id -> wrong arrests this round. */
  private wrongArrests = new Map<string, number>();
  private secondAcc = 0;

  constructor(
    private readonly state: GameState,
    private readonly random: () => number = Math.random,
  ) {}

  // ------------------------------------------------------------- setup

  /** Teams, roles, spawns, potli in the middle, timer. */
  start() {
    const s = this.state;
    const teams = assignTeams([...s.players.keys()], this.random);
    const nextSpot: Record<Team, number> = { blue: 0, green: 0 };

    for (const [id, p] of s.players) {
      const team = teams.get(id)!;
      const spot = spawnPoint(team, nextSpot[team]++);
      Object.assign(p, {
        team,
        role: Role.Normal,
        secretRole: SecretRole.None,
        realTeam: team,
        x: spot.x,
        y: spot.y,
        fx: team === "blue" ? 127 : -127,
        fy: 0,
        frozen: false,
        freeze: Freeze.None,
        thawIn: 0,
        protected: false,
        exposed: false,
        draggedBy: "",
        rescueUsed: false,
        icedHand: false,
      });
    }

    // Roles inside each team: Leader, Detective, spy (planted by the other team), Normals.
    for (const team of TEAMS) {
      const members = [...s.players.values()].filter((p) => p.team === team).map((p) => p.id);
      for (const [id, a] of assignRoles(team, members, this.random)) {
        const p = s.players.get(id)!;
        p.role = a.role;
        p.secretRole = a.secretRole;
        p.realTeam = a.realTeam;
      }
    }

    s.potli.x = MAP.middleZone.x;
    s.potli.y = MAP.middleZone.y;
    s.potli.carrierId = "";
    this.cancelSnatch();
    s.footprints.clear();

    s.timeLeft = roundDurationSeconds(s.players.size);
    s.winner = "";
    s.endReason = "";
    for (const m of [this.thawTimers, this.protectTimers, this.handTimers, this.trails, this.printTimers, this.wrongArrests]) {
      m.clear();
    }
    this.secondAcc = 0;
    this.events = [];
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
        this.freeze(target!, Freeze.Ice);
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

  /** The role button (D42): arrest / ice / free / drag / release. */
  roleAct(playerId: string, action: RoleAction): boolean {
    const s = this.state;
    const me = s.players.get(playerId);
    if (!me || s.phase !== Phase.Playing) return false;
    if (!isRoleActionAllowed(me, action, s.players)) return false;
    const target = s.players.get(action.targetId)!;

    switch (action.kind) {
      case "arrest":
        this.arrest(me, target);
        break;
      case "ice":
        // Looks exactly like a normal tag (GDD), but costs the spy an iced hand + footprints.
        this.freeze(target, Freeze.Ice);
        me.icedHand = true;
        this.handTimers.set(me.id, CONFIG.timers.frozenHandSec);
        this.trails.set(me.id, { left: CONFIG.footprints.trailSec, next: 0 });
        break;
      case "free":
        this.unfreeze(target);
        break;
      case "drag":
        target.draggedBy = me.id;
        break;
      case "release":
        target.draggedBy = "";
        break;
    }
    return true;
  }

  /** The Pass button. A spy passing to their real team is the silent pass. */
  pass(playerId: string): boolean {
    const s = this.state;
    const me = s.players.get(playerId);
    if (!me || s.phase !== Phase.Playing) return false;
    const mate = passTarget(me, s.players.values(), s.potli);
    if (!mate) return false;
    s.potli.carrierId = mate.id;
    this.cancelSnatch(); // a hand-off beats the countdown

    if (mate.team !== me.team) {
      // Silent pass (spy -> real team). If a fake teammate sees it, the spy is exposed.
      const witness = [...s.players.values()].find(
        (w) =>
          w.team === me.team &&
          w.realTeam === me.team && // a genuine member of the team the spy sits in
          w.id !== me.id &&
          !w.frozen &&
          canSee(w, me),
      );
      if (witness && !me.exposed) {
        me.exposed = true;
        this.announce(`${witness.nickname} saw ${me.nickname} pass the potli to ${names[mate.team]}. ${me.nickname} is a SPY!`);
      }
    }
    return true;
  }

  /** How fast this player moves right now (carry, Leader bonus, dragging). */
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

    this.tickLeaders(dt);
    this.tickSpies(dt);
    this.tickDrags();

    // The potli moves with its carrier.
    const carrier = s.players.get(s.potli.carrierId);
    if (carrier) {
      s.potli.x = carrier.x;
      s.potli.y = carrier.y;
    } else if (s.potli.carrierId) {
      s.potli.carrierId = "";
    }

    this.tickSnatch(dt);
    this.checkEnd();
  }

  /** Frozen Leaders thaw on their own after ~10 s, then get brief protection. */
  private tickLeaders(dt: number) {
    const s = this.state;
    for (const [id, left] of this.thawTimers) {
      const p = s.players.get(id);
      if (!p || p.freeze !== Freeze.Ice) {
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
  }

  /** Iced hands thaw (or melt at a fireplace); footprints are laid and fade. */
  private tickSpies(dt: number) {
    const s = this.state;
    for (const [id, left] of this.handTimers) {
      const p = s.players.get(id);
      const now = left - dt;
      if (!p || now <= 0 || nearFireplace(p)) {
        if (p) p.icedHand = false;
        this.handTimers.delete(id);
      } else {
        this.handTimers.set(id, now);
      }
    }

    for (const [id, trail] of this.trails) {
      const p = s.players.get(id);
      trail.left -= dt;
      trail.next -= dt;
      if (!p || trail.left <= 0) {
        this.trails.delete(id);
        continue;
      }
      if (trail.next <= 0) {
        trail.next = CONFIG.footprints.everySec;
        const fid = `f${++this.printCounter}`;
        s.footprints.set(fid, new Footprint({ x: p.x, y: p.y, angle: Math.atan2(p.fy, p.fx) }));
        this.printTimers.set(fid, CONFIG.timers.footprintsSec);
      }
    }

    for (const [fid, left] of this.printTimers) {
      const now = left - dt;
      if (now <= 0) {
        s.footprints.delete(fid);
        this.printTimers.delete(fid);
      } else {
        this.printTimers.set(fid, now);
      }
    }
  }

  /** A dragged Detective trails behind their rescuer; reaching a fireplace frees them (once). */
  private tickDrags() {
    const s = this.state;
    for (const p of s.players.values()) {
      if (!p.draggedBy) continue;
      const dragger = s.players.get(p.draggedBy);
      if (!dragger || dragger.frozen || p.freeze !== Freeze.Shame) {
        p.draggedBy = "";
        continue;
      }
      // Hang on just behind the dragger.
      const len = Math.sqrt(dragger.fx * dragger.fx + dragger.fy * dragger.fy) || 1;
      const back = CONFIG.movement.playerRadius * 2 + 4;
      const target = { x: dragger.x - (dragger.fx / len) * back, y: dragger.y - (dragger.fy / len) * back };
      if (dist(p, target) > 2) {
        p.x = target.x;
        p.y = target.y;
        resolveCollisions(p, CONFIG.movement.playerRadius);
      }
      if (nearFireplace(p) || nearFireplace(dragger)) {
        this.unfreeze(p);
        p.rescueUsed = true;
        p.draggedBy = "";
        this.announce(`${p.nickname} was dragged to the fire and is back in the game (no more rescues).`);
      }
    }
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

  /** Score, then wipe-out, then time. */
  private checkEnd() {
    const s = this.state;
    const carrier = s.players.get(s.potli.carrierId);
    // D39: you score by carrying the potli into the ENEMY's den. D2: a spy never scores.
    if (carrier && carrier.secretRole !== SecretRole.Spy && inGoal(carrier.team as Team, carrier)) {
      return this.end(carrier.team, "home");
    }

    // Wipe-out (GDD): every player who REALLY plays for a team (incl. their planted
    // spies) is frozen or Out at the same time.
    for (const team of TEAMS) {
      const members = [...s.players.values()].filter((p) => p.realTeam === team);
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

  private arrest(det: PlayerState, suspect: PlayerState) {
    if (suspect.secretRole === SecretRole.Spy) {
      suspect.exposed = true;
      this.freeze(suspect, Freeze.Out);
      this.announce(
        `${det.nickname} arrested ${suspect.nickname}: a SPY for ${names[suspect.realTeam]}! ${suspect.nickname} is Out.`,
      );
      return;
    }
    const wrong = (this.wrongArrests.get(det.id) ?? 0) + 1;
    this.wrongArrests.set(det.id, wrong);
    if (wrong >= 2) {
      this.freeze(det, Freeze.Out);
      this.announce(`${det.nickname} arrested ${suspect.nickname}, who is innocent. Second mistake: ${det.nickname} is Out!`);
    } else {
      this.freeze(det, Freeze.Shame);
      this.announce(
        `${det.nickname} arrested ${suspect.nickname}, who is innocent! ${det.nickname} is shame-frozen. Drag them to a fire.`,
      );
    }
  }

  private freeze(p: PlayerState, kind: string) {
    const s = this.state;
    const wasFrozen = p.frozen;
    p.frozen = true;
    p.freeze = kind;
    p.protected = false;
    // GDD: a frozen carrier drops the potli where they stand.
    if (s.potli.carrierId === p.id) {
      s.potli.carrierId = "";
      s.potli.x = p.x;
      s.potli.y = p.y;
      this.cancelSnatch();
    }
    if (s.potli.snatcherId === p.id) this.cancelSnatch();
    // Anyone this player was dragging is let go.
    for (const o of s.players.values()) if (o.draggedBy === p.id) o.draggedBy = "";
    if (kind !== Freeze.Shame) p.draggedBy = "";

    if (p.role === Role.Leader && kind === Freeze.Ice) {
      this.thawTimers.set(p.id, CONFIG.timers.leaderAutoThawSec);
      p.thawIn = CONFIG.timers.leaderAutoThawSec;
    } else {
      this.thawTimers.delete(p.id);
      p.thawIn = 0;
    }

    // GDD: the Detective is notified whenever a teammate is frozen, to get there first.
    if (!wasFrozen) {
      for (const d of s.players.values()) {
        if (d.secretRole === SecretRole.Detective && d.team === p.team && d.id !== p.id && !d.frozen) {
          this.events.push({ type: "frozenPing", to: d.id, x: p.x, y: p.y, name: p.nickname });
        }
      }
    }
  }

  private unfreeze(p: PlayerState) {
    p.frozen = false;
    p.freeze = Freeze.None;
    p.thawIn = 0;
    p.draggedBy = "";
    this.thawTimers.delete(p.id);
  }

  private cancelSnatch() {
    this.state.potli.snatcherId = "";
    this.state.potli.snatchLeft = 0;
  }

  private announce(text: string) {
    this.events.push({ type: "announce", text });
  }
}
