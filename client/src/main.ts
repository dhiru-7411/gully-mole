/**
 * Client entry: home screen -> lobby -> game.
 *
 * The lobby simply re-renders from the server state whenever it changes. With
 * at most 20 players that's instant and much simpler than patching the DOM.
 */
import {
  CONFIG,
  ClientMsg,
  Phase,
  ServerEvent,
  ServerMsg,
  cleanNickname,
  isValidRoomCode,
  type FrozenPingPayload,
  type HuddleChatPayload,
  type QuickMessagePayload,
  type WhisperPayload,
} from "@gully/shared";
import { createRoom, forget, friendlyError, joinRoom, tryReconnect, type GameRoom } from "./net";
import { startGame } from "./game/GameScene";
import { addBubble, addHuddleLine, addPing, clearFeed, pushFeed } from "./game/feed";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  home: $("screen-home"),
  lobby: $("screen-lobby"),
  game: $("game"),
  nickname: $<HTMLInputElement>("nickname"),
  code: $<HTMLInputElement>("code"),
  btnCreate: $<HTMLButtonElement>("btn-create"),
  btnJoin: $<HTMLButtonElement>("btn-join"),
  roomCode: $<HTMLButtonElement>("room-code"),
  copyHint: $("copy-hint"),
  playerCount: $("player-count"),
  minPlayers: $("min-players"),
  playerList: $("player-list"),
  hostControls: $("host-controls"),
  botControls: $("bot-controls"),
  btnAddBot: $<HTMLButtonElement>("btn-add-bot"),
  btnFillBots: $<HTMLButtonElement>("btn-fill-bots"),
  btnStart: $<HTMLButtonElement>("btn-start"),
  waitingHost: $("waiting-host"),
  btnLeave: $<HTMLButtonElement>("btn-leave"),
  toast: $("toast"),
};

let room: GameRoom | null = null;
let game: import("phaser").Game | null = null;

// ------------------------------------------------------------------ home

const NICK_KEY = "gully.nickname";
ui.nickname.value = safeLocalGet(NICK_KEY) ?? "";
ui.minPlayers.textContent = String(CONFIG.lobby.minPlayers);

// Invite links look like ?code=4821 — prefill the join box.
const inviteCode = new URLSearchParams(location.search).get("code");
if (isValidRoomCode(inviteCode)) ui.code.value = inviteCode;

ui.code.addEventListener("input", () => {
  ui.code.value = ui.code.value.replace(/\D/g, "").slice(0, 4);
});

ui.btnCreate.addEventListener("click", () => enter(() => createRoom({ nickname: readNickname()! })));
ui.btnJoin.addEventListener("click", () => {
  const code = ui.code.value.trim();
  if (!isValidRoomCode(code)) return toast("Enter the 4-digit room code.");
  enter(() => joinRoom(code, { nickname: readNickname()! }));
});
ui.code.addEventListener("keydown", (e) => { if (e.key === "Enter") ui.btnJoin.click(); });

function readNickname(): string | null {
  const nick = cleanNickname(ui.nickname.value);
  if (nick) safeLocalSet(NICK_KEY, nick);
  return nick;
}

async function enter(connect: () => Promise<GameRoom>) {
  if (!readNickname()) {
    ui.nickname.focus();
    return toast("Pick a nickname first.");
  }
  setBusy(true);
  try {
    attach(await connect());
  } catch (err) {
    toast(friendlyError(err));
  } finally {
    setBusy(false);
  }
}

function setBusy(busy: boolean) {
  ui.btnCreate.disabled = busy;
  ui.btnJoin.disabled = busy;
}

// ----------------------------------------------------------------- lobby

function attach(r: GameRoom) {
  room = r;
  // Dev only: lets you poke at the room from the browser console (window.__gully.room.state).
  if (import.meta.env.DEV) (window as any).__gully = { room: r };
  const keep = new URLSearchParams(location.search).has("overview") ? "&overview" : "";
  history.replaceState(null, "", `?code=${r.roomId}${keep}`);

  r.onStateChange(() => render());
  r.onMessage(ServerMsg.Notice, (text: string) => toast(text));
  // M3: what the server tells only some of us.
  r.onMessage(ServerEvent.Announce, (text: string) => pushFeed(text, "announce"));
  r.onMessage(ServerEvent.Whisper, (m: WhisperPayload) => pushFeed(`Mole ${m.from}: ${m.text}`, "whisper"));
  r.onMessage(ServerEvent.FrozenPing, (m: FrozenPingPayload) => {
    pushFeed(`${m.name} was just frozen. Follow the white arrow!`, "ping");
    addPing(m.x, m.y);
  });
  // M4: huddle chat and one-tap messages (the server only sends us our own team's).
  r.onMessage(ServerEvent.HuddleChat, (m: HuddleChatPayload) => addHuddleLine(m.from, m.text, m.fromId === r.sessionId));
  r.onMessage(ServerEvent.QuickMessage, (m: QuickMessagePayload) => {
    const text = CONFIG.quickMessages[m.index] ?? "";
    pushFeed(`${m.from}: ${text}`, "quick");
    addBubble(m.fromId, text);
  });
  r.onLeave(() => {
    room = null;
    forget();
    if (game) location.href = location.pathname; // simplest clean reset
    else show("home");
  });
  render();
}

