/**
 * The synced room state. The server owns it; Colyseus sends changes to clients.
 *
 * PRIVACY (M3): each client has its own "view" (Colyseus StateView). Fields and
 * collections marked `.view(...)` are only sent to clients whose view includes
 * them. The server decides every tick (server/src/views.ts):
 *  - `players` / `footprints` / `potli`: only what you can currently SEE
 *    (vision circle + walls), everything in the lobby and after a round.
 *  - TAG.SECRET fields (secret role, real team): only to people allowed to know.
 *  - TAG.NEAR fields (the spy's iced hand): only to players standing close by.
 * So a player can never find the spy by inspecting network traffic.
 */
import { ArraySchema, schema, t, type SchemaType } from "@colyseus/schema";

/** View tags (powers of two). */
export const TAG = {
  SECRET: 1,
  NEAR: 2,
} as const;

export const Phase = {
  Lobby: "lobby",
  Playing: "playing",
  Ended: "ended",
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

/** Public roles. Detective and Spy are secret (see `secretRole`). */
export const Role = {
  Normal: "",
  Leader: "leader",
} as const;

/** Secret roles. */
export const SecretRole = {
  None: "",
  Detective: "detective",
  Spy: "spy",
} as const;

/** The three freeze looks (GDD). "" = not frozen. */
export const Freeze = {
  None: "",
  /** Tagged by an enemy or the spy: light blue ice. Leader's lamp (or the spy) unfreezes. */
  Ice: "ice",
  /** Detective's wrong arrest: dark red ice. Teammates drag them to a fireplace, once. */
  Shame: "shame",
  /** Second wrong arrest, or a caught spy: grey cracked ice until the round ends. */
  Out: "out",
} as const;

export const PlayerState = schema(
  {
    id: t.string(),
    nickname: t.string(),
    isBot: t.boolean().default(false),
    connected: t.boolean().default(true),
    /** The team you SIT in: "blue" | "green" ("" in the lobby). A spy sits in the other team. */
    team: t.string().default(""),
    /** Public role: "leader" or "" (see Role). */
    role: t.string().default(""),
    /** Position in world units (map is 2400 × 1350). */
    x: t.number().default(0),
    y: t.number().default(0),
    /** Facing direction for the eyes, -127..127 each. */
    fx: t.int8().default(127),
    fy: t.int8().default(0),
    /** Any kind of ice: can't move or act. */
    frozen: t.boolean().default(false),
    /** Which ice: "ice" | "shame" | "out" | "" (see Freeze). */
    freeze: t.string().default(""),
    /** Frozen Leader only: whole seconds until the lamp thaws them (GDD: ~10 s). */
    thawIn: t.uint8().default(0),
    /** Just-thawed Leader can't be frozen again for a moment. */
    protected: t.boolean().default(false),
    /** A spy who was seen passing to the enemy: everyone sees "SPY". */
    exposed: t.boolean().default(false),
    /** Shame-frozen Detective: id of the teammate dragging them, or "". */
    draggedBy: t.string().default(""),
    /** Shame-frozen Detective: the one fireplace rescue was already used. */
    rescueUsed: t.boolean().default(false),

    // ---- secrets: only sent to people allowed to know (TAG.SECRET)
    /** "detective" | "spy" | "" */
    secretRole: t.string().default("").view(TAG.SECRET),
    /** The team you really play for. Differs from `team` only for spies. */
    realTeam: t.string().default("").view(TAG.SECRET),

    // ---- clues only visible up close (TAG.NEAR)
    /** The spy's hand, iced for ~20 s after a secret freeze (GDD). */
    icedHand: t.boolean().default(false).view(TAG.NEAR),
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
    /** Seconds left on the snatch countdown. */
    snatchLeft: t.number().default(0),
  },
  "PotliState",
);
export type PotliState = SchemaType<typeof PotliState>;

/** One footprint left by a secret freeze. Anonymous (D7). */
export const Footprint = schema(
  {
    x: t.number(),
    y: t.number(),
    /** Walking direction, radians. */
    angle: t.number(),
  },
  "Footprint",
);
export type Footprint = SchemaType<typeof Footprint>;

/** A Leader-called huddle (M4): the whole game and the timer pause. */
export const HuddleState = schema(
  {
    active: t.boolean().default(false),
    callerId: t.string().default(""),
    callerName: t.string().default(""),
    callerTeam: t.string().default(""),
    /** Whole seconds until the huddle ends by itself. */
    secondsLeft: t.uint16().default(0),
  },
  "HuddleState",
);
export type HuddleState = SchemaType<typeof HuddleState>;

// ---------------------------------------------------------------- M5: after a round

/** One row of the stats table: a factor and each team's count. */
export const FactorRow = schema(
  { key: t.string(), label: t.string(), sign: t.int8(), blue: t.number(), green: t.number() },
  "FactorRow",
);
export type FactorRow = SchemaType<typeof FactorRow>;

/** One award someone handed out. */
export const AwardGiven = schema(
  { awardId: t.string(), fromId: t.string(), fromName: t.string(), toId: t.string(), toName: t.string() },
  "AwardGiven",
);
export type AwardGiven = SchemaType<typeof AwardGiven>;

/** A player's award points: received + honesty bonus. */
export const PointsRow = schema(
  {
    id: t.string(),
    name: t.string(),
    team: t.string(),
    received: t.uint8(),
    honesty: t.uint8(),
    total: t.uint8(),
  },
  "PointsRow",
);
export type PointsRow = SchemaType<typeof PointsRow>;

/**
 * The end-of-round summary (GDD "The reveal" + "Peer awards"). Only filled in
 * once the round is over, when everything is public anyway.
 */
export const SummaryState = schema(
  {
    blueScore: t.number().default(0),
    greenScore: t.number().default(0),
    factors: t.array(FactorRow),
    /** Key moments, oldest first, e.g. "2:14 Pappu arrested Golu: a SPY!". */
    moments: t.array("string"),
    /** Awards on offer this round (situational ones only if they happened). */
    awardIds: t.array("string"),
    awardsOpen: t.boolean().default(false),
    awardsSecondsLeft: t.uint8().default(0),
    /** Humans who have handed out their awards / who still can. */
    submittedIds: t.array("string"),
    voters: t.uint8().default(0),
    /** Filled once voting closes. */
    results: t.array(AwardGiven),
    points: t.array(PointsRow),
    mvpId: t.string().default(""),
    mvpName: t.string().default(""),
  },
  "SummaryState",
);
export type SummaryState = SchemaType<typeof SummaryState>;

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
    /** Dev: easy bots never grab or snatch the potli, so you can test roles alone (D52). */
    easyBots: t.boolean().default(true),
    /** Keyed by player id. Filtered per client: you only receive who you can see. */
    players: t.map(PlayerState).view(),
    potli: t.ref(PotliState).default(() => new PotliState()).view(),
    footprints: t.map(Footprint).view(),
    /** How many players are in the room (the players map is filtered, so the lobby count lives here). */
    playerCount: t.uint8().default(0),
    /** Whole seconds left in the round (paused during huddles). */
    timeLeft: t.uint16().default(0),
    huddle: t.ref(HuddleState).default(() => new HuddleState()),
    /** Huddles each team's Leader can still call this round. */
    huddlesLeftBlue: t.uint8().default(0),
    huddlesLeftGreen: t.uint8().default(0),
    /** After a round: "blue" | "green" | "draw". */
    winner: t.string().default(""),
    /** After a round: "home" | "wipeout" | "time". */
    endReason: t.string().default(""),
    summary: t.ref(SummaryState).default(() => new SummaryState()),
    /** Host's lobby setting: which "settings" awards are switched on (default: all). */
    extraAwards: t.array("string").default(() => new ArraySchema<string>("delulu", "fumbled", "maincharacter", "yapper", "caught4k")),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
