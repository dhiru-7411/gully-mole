/**
 * The synced room state. The server owns it; Colyseus sends changes to clients.
 *
 * Rule of thumb: only put things here that EVERY client may see. Secrets
 * (roles, hidden positions) arrive in M3 using per-client views (StateView),
 * so they never reach a client that shouldn't know them.
 */
import { schema, t, type SchemaType } from "@colyseus/schema";

export const Phase = {
  Lobby: "lobby",
  Playing: "playing",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const PlayerState = schema(
  {
    id: t.string(),
    nickname: t.string(),
    isBot: t.boolean().default(false),
    connected: t.boolean().default(true),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema(
  {
    phase: t.string().default(Phase.Lobby),
    code: t.string(),
    hostId: t.string(),
    /** Whether the host may add dev bots (off in production). */
    botsAllowed: t.boolean().default(false),
    /** Keyed by player id: the sessionId for humans, "bot-N" for bots. Map order = join order. */
    players: t.map(PlayerState),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
