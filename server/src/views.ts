/**
 * PRIVACY: decides, every tick, exactly what each player's device receives
 * (Colyseus StateView, see shared/src/schema.ts).
 *
 * During a round, a client gets:
 *  - players: yourself + anyone you can SEE (vision circle, walls block),
 *    plus your own Leader while frozen (GDD: arrow to the frozen Leader);
 *  - secret role / real team (TAG.SECRET) of: yourself, your team's Detective,
 *    and (if you're on a team that planted a spy) your planted spy;
 *  - the iced hand (TAG.NEAR): only for players standing close to you;
 *  - the potli: if you can see it, or you're the Leader (GDD: arrow to it);
 *  - footprints: the ones you can see.
 * In the lobby everyone sees everyone (no secrets yet). After a round,
 * everything is revealed.
 *
 * Only changes are applied (add/remove), so this is cheap to run every tick.
 */
import type { Client } from "colyseus";
import { StateView } from "@colyseus/schema";
import {
  CONFIG,
  Phase,
  SecretRole,
  TAG,
  canSee,
  dist,
  type GameState,
  type PlayerState,
} from "@gully/shared";

interface Seen {
  players: Set<string>;
  secret: Set<string>;
  near: Set<string>;
  prints: Set<string>;
  potli: boolean;
}

export class ViewSync {
  private seen = new Map<string, Seen>();

  constructor(private readonly state: GameState) {}

  /** Give a (re)joining client a fresh, empty view. */
  attach(client: Client) {
    client.view?.dispose();
    client.view = new StateView();
    this.seen.set(client.sessionId, {
      players: new Set(),
      secret: new Set(),
      near: new Set(),
      prints: new Set(),
      potli: false,
    });
  }

  detach(client: Client) {
    client.view?.dispose();
    this.seen.delete(client.sessionId);
  }

  /** Bring every client's view up to date. */
  update(clients: Iterable<Client>) {
    for (const client of clients) {
      if (!client.view) continue;
      const seen = this.seen.get(client.sessionId);
      if (!seen) continue;
      this.updateOne(client.view, client.sessionId, seen);
    }
  }

  private updateOne(view: StateView, viewerId: string, seen: Seen) {
    const s = this.state;
    const me = s.players.get(viewerId);
    const reveal = s.phase !== Phase.Playing; // lobby + after a round: show everything
    const endReveal = s.phase === Phase.Ended;

    const wantPlayers = new Set<string>();
    const wantSecret = new Set<string>();
    const wantNear = new Set<string>();
    for (const [id, p] of s.players) {
      const visible = reveal || !me || id === viewerId || canSee(me, p) || this.isMyFrozenLeader(me, p);
      if (!visible) continue;
      wantPlayers.add(id);
      if (endReveal || (me && this.mayKnowSecret(me, p))) wantSecret.add(id);
      if (reveal || id === viewerId || (me && dist(me, p) <= CONFIG.vision.nearRadius)) wantNear.add(id);
    }

    // Players (default fields) first, then their tags.
    this.diff(seen.players, wantPlayers, (id) => {
      const p = s.players.get(id);
      if (p) view.add(p);
    }, (id) => {
      const p = s.players.get(id);
      if (p) view.remove(p);
      seen.secret.delete(id);
      seen.near.delete(id);
    });
    this.diff(seen.secret, wantSecret, (id) => view.add(s.players.get(id)!, TAG.SECRET), (id) => {
      const p = s.players.get(id);
      if (p && seen.players.has(id)) view.remove(p, TAG.SECRET);
    });
    this.diff(seen.near, wantNear, (id) => view.add(s.players.get(id)!, TAG.NEAR), (id) => {
      const p = s.players.get(id);
      if (p && seen.players.has(id)) view.remove(p, TAG.NEAR);
    });

    // The potli.
    const carrier = s.players.get(s.potli.carrierId);
    const potliVisible =
      reveal ||
      !me ||
      me.role === "leader" ||
      s.potli.carrierId === viewerId ||
      (carrier ? wantPlayers.has(carrier.id) : canSee(me, s.potli));
    if (potliVisible !== seen.potli) {
      if (potliVisible) view.add(s.potli);
      else view.remove(s.potli);
      seen.potli = potliVisible;
    }

    // Footprints.
    const wantPrints = new Set<string>();
    if (!reveal && me) {
      for (const [fid, f] of s.footprints) if (canSee(me, f)) wantPrints.add(fid);
    }
    this.diff(seen.prints, wantPrints, (fid) => {
      const f = s.footprints.get(fid);
      if (f) view.add(f);
    }, (fid) => {
      const f = s.footprints.get(fid);
      if (f) view.remove(f);
    });
  }

  /** GDD: teammates get an arrow to their Leader while the Leader is frozen. */
  private isMyFrozenLeader(me: PlayerState, p: PlayerState) {
    return p.role === "leader" && p.frozen && p.team === me.team;
  }

  /**
   * Who may know p's secret role and real team:
   * - p themself;
   * - p's team (incl. the spy hiding in it) know who their Detective is;
   * - the team that planted a spy knows their spy.
   */
  private mayKnowSecret(me: PlayerState, p: PlayerState) {
    if (me.id === p.id) return true;
    if (p.secretRole === SecretRole.Detective) return me.team === p.team;
    if (p.secretRole === SecretRole.Spy) return me.realTeam === p.realTeam;
    return false;
  }

  /** Apply the difference between what was shown and what should be shown. */
  private diff(have: Set<string>, want: Set<string>, add: (id: string) => void, remove: (id: string) => void) {
    for (const id of have) {
      if (!want.has(id)) {
        remove(id);
        have.delete(id);
      }
    }
    for (const id of want) {
      if (!have.has(id)) {
        add(id);
        have.add(id);
      }
    }
  }
}
