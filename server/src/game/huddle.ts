/**
 * Huddles (GDD "Communication"): only a Leader can call one, 2 per round, never
 * while frozen. The whole game and the round timer pause, and each team gets
 * its own chat for ~2.5 minutes (D8: both teams chat at once). The Leader who
 * called it can end it early.
 *
 * The spy sits in the fake team's huddle and hears everything: chat goes to
 * everyone SITTING in a team, which includes the spy hiding there.
 *
 * Bots say a line or two so a solo tester has someone to talk to.
 */
import { CONFIG, Phase, SecretRole, type GameState, type PlayerState } from "@gully/shared";

export interface ChatLine {
  /** Everyone sitting in this team receives it. */
  team: string;
  fromId: string;
  from: string;
  text: string;
}

const BOT_LINES = [
  "Who froze my teammate? Speak up.",
  "I saw someone near the fire...",
  "Stay together this time.",
  "Guard the Leader!",
  "{name} was acting sus.",
  "I was in the middle the whole time.",
  "Let's rush the potli together.",
];
const SPY_LINES = [
  "Trust me bro.",
  "I was guarding the potli the whole time.",
  "{name} was near the fire, not me.",
  "Our Detective should arrest {name}.",
];

export class Huddles {
  /** Chat lines bots want to say (the room delivers them). */
  outbox: ChatLine[] = [];

  private secondAcc = 0;
  private elapsed = 0;
  /** Bot id -> seconds into the huddle when it will talk. */
  private botTalk = new Map<string, number[]>();

  constructor(
    private readonly state: GameState,
    private readonly random: () => number = Math.random,
  ) {}

  /** New round: each team's Leader gets their huddles back. */
  reset() {
    const s = this.state;
    s.huddlesLeftBlue = CONFIG.huddle.perRound;
    s.huddlesLeftGreen = CONFIG.huddle.perRound;
    this.close();
  }

  get active() {
    return this.state.huddle.active;
  }

  /** Can this player call a huddle right now? (GDD: Leader, not frozen, some left.) */
  canCall(p: PlayerState | undefined): boolean {
    const s = this.state;
    return (
      !!p &&
      s.phase === Phase.Playing &&
      !s.huddle.active &&
      p.role === "leader" &&
      !p.frozen &&
      this.left(p.team) > 0
    );
  }

  call(playerId: string): boolean {
    const s = this.state;
    const p = s.players.get(playerId);
    if (!this.canCall(p)) return false;
    if (p!.team === "blue") s.huddlesLeftBlue--;
    else s.huddlesLeftGreen--;

    Object.assign(s.huddle, {
      active: true,
      callerId: p!.id,
      callerName: p!.nickname,
      callerTeam: p!.team,
      secondsLeft: CONFIG.huddle.durationSec,
    });
    this.secondAcc = 0;
    this.elapsed = 0;
    this.planBotChatter();
    return true;
  }

  /** Only the Leader who called it can end it early. */
  end(playerId: string): boolean {
    if (!this.state.huddle.active || this.state.huddle.callerId !== playerId) return false;
    this.close();
    return true;
  }

  /** Called every server tick while the game is paused. */
  tick(dt: number) {
    const h = this.state.huddle;
    if (!h.active) return;
    this.elapsed += dt;
    this.secondAcc += dt;
    while (this.secondAcc >= 1 && h.secondsLeft > 0) {
      this.secondAcc -= 1;
      h.secondsLeft--;
    }
    this.botChatter();
    if (h.secondsLeft === 0) this.close();
  }

  close() {
    Object.assign(this.state.huddle, { active: false, callerId: "", callerName: "", callerTeam: "", secondsLeft: 0 });
    this.botTalk.clear();
  }

  private left(team: string) {
    return team === "blue" ? this.state.huddlesLeftBlue : this.state.huddlesLeftGreen;
  }

  /** Each bot talks 0–2 times, somewhere in the first minute. */
  private planBotChatter() {
    this.botTalk.clear();
    for (const p of this.state.players.values()) {
      if (!p.isBot) continue;
      const n = Math.floor(this.random() * 3);
      const times = Array.from({ length: n }, () => 3 + this.random() * 55).sort((a, b) => a - b);
      if (times.length) this.botTalk.set(p.id, times);
    }
  }

  private botChatter() {
    for (const [id, times] of this.botTalk) {
      if (!times.length || times[0] > this.elapsed) continue;
      times.shift();
      const bot = this.state.players.get(id);
      if (!bot) continue;
      const lines = bot.secretRole === SecretRole.Spy ? SPY_LINES : BOT_LINES;
      const mates = [...this.state.players.values()].filter((p) => p.team === bot.team && p.id !== bot.id);
      const someone = mates[Math.floor(this.random() * mates.length)]?.nickname ?? "someone";
      const text = lines[Math.floor(this.random() * lines.length)].replace("{name}", someone);
      this.outbox.push({ team: bot.team, fromId: bot.id, from: bot.nickname, text });
    }
  }
}
