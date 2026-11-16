/**
 * Pure lobby rules. No networking here, so they're easy to unit-test and the
 * server just calls them.
 */
import { CONFIG } from "./config";

/** A room code is exactly 4 digits, 1000–9999 (no leading zero, so it reads well aloud). */
export function isValidRoomCode(code: unknown): code is string {
  return typeof code === "string" && /^[1-9]\d{3}$/.test(code);
}

/**
 * Pick a random 4-digit code that isn't in use.
 * `random` is injectable so tests can make it predictable.
 */
export function generateRoomCode(
  isTaken: (code: string) => boolean,
  random: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = String(1000 + Math.floor(random() * 9000));
    if (!isTaken(code)) return code;
  }
  // 9000 possible codes; hitting this means the server is packed or `random` is broken.
  throw new Error("No free room code available");
}

/**
 * Clean a nickname: trim, collapse spaces, drop control characters, cap length.
 * Duplicates get a number ("Ravi" -> "Ravi 2") so everyone is distinguishable.
 * Returns null if nothing usable is left.
 */
export function cleanNickname(raw: unknown, taken: Iterable<string> = []): string | null {
  if (typeof raw !== "string") return null;
  const max = CONFIG.lobby.nicknameMaxLength;
  const base = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  if (base.length === 0) return null;

  const used = new Set([...taken].map((n) => n.toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, max - suffix.length).trim() + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

export type StartCheck = { ok: true } | { ok: false; reason: string };

/** Can the host start a round with this many players (humans + bots)? */
export function canStart(playerCount: number): StartCheck {
  const { minPlayers, maxPlayers } = CONFIG.lobby;
  if (playerCount < minPlayers) {
    return { ok: false, reason: `Need at least ${minPlayers} players (have ${playerCount}).` };
  }
  if (playerCount > maxPlayers) {
    return { ok: false, reason: `Max ${maxPlayers} players.` };
  }
  return { ok: true };
}

export interface HostCandidate {
  id: string;
  isBot: boolean;
  connected: boolean;
}

/**
 * Who becomes host when the current host leaves: the earliest-joined human who
 * is still connected. Pass candidates in join order. Bots never host.
 */
export function pickNextHost(candidates: Iterable<HostCandidate>, leavingId?: string): string | null {
  for (const c of candidates) {
    if (c.id !== leavingId && !c.isBot && c.connected) return c.id;
  }
  return null;
}

/** GDD: 10 min at 8 players, +1 min for every 2 extra, capped at 15. Returns seconds. */
export function roundDurationSeconds(playerCount: number): number {
  const { baseMinutes, basePlayers, playersPerExtraMinute, maxMinutes } = CONFIG.round;
  const extra = Math.max(0, playerCount - basePlayers);
  const minutes = Math.min(maxMinutes, baseMinutes + Math.floor(extra / playersPerExtraMinute));
  return minutes * 60;
}

/** Friendly names for dev bots. */
export const BOT_NAMES = [
  "Bot Chintu", "Bot Pappu", "Bot Golu", "Bot Bunty", "Bot Munna", "Bot Tinku",
  "Bot Raju", "Bot Sonu", "Bot Monu", "Bot Guddu", "Bot Pinky", "Bot Babli",
  "Bot Lucky", "Bot Happy", "Bot Dolly", "Bot Sweety", "Bot Bittu", "Bot Chotu",
  "Bot Jugnu", "Bot Kaju",
];
