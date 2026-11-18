/**
 * Peer awards (GDD "Peer awards, Gen-Z roast edition").
 *
 * After the reveal, every player hands out 3–5 awards, each to an OPPONENT
 * (a player whose real team isn't theirs). Every award received is a point,
 * roasts too. Honesty bonus: when your pick matches what the stats show, you
 * get a point. The most points is the round's MVP. Awards never change which
 * team won.
 *
 * Voting closes when every connected human has voted, or when time runs out.
 * Bots vote straight away (mostly following the stats, a bit random).
 */
import { ArraySchema } from "@colyseus/schema";
import {
  AwardGiven,
  CONFIG,
  Phase,
  PointsRow,
  shuffled,
  type AwardPick,
  type GameState,
  type PlayerState,
} from "@gully/shared";
import type { RoundStats } from "./stats";

export class AwardsPhase {
  private picks = new Map<string, AwardPick[]>();
  private humans = new Set<string>();
  private secondAcc = 0;

  constructor(
    private readonly state: GameState,
    private readonly stats: RoundStats,
    private readonly random: () => number = Math.random,
  ) {}

  /** Open voting right after a round ends. */
  open(humanIds: string[]) {
    const s = this.state.summary;
    this.picks.clear();
    this.humans = new Set(humanIds);
    this.secondAcc = 0;
    s.awardsOpen = true;
    s.awardsSecondsLeft = CONFIG.awards.votingSec;
    s.voters = this.humans.size;
    s.submittedIds = new ArraySchema<string>();
    for (const p of this.state.players.values()) if (p.isBot) this.picks.set(p.id, this.botPicks(p));
    if (this.humans.size === 0) this.close();
  }

  /** A player's awards. Returns an error message, or "" if accepted. */
  submit(voterId: string, raw: unknown): string {
    const s = this.state.summary;
    const voter = this.state.players.get(voterId);
    if (this.state.phase !== Phase.Ended || !s.awardsOpen || !voter) return "Voting is closed.";
    if (this.picks.has(voterId)) return "You already handed out your awards.";
    if (!Array.isArray(raw)) return "Pick some awards.";

    const available = new Set(s.awardIds);
    const opponents = this.opponentsOf(voter);
    const min = Math.min(CONFIG.awards.minPerPlayer, available.size, opponents.length > 0 ? available.size : 0);
    const seen = new Set<string>();
    const picks: AwardPick[] = [];
    for (const item of raw) {
      const awardId = typeof item?.awardId === "string" ? item.awardId : "";
      const toId = typeof item?.toId === "string" ? item.toId : "";
      if (!available.has(awardId)) return "That award isn't on offer this round.";
      if (seen.has(awardId)) return "Each award only once.";
      if (!opponents.some((o) => o.id === toId)) return "Awards go to opponents only.";
      seen.add(awardId);
      picks.push({ awardId, toId });
    }
    if (picks.length < min) return `Give at least ${min} awards.`;
    if (picks.length > CONFIG.awards.maxPerPlayer) return `At most ${CONFIG.awards.maxPerPlayer} awards.`;

    this.picks.set(voterId, picks);
    s.submittedIds.push(voterId);
    if ([...this.humans].every((id) => this.picks.has(id) || !this.state.players.get(id)?.connected)) this.close();
    return "";
  }

  tick(dt: number) {
    const s = this.state.summary;
    if (!s.awardsOpen) return;
    this.secondAcc += dt;
    while (this.secondAcc >= 1 && s.awardsSecondsLeft > 0) {
      this.secondAcc -= 1;
      s.awardsSecondsLeft--;
    }
    if (s.awardsSecondsLeft === 0) this.close();
  }

