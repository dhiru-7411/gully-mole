/**
 * The message feed (top right): announcements, whispers, Detective pings.
 * Plain HTML so it stays readable on every screen. Messages fade after a while.
 */

const MAX = 4;
const LIFETIME_MS = 7000;

export type FeedKind = "announce" | "whisper" | "ping" | "quick";

/** Huddle chat log (shown inside the huddle overlay). */
export function addHuddleLine(from: string, text: string, isMe: boolean) {
  const log = document.getElementById("huddle-log");
  if (!log) return;
  const line = document.createElement("div");
  if (isMe) line.className = "me";
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = from; // textContent: chat can't inject HTML
  line.append(who, document.createTextNode(text));
  log.append(line);
  log.scrollTop = log.scrollHeight;
}

export function clearHuddleLog() {
  document.getElementById("huddle-log")?.replaceChildren();
}

/** Quick-message speech bubbles above blobs: player id -> text + expiry. */
export const bubbles = new Map<string, { text: string; until: number }>();

export function addBubble(playerId: string, text: string) {
  bubbles.set(playerId, { text, until: performance.now() + 3500 });
}

export function pushFeed(text: string, kind: FeedKind = "announce") {
  const feed = document.getElementById("hud-feed");
  if (!feed) return;
  const item = document.createElement("div");
  item.className = `feed-item feed-${kind}`;
  item.textContent = text; // textContent: names/whispers can't inject HTML
  feed.prepend(item);
  while (feed.children.length > MAX) feed.lastElementChild?.remove();
  setTimeout(() => item.classList.add("fading"), LIFETIME_MS - 600);
  setTimeout(() => item.remove(), LIFETIME_MS);
}

export function clearFeed() {
  document.getElementById("hud-feed")?.replaceChildren();
}

/** Where the Detective was told a teammate got frozen (drawn as an arrow + ring for a while). */
export interface Ping {
  x: number;
  y: number;
  until: number;
}

export const pings: Ping[] = [];

export function addPing(x: number, y: number) {
  pings.push({ x, y, until: performance.now() + 8000 });
}
