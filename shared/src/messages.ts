/**
 * Names and payloads of the messages between client and server, in one place
 * so a typo can't silently break things.
 */

/** The single Colyseus room type. */
export const ROOM_NAME = "gully";

/** Options a client sends when creating or joining a room. */
export interface JoinOptions {
  nickname: string;
}

/** Client -> server. */
export const ClientMsg = {
  /** Host only: start the round. */
  Start: "start",
  /** Host only, dev: add `count` bots (default: fill up to the minimum). */
  AddBots: "addBots",
  /** Host only, dev: remove one bot by id. */
  RemoveBot: "removeBot",
  /** The big smart button (D32). Payload: ActionPayload. The server re-checks everything. */
  Action: "action",
  /** The Pass button: hand the potli to the nearest teammate beside you. */
  Pass: "pass",
  /** Host only, after a round ends: everyone back to the lobby. */
  BackToLobby: "backToLobby",
  /** The role button (D42): arrest / ice / free / drag / release. Payload: RoleActionPayload. */
  RoleAction: "roleAction",
  /** Spy only: a short private message to their real team. Payload: string. */
  Whisper: "whisper",
  /** Host only, lobby, dev: turn easy bots on/off. Payload: boolean. */
  SetEasyBots: "setEasyBots",
} as const;

export interface RoleActionPayload {
  kind: string;
  targetId: string;
}

/** Server -> client events (besides Notice). */
export const ServerEvent = {
  /** Something everyone should hear about (arrests, a spy exposed). Payload: string. */
  Announce: "announce",
  /** To a Detective: a teammate was just frozen here. Payload: { x, y, name }. */
  FrozenPing: "frozenPing",
  /** To a spy's real team (and the spy): payload { from, text }. */
  Whisper: "whisper",
} as const;

export interface FrozenPingPayload {
  x: number;
  y: number;
  name: string;
}

export interface WhisperPayload {
  from: string;
  text: string;
}

export const WHISPER_MAX_LENGTH = 80;

export interface ActionPayload {
  kind: string;
  targetId?: string;
}

/** Server -> one client. */
export const ServerMsg = {
  /** A short message to show the player (e.g. why Start was refused). */
  Notice: "notice",
} as const;

export interface AddBotsPayload {
  count?: number;
}