  /** Count points, honesty bonuses and the MVP. */
  close() {
    const s = this.state.summary;
    if (!s.awardsOpen && s.results.length > 0) return;
    s.awardsOpen = false;
    const received = new Map<string, number>();
    const honesty = new Map<string, number>();
    const given: AwardGiven[] = [];

    for (const [voterId, picks] of this.picks) {
      const voter = this.state.players.get(voterId);
      if (!voter) continue;
      const opponents = this.opponentsOf(voter);
      for (const pick of picks) {
        const to = this.state.players.get(pick.toId);
        if (!to) continue;
        received.set(to.id, (received.get(to.id) ?? 0) + CONFIG.awards.pointsPerAward);
        const expected = this.expected(pick.awardId, opponents);
        if (expected.has(pick.toId)) honesty.set(voterId, (honesty.get(voterId) ?? 0) + CONFIG.awards.honestyBonus);
        given.push(
          new AwardGiven({ awardId: pick.awardId, fromId: voterId, fromName: voter.nickname, toId: to.id, toName: to.nickname }),
        );
      }
    }

    const rows = [...this.state.players.values()].map(
      (p) =>
        new PointsRow({
          id: p.id,
          name: p.nickname,
          team: p.realTeam,
          received: received.get(p.id) ?? 0,
          honesty: honesty.get(p.id) ?? 0,
          total: (received.get(p.id) ?? 0) + (honesty.get(p.id) ?? 0),
        }),
    );
    rows.sort((a, b) => b.total - a.total || this.stats.impact(b.id) - this.stats.impact(a.id));
    s.results = new ArraySchema<AwardGiven>(...given);
    s.points = new ArraySchema<PointsRow>(...rows);
    if (rows[0] && rows[0].total > 0) {
      s.mvpId = rows[0].id;
      s.mvpName = rows[0].name;
    }
  }

  reset() {
    this.picks.clear();
    this.humans.clear();
  }

  // ------------------------------------------------------------ helpers

  private opponentsOf(voter: PlayerState): PlayerState[] {
    return [...this.state.players.values()].filter((p) => p.realTeam && p.realTeam !== voter.realTeam);
  }

  /**
   * Who the stats say deserves an award (for the honesty bonus). Awards about
   * vibes (Lowkey Carried, Ice Cold Rizz, Sus) have no stat, so no bonus.
   */
  private expected(awardId: string, among: PlayerState[]): Set<string> {
    const st = this.stats;
    const ids = among.map((p) => p.id);
    const top = (score: (id: string) => number, lowest = false) => {
      if (!ids.length) return new Set<string>();
      const vals = ids.map(score);
      const best = lowest ? Math.min(...vals) : Math.max(...vals);
      return new Set(ids.filter((_, i) => vals[i] === best));
    };
    switch (awardId) {
      case "ate":
        return top((id) => st.impact(id));
      case "npc":
        return top((id) => st.impact(id), true);
      case "delulu":
        return new Set(ids.filter((id) => st.p(id).wrongArrests > 0));
      case "fumbled":
        return new Set(ids.filter((id) => st.fumbled.has(id)));
      case "caught4k":
        return new Set(ids.filter((id) => st.caught.has(id)));
      case "maincharacter": {
        const frozenCarriers = ids.filter((id) => st.p(id).frozenCarrying > 0);
        if (!frozenCarriers.length) return top((id) => st.p(id).holdSec);
        const best = Math.max(...frozenCarriers.map((id) => st.p(id).holdSec));
        return new Set(frozenCarriers.filter((id) => st.p(id).holdSec === best));
      }
      case "yapper": {
        const most = Math.max(0, ...ids.map((id) => st.p(id).chats));
        return most > 0 ? new Set(ids.filter((id) => st.p(id).chats === most)) : new Set();
      }
      default:
        return new Set();
    }
  }

  /** Bots: 3–4 awards, usually to whoever the stats point at. */
  private botPicks(bot: PlayerState): AwardPick[] {
    const opponents = this.opponentsOf(bot);
    if (!opponents.length) return [];
    const ids = shuffled([...this.state.summary.awardIds], this.random);
    const n = Math.min(ids.length, 3 + (this.random() < 0.5 ? 1 : 0));
    return ids.slice(0, n).map((awardId) => {
      const expected = [...this.expected(awardId, opponents)];
      const toId =
        expected.length && this.random() < 0.6
          ? expected[Math.floor(this.random() * expected.length)]
          : opponents[Math.floor(this.random() * opponents.length)].id;
      return { awardId, toId };
    });
  }
}
