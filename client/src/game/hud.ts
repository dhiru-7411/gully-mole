/**
 * Everything on screen that isn't the map: timer, alerts, your secret role,
 * the big smart button (D32), the role button (D42), Pass, the spy's whisper,
 * and the end-of-round screen.
 *
 * Plain HTML on top of the game canvas: crisp on every screen and easy to tap.
 * Keyboard: Space = big button, Q = role button, E = Pass, Enter = whisper (spy).
 */
import {
  CONFIG,
  ClientMsg,
  Phase,
  WHISPER_MAX_LENGTH,
  type Action,
  type ActionKind,
  type GameState,
  type PlayerState,
  type RoleAction,
  type RoleActionKind,
  type Team,
} from "@gully/shared";
import type { GameRoom } from "../net";

const LABELS: Record<ActionKind, string> = {
  unfreeze: "Unfreeze",
  tag: "Tag",
  snatch: "Snatch",
  grab: "Grab",
};

const ROLE_LABELS: Record<RoleActionKind, string> = {
  arrest: "Arrest",
  ice: "Ice",
  free: "Free",
  drag: "Drag",
  release: "Let go",
};

const names = CONFIG.teams.names as Record<string, string>;
const teamColor = (t: string) => (t === "blue" ? "#4a83ff" : "#3fd17a");
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface HudView {
  action: Action | null;
  roleAction: RoleAction | null;
  canPass: boolean;
}

export class Hud {
  private timer = $("hud-timer");
  private alert = $("hud-alert");
  private badge = $("hud-team");
  private actionBtn = $<HTMLButtonElement>("btn-action");
  private roleBtn = $<HTMLButtonElement>("btn-role");
  private passBtn = $<HTMLButtonElement>("btn-pass");
  private whisperBtn = $<HTMLButtonElement>("btn-whisper");
  private whisperBox = $("whisper-box");
  private whisperInput = $<HTMLInputElement>("whisper-input");
  private roleCard = $("role-card");
  private end = $("end-overlay");
  private endTitle = $("end-title");
  private endReason = $("end-reason");
  private endReveal = $("end-reveal");
  private backBtn = $<HTMLButtonElement>("btn-back");
  private endWait = $("end-wait");

  private current: Action | null = null;
  private currentRole: RoleAction | null = null;
  private passOk = false;
  private roleCardShown = false;

  constructor(private room: GameRoom) {
    this.actionBtn.addEventListener("pointerdown", this.pressAction);
    this.roleBtn.addEventListener("pointerdown", this.pressRole);
    this.passBtn.addEventListener("pointerdown", this.pressPass);
    this.whisperBtn.addEventListener("click", this.toggleWhisper);
    this.whisperInput.addEventListener("keydown", this.onWhisperKey);
    this.backBtn.addEventListener("click", this.pressBack);
    addEventListener("keydown", this.onKey);
    this.actionBtn.classList.remove("hidden");
    this.whisperInput.maxLength = WHISPER_MAX_LENGTH;
  }

  destroy() {
    this.actionBtn.removeEventListener("pointerdown", this.pressAction);
    this.roleBtn.removeEventListener("pointerdown", this.pressRole);
    this.passBtn.removeEventListener("pointerdown", this.pressPass);
    this.whisperBtn.removeEventListener("click", this.toggleWhisper);
    this.whisperInput.removeEventListener("keydown", this.onWhisperKey);
    this.backBtn.removeEventListener("click", this.pressBack);
    removeEventListener("keydown", this.onKey);
    for (const el of [this.end, this.alert, this.roleCard, this.whisperBox, this.whisperBtn, this.roleBtn]) {
      el.classList.add("hidden");
    }
  }

