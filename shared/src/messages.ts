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
} as const;

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
