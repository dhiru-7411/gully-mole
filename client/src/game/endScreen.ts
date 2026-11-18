/**
 * The end-of-round screen (M5), in three stages:
 *  1. The reveal: winner, team scores, the stats table, spies + Detectives, key moments.
 *  2. Awards: pick 3–5 awards for opponents (while voting is open).
 *  3. Results: MVP, who gave what to whom, points.
 *
 * Plain HTML. Parts are only rebuilt when their data changes, so your award
 * picks aren't wiped while you're choosing.
 */
import { AWARDS, CONFIG, ClientMsg, awardById, type GameState, type PlayerState } from "@gully/shared";
import type { GameRoom } from "../net";

const names = CONFIG.teams.names as Record<string, string>;
const teamColor = (t: string) => (t === "blue" ? "#4a83ff" : t === "green" ? "#3fd17a" : "#f1f2f6");
/** Scores travel as 32-bit floats (13.19999…): show one decimal, no trailing ".0". */
const fmt = (n: number) => String(Math.round(n * 10) / 10);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text; // textContent: names can't inject HTML
  if (cls) e.className = cls;
  return e;
}

export class EndScreen {
  private revealKey = "";
  private awardsKey = "";
  private resultsKey = "";
  private picks = new Map<string, string>(); // awardId -> toId
  private submitted = false;

  constructor(private room: GameRoom) {
    $("btn-submit-awards").addEventListener("click", this.submit);
  }

  destroy() {
    $("btn-submit-awards").removeEventListener("click", this.submit);
  }

  update(s: GameState, me: PlayerState) {
    const sum = s.summary;
    if (!sum) return;
    this.renderReveal(s);

    // 2. Awards (only while voting is open, and until I've voted).
    const iVoted = this.submitted || sum.submittedIds.includes(me.id);
    const voting = sum.awardsOpen && !iVoted;
    $("awards-panel").classList.toggle("hidden", !voting);
    if (voting) this.renderAwards(s, me);
    $("awards-time").textContent = sum.awardsOpen ? `${sum.awardsSecondsLeft}s` : "";

    const status = $("awards-status");
    status.classList.toggle("hidden", !(sum.awardsOpen && iVoted));
    status.textContent = `Awards handed out. Waiting for the others (${sum.submittedIds.length}/${sum.voters})… ${sum.awardsSecondsLeft}s`;

    // 3. Results.
    const done = !sum.awardsOpen && sum.points.length > 0;
    $("awards-results").classList.toggle("hidden", !done);
    if (done) this.renderResults(s);
  }

  // --------------------------------------------------------------- 1. reveal

  private renderReveal(s: GameState) {
    const sum = s.summary;
    const key = `${s.winner}|${sum.blueScore}|${sum.greenScore}|${sum.moments.length}|${s.players.size}`;
    if (key === this.revealKey) return;
    this.revealKey = key;

    // Scores: "Blue 7.5 : 4 Green".
    const scores = $("end-scores");
    scores.replaceChildren();
    for (const [team, score] of [["blue", sum.blueScore], ["green", sum.greenScore]] as const) {
      const box = el("div", undefined, "score-box");
      box.style.borderColor = teamColor(team);
      box.append(el("span", names[team], "score-team"), el("strong", fmt(score), "score-num"));
      scores.append(box);
    }

    // Stats table.
    const table = $("end-stats");
    table.replaceChildren();
    const head = el("tr");
    head.append(el("th", ""), el("th", names.blue), el("th", names.green));
    table.append(head);
    for (const f of sum.factors) {
      const tr = el("tr");
      tr.append(el("td", `${f.sign < 0 ? "− " : ""}${f.label}`), el("td", fmt(f.blue)), el("td", fmt(f.green)));
      table.append(tr);
    }

    // Spies and Detectives (everything is visible after the round).
    const players = [...s.players.values()];
    const spies = players.filter((p) => p.secretRole === "spy");
    const dets = players.filter((p) => p.secretRole === "detective");
    const spyText = spies.map((p) => `${p.nickname} (for ${names[p.realTeam]}, sat in ${names[p.team]})`).join(", ");
    const detText = dets.map((p) => `${p.nickname} (${names[p.team]})`).join(", ");
    $("end-reveal").textContent = players.length ? `Spies: ${spyText || "none"}. Detectives: ${detText || "none"}.` : "";

    $("end-moments").replaceChildren(...[...sum.moments].map((m) => el("li", m)));
  }

