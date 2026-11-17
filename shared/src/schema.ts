/**
 * The synced room state. The server owns it; Colyseus sends changes to clients.
 *
 * Rule of thumb: only put things here that EVERY client may see. Secrets
 * (Detective, spies, hidden positions) arrive in M3 using per-client views
 * (StateView), so they never reach a client that shouldn't know them.
 * The Leader is public (everyone can see who leads), so it lives here.
 */
import { schema, t, type SchemaType } from "@colyseus/schema";

export const Phase = {
  Lobby: "lobby",
  Playing: "playing",
  Ended: "ended",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** Public roles. Detective and Spy are secret and arrive in M3. */
export const Role = {
  Normal: "",
  Leader: "leader",
} as const;

export const PlayerState = schema(
  {
    id: t.string(),
    nickname: t.string(),
    isBot: t.boolean().default(false),
    connected: t.boolean().default(true),
    /** "blue" | "green" once a round starts; "" in the lobby. */
    team: t.string().default(""),
    /** Public role: "leader" or "" (see Role). */
    role: t.string().default(""),
    /** Position in world units (map is 2400 × 1350). */
    x: t.number().default(0),
    y: t.number().default(0),
    /** Facing direction for the eyes, -127..127 each. */
    fx: t.int8().default(127),
    fy: t.int8().default(0),
    /** Frozen in ice: can't move or act. */
    frozen: t.boolean().default(false),
    /** Frozen Leader only: whole seconds until the lamp thaws them (GDD: ~10 s). */
    thawIn: t.uint8().default(0),
    /** Just-thawed Leader can't be frozen again for a moment. */
    protected: t.boolean().default(false),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

/** The one object everyone fights over. */
export const PotliState = schema(
  {
    x: t.number().default(0),
    y: t.number().default(0),
    /** Player id carrying it, or "" when it's lying loose. */
    carrierId: t.string().default(""),
    /** Enemy currently snatching it from the carrier, or "". */
    snatcherId: t.string().default(""),
    /** Seconds left on the snatch countdown (one decimal is plenty). */
    snatchLeft: t.number().default(0),
  },
  "PotliState",
);
export type PotliState = SchemaType<typeof PotliState>;

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
    potli: t.ref(PotliState).default(() => new PotliState()),
    /** Whole seconds left in the round. */
    timeLeft: t.uint16().default(0),
    /** After a round: "blue" | "green" | "draw". */
    winner: t.string().default(""),
    /** After a round: "home" | "wipeout" | "time". */
    endReason: t.string().default(""),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