function render() {
  if (!room) return;
  const s = room.state;

  // A round is on (or just ended and showing the result): the game screen.
  if (s.phase === Phase.Playing || s.phase === Phase.Ended) {
    if (!game) {
      show("game");
      showHud();
      game = startGame(ui.game, room);
    }
    return;
  }

  // Back in the lobby after a round: close the game, show the lobby.
  if (game) {
    game.destroy(true);
    game = null;
    clearFeed();
  }

  show("lobby");
  ui.roomCode.textContent = s.code;
  ui.playerCount.textContent = String(s.playerCount);

  const isHost = s.hostId === room.sessionId;
  ui.hostControls.classList.toggle("hidden", !isHost);
  ui.botControls.classList.toggle("hidden", !(isHost && s.botsAllowed));
  $("easy-bots-row").classList.toggle("hidden", !(isHost && s.botsAllowed));
  $<HTMLInputElement>("easy-bots").checked = s.easyBots;
  ui.waitingHost.classList.toggle("hidden", isHost);
  ui.btnStart.disabled = s.playerCount < CONFIG.lobby.minPlayers;

  ui.playerList.replaceChildren(
    ...[...s.players.values()].map((p) => {
      const li = document.createElement("li");
      if (!p.connected) li.classList.add("off");
      const tags = [
        p.id === s.hostId ? `<span class="tag host">host</span>` : "",
        p.id === room!.sessionId ? `<span class="tag">you</span>` : "",
        p.isBot ? `<span class="tag">bot</span>` : "",
        !p.connected ? `<span class="tag">reconnecting…</span>` : "",
      ].join("");
      li.innerHTML = `<span class="dot"></span><span class="name"></span>${tags}`;
      li.querySelector(".name")!.textContent = p.nickname; // textContent: nicknames can't inject HTML
      if (isHost && p.isBot) {
        const rm = document.createElement("button");
        rm.className = "remove";
        rm.textContent = "×";
        rm.title = "Remove bot";
        rm.onclick = () => room?.send(ClientMsg.RemoveBot, p.id);
        li.appendChild(rm);
      }
      return li;
    }),
  );
}

ui.btnStart.addEventListener("click", () => room?.send(ClientMsg.Start));
ui.btnAddBot.addEventListener("click", () => room?.send(ClientMsg.AddBots, { count: 1 }));
ui.btnFillBots.addEventListener("click", () => room?.send(ClientMsg.AddBots, {}));
$<HTMLInputElement>("easy-bots").addEventListener("change", (e) =>
  room?.send(ClientMsg.SetEasyBots, (e.target as HTMLInputElement).checked),
);
ui.btnLeave.addEventListener("click", async () => {
  await room?.leave();
  history.replaceState(null, "", location.pathname);
});

ui.roomCode.addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}?code=${room?.roomId ?? ""}`;
  try {
    if (navigator.share) await navigator.share({ title: "Join my Gully Mole game", url: link });
    else {
      await navigator.clipboard.writeText(link);
      toast("Invite link copied!");
    }
  } catch {
    /* user cancelled share sheet */
  }
});

/** A controls hint that fades after a few seconds (the team badge is kept up to date by the HUD). */
function showHud() {
  const hint = $("hud-hint");
  const touch = matchMedia("(pointer: coarse)").matches;
  hint.textContent = touch
    ? "Drag on the left to move · big button to act"
    : "WASD / arrows to move · Space: action · E: pass";
  hint.classList.remove("faded");
  setTimeout(() => hint.classList.add("faded"), 8000);
}

// --------------------------------------------------------------- helpers

function show(screen: "home" | "lobby" | "game") {
  ui.home.classList.toggle("hidden", screen !== "home");
  ui.lobby.classList.toggle("hidden", screen !== "lobby");
  ui.game.classList.toggle("hidden", screen !== "game");
}

let toastTimer: number | undefined;
function toast(text: string) {
  ui.toast.textContent = text;
  ui.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.add("hidden"), 3000);
}

function safeLocalGet(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* fine */ }
}

// ------------------------------------------------------------------ boot

tryReconnect().then((r) => {
  if (r) attach(r);
});