  update(view: HudView) {
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    if (!me) return;
    const team = me.team as Team;

    // Timer.
    const m = Math.floor(s.timeLeft / 60);
    const sec = String(s.timeLeft % 60).padStart(2, "0");
    this.timer.textContent = `${m}:${sec}`;
    this.timer.classList.toggle("low", s.timeLeft <= 30);

    // Team + (secret) role badge: only you see your own secret role.
    if (team) {
      this.badge.innerHTML = `<span class="dot" style="background:${teamColor(team)}"></span>`;
      this.badge.append(roleLine(me));
    }
    if (s.phase === Phase.Playing && team && !this.roleCardShown) this.showRoleCard(me);

    // Buttons.
    this.current = view.action;
    this.actionBtn.textContent = view.action ? LABELS[view.action.kind] : "·";
    this.actionBtn.disabled = !view.action;
    this.actionBtn.dataset.kind = view.action?.kind ?? "";
    this.currentRole = view.roleAction;
    this.roleBtn.classList.toggle("hidden", !view.roleAction);
    this.roleBtn.textContent = view.roleAction ? ROLE_LABELS[view.roleAction.kind] : "";
    this.roleBtn.dataset.kind = view.roleAction?.kind ?? "";
    this.passOk = view.canPass;
    this.passBtn.classList.toggle("hidden", !view.canPass);
    this.whisperBtn.classList.toggle("hidden", !(me.secretRole === "spy" && s.phase === Phase.Playing));

    this.alert.textContent = s.phase === Phase.Playing ? this.alertText(s, me, team) : "";
    this.alert.classList.toggle("hidden", this.alert.textContent === "");

    this.updateEnd(s);
  }

  /** Your private role card, once at the start of the round. */
  private showRoleCard(me: PlayerState) {
    this.roleCardShown = true;
    const team = me.team;
    const [title, body] =
      me.secretRole === "spy"
        ? [
            `You're a SPY for ${names[me.realTeam]}`,
            `You sit in ${names[team]}, but you play for ${names[me.realTeam]}. Ice your fake teammates (Q) when nobody's looking, free your real team, pass them the potli. Don't get caught!`,
          ]
        : me.secretRole === "detective"
          ? [
              `You're the DETECTIVE`,
              `A spy is hiding in ${names[team]}. Watch for iced hands and footprints, then catch them and press Arrest (Q). A wrong arrest freezes YOU.`,
            ]
          : me.role === "leader"
            ? [`You're the LEADER`, `Only your lamp unfreezes teammates. You see an arrow to the potli. Stay alive!`]
            : [`You're on ${names[team]}`, `Carry the potli into the ${names[team === "blue" ? "green" : "blue"]} den. Help your Detective find the spy among you.`];
    $("role-title").textContent = title;
    $("role-title").style.color = me.secretRole === "spy" ? teamColor(me.realTeam) : teamColor(team);
    $("role-body").textContent = body;
    this.roleCard.classList.remove("hidden");
    setTimeout(() => this.roleCard.classList.add("hidden"), 6000);
  }

  /** One short line telling you the most important thing right now. */
  private alertText(s: GameState, me: PlayerState, team: Team): string {
    if (me.freeze === "out") return "You're Out for the rest of the round.";
    if (me.freeze === "shame") {
      return me.rescueUsed
        ? "Shame-frozen. No rescues left."
        : "Shame-frozen! A teammate can drag you to a fire (once).";
    }
    if (me.frozen) {
      return me.role === "leader"
        ? `You're frozen. Your lamp thaws you in ${me.thawIn}s`
        : "You're frozen! Only your Leader's lamp can free you";
    }
    if (s.potli && s.potli.carrierId === me.id) {
      if (s.potli.snatcherId) return `Snatch! Run or pass! ${s.potli.snatchLeft.toFixed(1)}s`;
      if (me.secretRole === "spy") return `You can't score. Slip it to ${names[me.realTeam]} (Pass)`;
      return `You have the potli! Get it into the ${names[team === "blue" ? "green" : "blue"]} den`;
    }
    if (me.icedHand) return "Your hand is iced (20 s). A fireplace melts it now.";
    const myLeader = [...s.players.values()].find((p) => p.team === team && p.role === "leader");
    if (myLeader && myLeader.id !== me.id && myLeader.frozen) {
      return `Your Leader is frozen! Thaws in ${myLeader.thawIn}s. Guard them`;
    }
    return "";
  }

  private roundRevealShown = false;

