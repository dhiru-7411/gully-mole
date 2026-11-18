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
  MAP,
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
import { clearHuddleLog } from "./feed";
import { EndScreen } from "./endScreen";

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

  private backBtn = $<HTMLButtonElement>("btn-back");
  private endWait = $("end-wait");

  private huddleBtn = $<HTMLButtonElement>("btn-huddle");
  private quickBar = $("quick-bar");
  private huddleOverlay = $("huddle-overlay");
  private huddleForm = $<HTMLFormElement>("huddle-form");
  private huddleInput = $<HTMLInputElement>("huddle-input");
  private endHuddleBtn = $<HTMLButtonElement>("btn-end-huddle");

  private current: Action | null = null;
  private currentRole: RoleAction | null = null;
  private passOk = false;
  private roleCardShown = false;
  private wasHuddle = false;

  constructor(private room: GameRoom) {
    // Quick messages: one small "Say…" button that opens the 4 lines, so they
    // don't cover the map. Keys 1–4 send straight away without opening it.
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "quick-toggle";
    toggle.textContent = "Say…";
    const chips = document.createElement("div");
    chips.className = "quick-chips hidden";
    chips.append(
      ...CONFIG.quickMessages.map((text, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.innerHTML = `<kbd>${i + 1}</kbd>`;
        b.append(text);
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          this.sendQuick(i);
          chips.classList.add("hidden");
        });
        return b;
      }),
    );
    toggle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      chips.classList.toggle("hidden");
    });
    this.quickBar.replaceChildren(chips, toggle);
    this.huddleBtn.addEventListener("click", this.callHuddle);
    this.endHuddleBtn.addEventListener("click", this.endHuddle);
    this.huddleForm.addEventListener("submit", this.sendHuddleChat);
    this.huddleInput.maxLength = CONFIG.huddle.chatMaxLength;
    this.huddleInput.addEventListener("keydown", (e) => e.stopPropagation()); // typing doesn't move you

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
    this.endScreen.destroy();
    removeEventListener("keydown", this.onKey);
    this.huddleBtn.removeEventListener("click", this.callHuddle);
    this.endHuddleBtn.removeEventListener("click", this.endHuddle);
    this.huddleForm.removeEventListener("submit", this.sendHuddleChat);
    const all = [this.end, this.alert, this.roleCard, this.whisperBox, this.whisperBtn, this.roleBtn];
    for (const el of [...all, this.huddleBtn, this.quickBar, this.huddleOverlay]) el.classList.add("hidden");
  }

  /** Huddle button, quick chips and the huddle screen. */
  private updateComms(s: GameState, me: PlayerState) {
    const playing = s.phase === Phase.Playing;
    const huddle = playing && !!s.huddle?.active;

    // Leader's huddle button: "Huddle (2)", disabled while frozen or none left.
    const left = me.team === "blue" ? s.huddlesLeftBlue : s.huddlesLeftGreen;
    this.huddleBtn.classList.toggle("hidden", !(playing && !huddle && me.role === "leader"));
    this.huddleBtn.textContent = `Huddle (${left})`;
    this.huddleBtn.disabled = me.frozen || left === 0;

    this.quickBar.classList.toggle("hidden", !playing || huddle);

    // The huddle screen.
    this.huddleOverlay.classList.toggle("hidden", !huddle);
    if (huddle) {
      if (!this.wasHuddle) {
        clearHuddleLog();
        this.roleCard.classList.add("hidden");
        if (!matchMedia("(pointer: coarse)").matches) this.huddleInput.focus();
      }
      const h = s.huddle;
      $("huddle-title").textContent = `Huddle, called by ${h.callerName} (${names[h.callerTeam]})`;
      const m = Math.floor(h.secondsLeft / 60);
      $("huddle-time").textContent = `${m}:${String(h.secondsLeft % 60).padStart(2, "0")}`;
      this.endHuddleBtn.classList.toggle("hidden", h.callerId !== me.id);
    } else if (this.wasHuddle) {
      this.huddleInput.blur();
    }
    this.wasHuddle = huddle;
  }

  private callHuddle = () => this.room.send(ClientMsg.CallHuddle);
  private endHuddle = () => this.room.send(ClientMsg.EndHuddle);
  private sendHuddleChat = (e: Event) => {
    e.preventDefault();
    const text = this.huddleInput.value.trim();
    if (text) this.room.send(ClientMsg.HuddleChat, text);
    this.huddleInput.value = "";
  };
  private sendQuick = (i: number) => this.room.send(ClientMsg.QuickMessage, i);

  update(view: HudView) {
    const s = this.room.state;
    const me = s.players.get(this.room.sessionId);
    if (!me) return;
    const team = me.team as Team;

    // Timer.
    const m = Math.floor(s.timeLeft / 60);
    const sec = String(s.timeLeft % 60).padStart(2, "0");
    // Score either side of the clock (D68): potlis each team has in its goal den, out of 2.
    const total = MAP.potliStarts.length; // not s.potlis.size: you only receive the ones you can see
    const score = `${s.scoredBlue}/${total}|${m}:${sec}|${s.scoredGreen}/${total}`;
    if (this.timer.dataset.score !== score) {
      this.timer.dataset.score = score;
      this.timer.innerHTML =
        `<span class="score blue">${s.scoredBlue}/${total}</span>` +
        `<span class="clock">${m}:${sec}</span>` +
        `<span class="score green">${s.scoredGreen}/${total}</span>`;
    }
    this.timer.classList.toggle("low", s.timeLeft <= 30);

    // Team + (secret) role badge: only you see your own secret role.
    if (team) {
      this.badge.innerHTML = `<span class="dot" style="background:${teamColor(team)}"></span>`;
      this.badge.append(roleLine(me));
    }
    if (s.phase === Phase.Playing && team && !this.roleCardShown) this.showRoleCard(me);

    // Buttons.
    this.current = view.action;
    // D63: while your tag cooldown runs and nothing else is possible, show "Tag 7".
    const cooling = !view.action && me.tagCooldown > 0 && !me.frozen;
    this.actionBtn.textContent = view.action ? LABELS[view.action.kind] : cooling ? `Tag ${me.tagCooldown}` : "·";
    this.actionBtn.disabled = !view.action;
    this.actionBtn.dataset.kind = view.action?.kind ?? "";
    this.currentRole = view.roleAction;
    this.roleBtn.classList.toggle("hidden", !view.roleAction);
    this.roleBtn.textContent = view.roleAction ? ROLE_LABELS[view.roleAction.kind] : "";
    this.roleBtn.dataset.kind = view.roleAction?.kind ?? "";
    this.passOk = view.canPass;
    this.passBtn.classList.toggle("hidden", !view.canPass);
    this.whisperBtn.classList.toggle("hidden", !(me.secretRole === "spy" && s.phase === Phase.Playing));

    this.alert.textContent = s.phase === Phase.Playing && !s.huddle?.active ? this.alertText(s, me, team) : "";
    this.alert.classList.toggle("hidden", this.alert.textContent === "");

    this.updateComms(s, me);
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
            `You sit in ${names[team]}, but you play for ${names[me.realTeam]}. Ice your fake teammates (Q) when nobody's looking, free your real team, pass them the potlis. Don't get caught!`,
          ]
        : me.secretRole === "detective"
          ? [
              `You're the DETECTIVE`,
              `A spy is hiding in ${names[team]}. Watch for iced hands and footprints, then catch them and press Arrest (Q). A wrong arrest freezes YOU.`,
            ]
          : me.role === "leader"
            ? [`You're the LEADER`, `Only your lamp unfreezes teammates. You see arrows to both potlis. Stay alive!`]
            : [`You're on ${names[team]}`, `Get BOTH potlis into the ${names[team === "blue" ? "green" : "blue"]} den to win. In their den, you can tag them! Help your Detective find the spy.`];
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
    const mine = s.potlis ? [...s.potlis.values()].find((p) => p.carrierId === me.id) : undefined;
    if (mine) {
      if (mine.snatcherId) return `Snatch! Run or pass! ${mine.snatchLeft.toFixed(1)}s`;
      if (me.secretRole === "spy") return `You can't score. Slip it to ${names[me.realTeam]} (Pass)`;
      return `You have a potli! Drop it in the ${names[team === "blue" ? "green" : "blue"]} den`;
    }
    if (me.icedHand) return "Your hand is iced (20 s). A fireplace melts it now.";
    const myLeader = [...s.players.values()].find((p) => p.team === team && p.role === "leader");
    if (myLeader && myLeader.id !== me.id && myLeader.frozen) {
      return `Your Leader is frozen! Thaws in ${myLeader.thawIn}s. Guard them`;
    }
    return "";
  }

  private endScreen = new EndScreen(this.room);

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
          : "Time's up: the better stats score wins.";

    // The reveal, awards and results (endScreen.ts).
    const me = s.players.get(this.room.sessionId);
    if (me) this.endScreen.update(s, me);

    // The host can move on once voting is over (or skip it).
    const isHost = s.hostId === this.room.sessionId;
    this.backBtn.classList.toggle("hidden", !isHost);
    this.backBtn.textContent = s.summary?.awardsOpen ? "Skip awards, back to lobby" : "Back to lobby";
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
    if (e.repeat || document.activeElement instanceof HTMLInputElement) return; // typing somewhere
    const s = this.room.state;
    if (s.huddle?.active) return; // paused
    const k = e.key.toLowerCase();
    if (k >= "1" && k <= String(CONFIG.quickMessages.length)) {
      this.sendQuick(Number(k) - 1);
      return;
    }
    if (k === "h" && !this.huddleBtn.classList.contains("hidden") && !this.huddleBtn.disabled) {
      this.callHuddle();
      return;
    }
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