  // --------------------------------------------------------------- 2. awards

  private renderAwards(s: GameState, me: PlayerState) {
    const sum = s.summary;
    const opponents = [...s.players.values()].filter((p) => p.realTeam && p.realTeam !== me.realTeam);
    const key = `${[...sum.awardIds].join(",")}|${opponents.map((o) => o.id).join(",")}`;
    if (key === this.awardsKey) return;
    this.awardsKey = key;
    this.picks.clear();

    const list = $("awards-list");
    list.replaceChildren();
    for (const id of sum.awardIds) {
      const def = awardById(id);
      if (!def) continue;
      const row = el("label", undefined, "award-row");
      const text = el("span", undefined, "award-text");
      text.append(el("strong", def.name), el("small", def.goesTo));
      const select = el("select");
      select.append(new Option("—", ""));
      for (const o of opponents) select.append(new Option(o.nickname, o.id));
      select.addEventListener("change", () => {
        if (select.value) this.picks.set(id, select.value);
        else this.picks.delete(id);
        this.refreshSubmit();
      });
      row.append(text, select);
      list.append(row);
    }
    this.refreshSubmit();
  }

  private minPicks() {
    return Math.min(CONFIG.awards.minPerPlayer, this.room.state.summary.awardIds.length);
  }

  private refreshSubmit() {
    const n = this.picks.size;
    const btn = $<HTMLButtonElement>("btn-submit-awards");
    btn.disabled = n < this.minPicks() || n > CONFIG.awards.maxPerPlayer;
    btn.textContent =
      n > CONFIG.awards.maxPerPlayer
        ? `Too many (max ${CONFIG.awards.maxPerPlayer})`
        : `Hand out awards (${n}/${this.minPicks()}–${CONFIG.awards.maxPerPlayer})`;
  }

  private submit = () => {
    const picks = [...this.picks].map(([awardId, toId]) => ({ awardId, toId }));
    this.room.send(ClientMsg.SubmitAwards, picks);
    this.submitted = true;
  };

  // -------------------------------------------------------------- 3. results

  private renderResults(s: GameState) {
    const sum = s.summary;
    const key = `${sum.mvpId}|${sum.results.length}|${sum.points.length}`;
    if (key === this.resultsKey) return;
    this.resultsKey = key;

    const box = $("awards-results");
    box.replaceChildren();
    if (sum.mvpName) {
      const mvp = el("div", undefined, "mvp");
      const row = sum.points.find((p) => p.id === sum.mvpId);
      mvp.append(el("span", "MVP", "mvp-tag"), el("strong", sum.mvpName));
      if (row) mvp.append(el("small", `${row.total} pts (${row.received} from awards + ${row.honesty} honesty)`));
      box.append(mvp);
    }

    // Awards grouped by award.
    const byAward = el("div", undefined, "award-results");
    for (const def of AWARDS) {
      const got = [...sum.results].filter((r) => r.awardId === def.id);
      if (!got.length) continue;
      const counts = new Map<string, number>();
      for (const r of got) counts.set(r.toName, (counts.get(r.toName) ?? 0) + 1);
      const line = el("div", undefined, "award-result");
      line.append(
        el("strong", def.name),
        el("span", [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(", ")),
      );
      byAward.append(line);
    }
    box.append(byAward);

    // Points table (top 6).
    const table = el("table", undefined, "end-stats");
    const head = el("tr");
    head.append(el("th", "Player"), el("th", "Awards"), el("th", "Honesty"), el("th", "Total"));
    table.append(head);
    for (const p of [...sum.points].slice(0, 6)) {
      const tr = el("tr");
      const name = el("td", p.name);
      name.style.color = teamColor(p.team);
      tr.append(name, el("td", String(p.received)), el("td", String(p.honesty)), el("td", String(p.total)));
      table.append(tr);
    }
    box.append(table);
  }
}
