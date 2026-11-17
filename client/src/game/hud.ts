/**
 * Everything on screen that isn't the map: timer, alerts, the big smart button,
 * the Pass button (D32), and the end-of-round screen.
 *
 * These are plain HTML elements on top of the game canvas: crisp on every
 * screen and easy to tap. Keyboard: Space = big button, E = Pass.
 */
import { CONFIG, ClientMsg, Phase, type Action, type ActionKind, type GameState, type Team } from "@gully/shared";
import type { GameRoom } from "../net";

const LABELS: Record<ActionKind, string> = {
  unfreeze: "Unfreeze",
  tag: "Tag",
  snatch: "Snatch",
  grab: "Grab",
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudView {
  action: Action | null;
  canPass: boolean;
}

export class Hud {
  private timer = $("hud-timer");
  private alert = $("hud-alert");
  private badge = $("hud-team");
  private actionBtn = $<HTMLButtonElement>("btn-action");
  private passBtn = $<HTMLButtonElement>("btn-pass");
  private end = $("end-overlay");
  private endTitle = $("end-title");
  private endReason = $("end-reason");
  private backBtn = $<HTMLButtonElement>("btn-back");
  private endWait = $("end-wait");

  private current: Action | null = null;
  private passOk = false;

  constructor(private room: GameRoom) {
    this.actionBtn.addEventListener("pointerdown", this.pressAction);
    this.passBtn.addEventListener("pointerdown", this.pressPass);
    this.backBtn.addEventListener("click", this.pressBack);
    addEventListener("keydown", this.onKey);
    this.actionBtn.classList.remove("hidden");
  }

  destroy() {
    this.actionBtn.removeEventListener("pointerdown", this.pressAction);
    this.passBtn.removeEventListener("pointerdown", this.pressPass);
    this.backBtn.removeEventListener("click", this.pressBack);
    removeEventListener("keydown", this.onKey);
    this.end.classList.add("hidden");
    this.alert.classList.add("hidden");
  }

  update(view: HudView) {
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    if (!me) return;

    // Timer.
    const m = Math.floor(s.timeLeft / 60);
    const sec = String(s.timeLeft % 60).padStart(2, "0");
    this.timer.textContent = `${m}:${sec}`;
    this.timer.classList.toggle("low", s.timeLeft <= 30);

    // Team + role badge.
    const team = me.team as Team;
    if (team) {
      const role = me.role === "leader" ? " · Leader" : "";
      this.badge.innerHTML = `<span class="dot" style="background:${team === "blue" ? "#4a83ff" : "#3fd17a"}"></span>`;
      this.badge.append(`${CONFIG.teams.names[team]}${role}`);
    }

    // The big button and Pass.
    this.current = view.action;
    this.actionBtn.textContent = view.action ? LABELS[view.action.kind] : "·";
    this.actionBtn.disabled = !view.action;
    this.actionBtn.dataset.kind = view.action?.kind ?? "";
    this.passOk = view.canPass;
    this.passBtn.classList.toggle("hidden", !view.canPass);

    this.alert.textContent = this.alertText(s, me.id, team);
    this.alert.classList.toggle("hidden", this.alert.textContent === "");

    this.updateEnd(s);
  }

  /** One short line telling you the most important thing right now. */
  private alertText(s: GameState, myId: string, team: Team): string {
    const me = s.players.get(myId)!;
    if (me.frozen) {
      return me.role === "leader"
        ? `You're frozen. Your lamp thaws you in ${me.thawIn}s`
        : "You're frozen! Only your Leader's lamp can free you";
    }
    if (s.potli.carrierId === myId) {
      if (s.potli.snatcherId) return `Snatch! Run or pass! ${s.potli.snatchLeft.toFixed(1)}s`;
      const goal = CONFIG.teams.names[team === "blue" ? "green" : "blue"];
      return `You have the potli! Get it into the ${goal} den`;
    }
    const myLeader = [...s.players.values()].find((p) => p.team === team && p.role === "leader");
    if (myLeader && myLeader.id !== myId && myLeader.frozen) {
      return `Your Leader is frozen! Thaws in ${myLeader.thawIn}s. Guard them`;
    }
    return "";
  }

  private updateEnd(s: GameState) {
    const ended = s.phase === Phase.Ended;
    this.end.classList.toggle("hidden", !ended);
    if (!ended) return;
    const names = CONFIG.teams.names as Record<string, string>;
    if (s.winner === "draw") {
      this.endTitle.textContent = "It's a draw";
      this.endTitle.style.color = "#f1f2f6";
    } else {
      this.endTitle.textContent = `${names[s.winner]} wins!`;
      this.endTitle.style.color = s.winner === "blue" ? "#4a83ff" : "#3fd17a";
    }
    const loser = s.winner === "blue" ? "green" : "blue";
    this.endReason.textContent =
      s.endReason === "home"
        ? `Scored in the ${names[loser]} den.`
        : s.endReason === "wipeout"
          ? "Froze the whole other team."
          : "Time's up. (Stats decide timed-out rounds from M5.)";
    const isHost = s.hostId === this.room.sessionId;
    this.backBtn.classList.toggle("hidden", !isHost);
    this.endWait.classList.toggle("hidden", isHost);
  }

  // ------------------------------------------------------------- input

  private pressAction = (e?: Event) => {
    e?.preventDefault();
    if (!this.current) return;
    this.room.send(ClientMsg.Action, { kind: this.current.kind, targetId: this.current.targetId });
    this.actionBtn.classList.add("pressed");
    setTimeout(() => this.actionBtn.classList.remove("pressed"), 120);
  };

  private pressPass = (e?: Event) => {
    e?.preventDefault();
    if (this.passOk) this.room.send(ClientMsg.Pass);
  };

  private pressBack = () => this.room.send(ClientMsg.BackToLobby);

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.pressAction();
    } else if (e.key.toLowerCase() === "e") {
      this.pressPass();
    }
  };
}
