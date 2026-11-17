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
    /** "blue" | "green" once a round starts; "" in the lobby. */
    team: t.string().default(""),
    /** Position in world units (map is 2400 × 1350). */
    x: t.number().default(0),
    y: t.number().default(0),
    /** Facing direction for the eyes, -127..127 each. */
    fx: t.int8().default(127),
    fy: t.int8().default(0),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

/**
 * One input frame from a client: joystick/keyboard axes, -127..127 each.
 * The server clamps them (never trust the wire) and runs one movement step per
 * input, exactly like the client's prediction does.
 */
export const MoveInput = schema(
  {
    moveX: t.int8(),
    moveY: t.int8(),
  },
  "MoveInput",
);
export type MoveInput = SchemaType<typeof MoveInput>;

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
