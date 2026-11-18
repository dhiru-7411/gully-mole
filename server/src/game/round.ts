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
  PotliState,
  Role,
  SecretRole,
  TEAMS,
  assignRoles,
  assignTeams,
  canSee,
  carrying,
  visionRadius,
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

import { RoundStats } from "./stats";

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
  /** Player id -> seconds until they may Tag again (D63). */
  private tagTimers = new Map<string, number>();
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
        tagCooldown: 0,
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

    // Two potlis (D68), north and south of the centre on the half line.
    // Reuse the same objects every round (the per-player views track them).
    for (const start of MAP.potliStarts) {
      const potli = s.potlis.get(start.id) ?? new PotliState({ id: start.id });
      Object.assign(potli, { x: start.x, y: start.y, carrierId: "", snatcherId: "", snatchLeft: 0, scoredBy: "" });
      if (!s.potlis.has(start.id)) s.potlis.set(start.id, potli);
    }
    s.scoredBlue = 0;
    s.scoredGreen = 0;
    s.footprints.clear();

    s.timeLeft = roundDurationSeconds(s.players.size);
    s.winner = "";
    s.endReason = "";
    for (const m of [this.thawTimers, this.protectTimers, this.handTimers, this.trails, this.printTimers, this.wrongArrests, this.tagTimers]) {
      m.clear();
    }
    this.secondAcc = 0;
    this.events = [];
    this.stats.reset();
    this.anyGrab = false;
  }

  /** M5: automatic stats for the end-of-round reveal and timeout winner. */
  readonly stats = new RoundStats();
  private anyGrab = false;

  // ----------------------------------------------------------- actions

  /** The big button. Returns true if it happened. The server never trusts the client. */
  act(playerId: string, action: Action): boolean {
    const s = this.state;
    const me = s.players.get(playerId);
    if (!me || s.phase !== Phase.Playing) return false;
    if (!isActionAllowed(me, action, s.players, s.potlis.values())) return false;

    const target = s.players.get(action.targetId);
    switch (action.kind) {
      case "tag":
        // D63: you can't tag again for 10 s.
        this.tagTimers.set(me.id, CONFIG.timers.tagCooldownSec);
        me.tagCooldown = CONFIG.timers.tagCooldownSec;
        this.stats.p(me.id).freezes++;
        if (target!.realTeam !== me.realTeam) this.stats.add(me.realTeam, "enemiesFrozen");
        this.stats.add(target!.realTeam, "ownPlayersFrozen");
        this.freeze(target!, Freeze.Ice);
        break;
      case "unfreeze":
        this.stats.p(me.id).lampUnfreezes++;
        this.stats.add(me.realTeam, "lampUnfreezes");
        this.unfreeze(target!);
        break;
      case "snatch":
        const potli = carrying(target!, s.potlis.values())!;
        potli.snatcherId = me.id;
        potli.snatchLeft = CONFIG.timers.snatchCountdownSec;
        break;
      case "grab":
        const grabbed = s.potlis.get(action.targetId)!;
        if (grabbed.scoredBy) {
          this.stats.moment(`${me.nickname} stole a scored potli back out of the den!`);
          grabbed.scoredBy = ""; // taken back out: no longer counts (D68)
        }
        grabbed.carrierId = me.id;
        this.stats.p(me.id).grabs++;
        if (!this.anyGrab) this.stats.moment(`${me.nickname} grabbed the potli first.`);
        this.anyGrab = true;
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
        this.stats.p(me.id).ices++;
        this.stats.add(target.realTeam, "ownPlayersFrozen");
        this.freeze(target, Freeze.Ice);
        me.icedHand = true;
        this.handTimers.set(me.id, CONFIG.timers.frozenHandSec);
        this.trails.set(me.id, { left: CONFIG.footprints.trailSec, next: 0 });
        break;
      case "free":
        this.stats.p(me.id).frees++;
        this.stats.add(me.realTeam, "spySecretUnfreezes");
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
    const mate = passTarget(me, s.players.values(), s.potlis.values());
    const potli = carrying(me, s.potlis.values());
    if (!mate || !potli) return false;
    potli.carrierId = mate.id;
    this.cancelSnatch(potli); // a hand-off beats the countdown

    if (mate.team === me.team && mate.realTeam === me.realTeam) {
      this.stats.p(me.id).handOffs++;
      this.stats.add(me.realTeam, "handOffs");
    }
    if (mate.team !== me.team) {
      this.stats.p(me.id).silentPasses++;
      this.stats.add(me.realTeam, "spySilentPasses");
      // Silent pass (spy -> real team). If a fake teammate sees it, the spy is exposed.
      const witness = [...s.players.values()].find(
        (w) =>
          w.team === me.team &&
          w.realTeam === me.team && // a genuine member of the team the spy sits in
          w.id !== me.id &&
          !w.frozen &&
          canSee(w, me, visionRadius(w)),
      );
      if (witness && !me.exposed) {
        me.exposed = true;
        this.stats.caught.add(me.id);
        this.announce(`${witness.nickname} saw ${me.nickname} pass the potli to ${names[mate.team]}. ${me.nickname} is a SPY!`);
      }
    }
    return true;
  }

  /** How fast this player moves right now (carry, Leader bonus, dragging). */
  speedFor(p: PlayerState): number {
    return speedMultiplier(p, this.state.players.values(), this.state.potlis.values());
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
    this.stats.tick(dt, s);

    // Each potli moves with its carrier.
    for (const potli of s.potlis.values()) {
      const carrier = s.players.get(potli.carrierId);
      if (carrier) {
        potli.x = carrier.x;
        potli.y = carrier.y;
      } else if (potli.carrierId) {
        potli.carrierId = "";
      }
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
    // Tag cooldowns (D63).
    for (const [id, left] of this.tagTimers) {
      const p = s.players.get(id);
      const now = left - dt;
      if (!p || now <= 0) {
        if (p) p.tagCooldown = 0;
        this.tagTimers.delete(id);
      } else {
        this.tagTimers.set(id, now);
        p.tagCooldown = Math.ceil(now);
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
    for (const potli of s.potlis.values()) {
      if (!potli.snatcherId) continue;
      const snatcher = s.players.get(potli.snatcherId);
      const carrier = s.players.get(potli.carrierId);
      // The countdown only continues while the snatcher stays beside the carrier (D36).
      const stillOn =
        snatcher &&
        carrier &&
        !snatcher.frozen &&
        !carrying(snatcher, s.potlis.values()) &&
        dist(snatcher, carrier) <= CONFIG.distances.snatch * 1.25;
      if (!stillOn) {
        this.cancelSnatch(potli);
        continue;
      }

      potli.snatchLeft = Math.max(0, potli.snatchLeft - dt);
      if (potli.snatchLeft === 0) {
        potli.carrierId = snatcher.id;
        this.stats.p(snatcher.id).snatches++;
        this.stats.add(snatcher.realTeam, "objectSnatched");
        this.stats.add(carrier.realTeam, "objectLostToEnemy");
        this.stats.moment(`${snatcher.nickname} snatched a potli from ${carrier.nickname}.`);
        this.cancelSnatch(potli);
      }
    }
  }

  /**
   * D68: a carrier who reaches their goal den (the ENEMY's den) drops the potli
   * there: it's "scored" for that team, and their hands are free again.
   * A spy never scores (D2).
   */
  private deliver() {
    const s = this.state;
    for (const potli of s.potlis.values()) {
      const carrier = s.players.get(potli.carrierId);
      if (!carrier || carrier.secretRole === SecretRole.Spy) continue;
      if (!inGoal(carrier.team as Team, carrier)) continue;
      potli.carrierId = "";
      potli.scoredBy = carrier.team;
      potli.x = carrier.x;
      potli.y = carrier.y;
      this.cancelSnatch(potli);
      const scored = [...s.potlis.values()].filter((p) => p.scoredBy === carrier.team).length;
      this.announce(`${carrier.nickname} scored a potli for ${names[carrier.team]} (${scored}/${s.potlis.size})!`);
    }
  }

  /** Score, then wipe-out, then time. */
  private checkEnd() {
    const s = this.state;
    this.deliver();
    const all = [...s.potlis.values()];
    s.scoredBlue = all.filter((p) => p.scoredBy === "blue").length;
    s.scoredGreen = all.filter((p) => p.scoredBy === "green").length;
    // D68: you win when BOTH potlis sit scored in your goal den at the same time.
    for (const team of TEAMS) {
      if (all.length > 0 && all.every((p) => p.scoredBy === team)) return this.end(team, "home");
    }

    // Wipe-out (GDD): every player who REALLY plays for a team (incl. their planted
    // spies) is frozen or Out at the same time.
    for (const team of TEAMS) {
      const members = [...s.players.values()].filter((p) => p.realTeam === team);
      if (members.length > 0 && members.every((p) => p.frozen)) {
        return this.end(team === "blue" ? "green" : "blue", "wipeout");
      }
    }

    // Time's up: the better automatic stats score wins (GDD), decided in end().
    if (s.timeLeft === 0) return this.end("", "time");
  }

  private end(winner: string, reason: string) {
    const s = this.state;
    if (reason === "home") this.stats.moment(`${names[winner]} scored!`);
    if (reason === "wipeout") this.stats.moment(`${names[winner]} froze the whole other team.`);
    if (reason === "time") this.stats.moment("Time ran out.");
    this.stats.finish(s); // fills state.summary (scores, factors, moments, awards on offer)
    if (reason === "time") {
      const b = s.summary.blueScore;
      const g = s.summary.greenScore;
      winner = b > g ? "blue" : g > b ? "green" : "draw";
    }
    s.winner = winner;
    s.endReason = reason;
    s.phase = Phase.Ended;
    this.cancelSnatch();
  }

  // ------------------------------------------------------------ helpers

  private arrest(det: PlayerState, suspect: PlayerState) {
    if (suspect.secretRole === SecretRole.Spy) {
      this.stats.p(det.id).correctArrests++;
      this.stats.add(det.realTeam, "correctArrest");
      this.stats.caught.add(suspect.id);
      suspect.exposed = true;
      this.freeze(suspect, Freeze.Out);
      this.announce(
        `${det.nickname} arrested ${suspect.nickname}: a SPY for ${names[suspect.realTeam]}! ${suspect.nickname} is Out.`,
      );
      return;
    }
    const wrong = (this.wrongArrests.get(det.id) ?? 0) + 1;
    this.wrongArrests.set(det.id, wrong);
    this.stats.p(det.id).wrongArrests++;
    this.stats.add(det.realTeam, "wrongArrest");
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
    for (const potli of s.potlis.values()) {
      if (potli.carrierId === p.id) {
        this.stats.noteFrozenCarrier(p);
        potli.carrierId = "";
        potli.x = p.x;
        potli.y = p.y;
        this.cancelSnatch(potli);
      }
      if (potli.snatcherId === p.id) this.cancelSnatch(potli);
    }
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

  /** Stop the snatch countdown on one potli, or on all of them. */
  private cancelSnatch(potli?: PotliState) {
    for (const p of potli ? [potli] : this.state.potlis.values()) {
      p.snatcherId = "";
      p.snatchLeft = 0;
    }
  }

  private announce(text: string) {
    this.stats.moment(text); // every announcement is a key moment for the reveal
    this.events.push({ type: "announce", text });
  }
}
