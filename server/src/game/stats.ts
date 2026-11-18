/**
 * Automatic stats for one round (GDD "Scoring").
 *
 * - Team factors decide a timed-out round (FACTORS in shared/src/awards.ts).
 *   Anything a spy does counts for their REAL team.
 * - Per-player numbers feed the awards' honesty check and the MVP tie-break.
 * - Key moments make the reveal screen tell the story of the round.
 */
import {
  ArraySchema,
} from "@colyseus/schema";
import {
  AWARDS,
  FACTORS,
  FactorRow,
  MAP,
  SummaryState,
  dist,
  emptyFactors,
  goalDen,
  teamScore,
  type FactorCounts,
  type FactorKey,
  type GameState,
  type PlayerState,
  type Team,
} from "@gully/shared";

export interface PlayerStats {
  freezes: number;
  snatches: number;
  grabs: number;
  holdSec: number;
  handOffs: number;
  lampUnfreezes: number;
  ices: number;
  frees: number;
  silentPasses: number;
  correctArrests: number;
  wrongArrests: number;
  /** Times frozen while carrying the potli. */
  frozenCarrying: number;
  /** Huddle chat lines (Professional Yapper). */
  chats: number;
}

const emptyPlayer = (): PlayerStats => ({
  freezes: 0,
  snatches: 0,
  grabs: 0,
  holdSec: 0,
  handOffs: 0,
  lampUnfreezes: 0,
  ices: 0,
  frees: 0,
  silentPasses: 0,
  correctArrests: 0,
  wrongArrests: 0,
  frozenCarrying: 0,
  chats: 0,
});

const goalCentre = (team: Team) => {
  const d = goalDen(team);
  return { x: d.x + d.w / 2, y: d.y + d.h / 2 };
};
const MIDDLE = { x: MAP.middleZone.x, y: MAP.middleZone.y };

export class RoundStats {
  team: Record<Team, FactorCounts> = { blue: emptyFactors(), green: emptyFactors() };
  players = new Map<string, PlayerStats>();
  /** Best progress toward scoring, 0..1, per team. */
  private progress: Record<Team, number> = { blue: 0, green: 0 };
  /** Spies who were exposed or arrested (Caught in 4K, and their freezes count as traced). */
  caught = new Set<string>();
  /** Carriers frozen right before scoring (Fumbled the Bag). */
  fumbled = new Set<string>();
  moments: string[] = [];
  private elapsed = 0;

  reset() {
    this.team = { blue: emptyFactors(), green: emptyFactors() };
    this.players.clear();
    this.progress = { blue: 0, green: 0 };
    this.caught.clear();
    this.fumbled.clear();
    this.moments = [];
    this.elapsed = 0;
  }

  p(id: string): PlayerStats {
    let s = this.players.get(id);
    if (!s) this.players.set(id, (s = emptyPlayer()));
    return s;
  }

  add(team: string, key: FactorKey, n = 1) {
    if (team === "blue" || team === "green") this.team[team][key] += n;
  }

  moment(text: string) {
    const m = Math.floor(this.elapsed / 60);
    const s = String(Math.floor(this.elapsed % 60)).padStart(2, "0");
    this.moments.push(`${m}:${s} ${text}`);
  }

  /** Every playing tick: hold time and how close carriers got to scoring (both potlis, D68). */
  tick(dt: number, state: GameState) {
    this.elapsed += dt;
    for (const potli of state.potlis.values()) {
      // A potli sitting scored in a goal den counts as full progress for that team.
      if (potli.scoredBy === "blue" || potli.scoredBy === "green") this.progress[potli.scoredBy] = 1;
      const carrier = state.players.get(potli.carrierId);
      if (!carrier || carrier.secretRole === "spy") continue;
      const team = carrier.realTeam as Team;
      this.add(team, "holdTime", dt / 10); // counted per 10 s
      this.p(carrier.id).holdSec += dt;
      const goal = goalCentre(team);
      const progress = Math.max(0, Math.min(1, 1 - dist(carrier, goal) / dist(MIDDLE, goal)));
      if (progress > this.progress[team]) this.progress[team] = progress;
    }
  }

  /** A carrier frozen within the last quarter of the way to the goal "fumbled the bag". */
  noteFrozenCarrier(p: PlayerState) {
    this.p(p.id).frozenCarrying++;
    if (p.secretRole === "spy") return;
    const goal = goalCentre(p.realTeam as Team);
    if (dist(p, goal) < 0.25 * dist(MIDDLE, goal)) this.fumbled.add(p.id);
  }

  /** Personal impact: used for "Ate", "NPC Energy" and the MVP tie-break. */
  impact(id: string): number {
    const s = this.p(id);
    return (
      s.freezes +
      s.snatches * 2 +
      s.grabs +
      s.holdSec / 10 +
      s.handOffs +
      s.lampUnfreezes +
      s.ices +
      s.frees +
      s.silentPasses * 2 +
      s.correctArrests * 3 -
      s.wrongArrests * 2
    );
  }

  /** End of round: finish the factors and write the summary into the state. */
  finish(state: GameState) {
    for (const p of state.players.values()) {
      if (p.secretRole !== "spy") continue;
      if (!this.caught.has(p.id)) {
        this.add(p.realTeam, "spySurvived");
        this.add(p.realTeam, "spyUntracedFreezes", this.p(p.id).ices);
      }
    }
    for (const t of ["blue", "green"] as Team[]) this.team[t].closestToGoal = Math.round(this.progress[t] * 100) / 10;

    const s = new SummaryState();
    state.summary = s;
    s.blueScore = teamScore(this.team.blue);
    s.greenScore = teamScore(this.team.green);
    s.factors = new ArraySchema<FactorRow>(
      ...FACTORS.map(
        (f) =>
          new FactorRow({
            key: f.key,
            label: f.label,
            sign: f.sign,
            blue: Math.round(this.team.blue[f.key] * 10) / 10,
            green: Math.round(this.team.green[f.key] * 10) / 10,
          }),
      ),
    );
    s.moments = new ArraySchema<string>(...this.moments.slice(-10));
    s.awardIds = new ArraySchema<string>(...this.availableAwards(state));
  }

  /** Default awards always; "settings" ones if the host left them on; situational only if they happened. */
  private availableAwards(state: GameState): string[] {
    const happened: Record<string, boolean> = {
      delulu: [...this.players.values()].some((p) => p.wrongArrests > 0),
      fumbled: this.fumbled.size > 0,
      caught4k: this.caught.size > 0,
    };
    const extras = new Set(state.extraAwards);
    return AWARDS.filter((a) => (a.set === "default" || extras.has(a.id)) && (!a.situational || happened[a.id])).map(
      (a) => a.id,
    );
  }
}