  private updateEnd(s: GameState) {
    const ended = s.phase === Phase.Ended;
    this.end.classList.toggle("hidden", !ended);
    if (!ended) return;
    this.roleCard.classList.add("hidden");
    this.whisperBox.classList.add("hidden");
    if (s.winner === "draw") {
      this.endTitle.textContent = "It's a draw";
      this.endTitle.style.color = "#f1f2f6";
    } else {
      this.endTitle.textContent = `${names[s.winner]} wins!`;
      this.endTitle.style.color = teamColor(s.winner);
    }
    const loser = s.winner === "blue" ? "green" : "blue";
    this.endReason.textContent =
      s.endReason === "home"
        ? `Scored in the ${names[loser]} den.`
        : s.endReason === "wipeout"
          ? "Froze the whole other team."
          : "Time's up. (Stats decide timed-out rounds from M5.)";

    // The reveal: who were the spies and Detectives (everything is visible now).
    const players = [...s.players.values()];
    const spies = players.filter((p) => p.secretRole === "spy");
    const dets = players.filter((p) => p.secretRole === "detective");
    if (players.length && (spies.length || dets.length)) {
      const spyText = spies.map((p) => `${p.nickname} (for ${names[p.realTeam]}, sat in ${names[p.team]})`).join(", ");
      const detText = dets.map((p) => `${p.nickname} (${names[p.team]})`).join(", ");
      this.endReveal.textContent = `Spies: ${spyText || "none"}. Detectives: ${detText || "none"}.`;
      this.roundRevealShown = true;
    }
    const isHost = s.hostId === this.room.sessionId;
    this.backBtn.classList.toggle("hidden", !isHost);
    this.endWait.classList.toggle("hidden", isHost);
  }

  // ------------------------------------------------------------- input

  private pressAction = (e?: Event) => {
    e?.preventDefault();
    if (!this.current) return;
    this.room.send(ClientMsg.Action, { kind: this.current.kind, targetId: this.current.targetId });
    flash(this.actionBtn);
  };

  private pressRole = (e?: Event) => {
    e?.preventDefault();
    if (!this.currentRole) return;
    this.room.send(ClientMsg.RoleAction, { kind: this.currentRole.kind, targetId: this.currentRole.targetId });
    flash(this.roleBtn);
  };

  private pressPass = (e?: Event) => {
    e?.preventDefault();
    if (this.passOk) this.room.send(ClientMsg.Pass);
  };

  private pressBack = () => this.room.send(ClientMsg.BackToLobby);

  private toggleWhisper = () => {
    const open = this.whisperBox.classList.toggle("hidden") === false;
    if (open) this.whisperInput.focus();
  };

  private onWhisperKey = (e: KeyboardEvent) => {
    e.stopPropagation(); // typing letters mustn't move you or press buttons
    if (e.key === "Enter") {
      const text = this.whisperInput.value.trim();
      if (text) this.room.send(ClientMsg.Whisper, text);
      this.whisperInput.value = "";
      this.whisperBox.classList.add("hidden");
      this.whisperInput.blur();
    } else if (e.key === "Escape") {
      this.whisperBox.classList.add("hidden");
      this.whisperInput.blur();
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat || document.activeElement === this.whisperInput) return;
    if (e.code === "Space") {
      e.preventDefault();
      this.pressAction();
    } else if (e.key.toLowerCase() === "q") {
      this.pressRole();
    } else if (e.key.toLowerCase() === "e") {
      this.pressPass();
    } else if (e.key === "Enter" && !this.whisperBtn.classList.contains("hidden")) {
      this.toggleWhisper();
    }
  };
}

/** "Blue · Leader", "Blue · Detective", "In Blue · Spy for Green". */
function roleLine(me: PlayerState): string {
  const team = names[me.team];
  if (me.secretRole === "spy") return `In ${team} · Spy for ${names[me.realTeam]}`;
  if (me.secretRole === "detective") return `${team} · Detective`;
  if (me.role === "leader") return `${team} · Leader`;
  return team;
}

function flash(btn: HTMLElement) {
  btn.classList.add("pressed");
  setTimeout(() => btn.classList.remove("pressed"), 120);
}
