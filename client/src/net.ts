/**
 * Talking to the server. The client never decides game outcomes; it only sends
 * requests and shows the state the server sends back.
 */
import { ColyseusSDK, type Room } from "@colyseus/sdk";
import { GameState, ROOM_NAME, type JoinOptions } from "@gully/shared";

/**
 * Local dev: the server runs on port 2567 of the same machine that served this
 * page (so phones on your wifi work too). In production, set VITE_SERVER_URL.
 */
const serverUrl =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;

export const sdk = new ColyseusSDK(serverUrl);

export type GameRoom = Room<any, GameState>;

/** Per-tab, so several tabs on one computer each keep their own player. */
const TOKEN_KEY = "gully.reconnectionToken";

export async function createRoom(opts: JoinOptions): Promise<GameRoom> {
  return remember(await sdk.create(ROOM_NAME, opts, GameState));
}

export async function joinRoom(code: string, opts: JoinOptions): Promise<GameRoom> {
  return remember(await sdk.joinById(code, opts, GameState));
}

/** After a page refresh, try to get our old seat back. */
export async function tryReconnect(): Promise<GameRoom | null> {
  const token = safeGet(TOKEN_KEY);
  if (!token) return null;
  try {
    return remember(await sdk.reconnect(token, GameState));
  } catch {
    forget();
    return null;
  }
}

export function forget() {
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked: fine */ }
}

function remember(room: GameRoom): GameRoom {
  try { sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken); } catch { /* fine */ }
  return room;
}

function safeGet(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

/** Turn a server/matchmaker error into something a player understands. */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not found|no rooms found|invalid room/i.test(msg)) return "No room with that code.";
  if (/locked|already started/i.test(msg)) return "That game already started.";
  if (/ECONNREFUSED|Failed to fetch|NetworkError|network/i.test(msg)) {
    return "Can't reach the game server. Is it running?";
  }
  return msg || "Something went wrong.";
}
