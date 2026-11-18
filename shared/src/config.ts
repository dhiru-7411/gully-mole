/**
 * Gully Mole — every tunable number lives here.
 *
 * Change a value, restart `npm run dev`, play-test. Both the server (rules) and
 * the client (UI hints) read this file, so they never disagree.
 *
 * Units: distances in world pixels, times in seconds, speeds in pixels/second.
 * Values marked "M1+" are used from a later milestone; they're listed now so
 * there is one place to tune everything.
 */
export const CONFIG = {
  lobby: {
    /** GDD: two teams of 4. Bots count toward this in dev. */
    minPlayers: 8,
    maxPlayers: 20,
    roomCodeLength: 4,
    nicknameMaxLength: 14,
    /** How long a dropped player keeps their seat in the lobby. */
    lobbyReconnectSeconds: 20,
    /** How long a dropped player can rejoin during a round (their character stays on the map meanwhile). */
    gameReconnectSeconds: 300,
  },

  /** GDD: 10 min for 8 players, +1 min per 2 extra players, max 15. Huddles pause it. */
  round: {
    baseMinutes: 10,
    basePlayers: 8,
    playersPerExtraMinute: 2,
    maxMinutes: 15,
  },

  teams: {
    /** Display names (DECISIONS D26: not final; rename here only). */
    names: { blue: "Blue", green: "Green" },
    /** GDD team-size table: teams of 7+ get a second spy. (M3+) */
    secondSpyAtTeamSize: 7,
  },

  /** Server simulation + client prediction. */
  movement: {
    /** Server steps per second. One client input = one step. */
    tickRate: 20,
    /** World units per second at full stick (D55: was 220). Crossing the 3600-wide map takes ~19 s. */
    playerSpeed: 190,
    /** Blob radius (diameter 44, docs/ART.md). */
    playerRadius: 22,
    /** Joystick inputs smaller than this fraction are ignored (thumb wobble). */
    deadzone: 0.15,
    /**
     * Anyone carrying the potli moves at this fraction of normal speed, so
     * chasers can catch up and snatch (D38: without it, rounds ended in ~10 s).
     */
    carrierSpeedMultiplier: 0.85,
    /** Extra multiplier while the Leader carries the object and no teammate is frozen. */
    leaderCarrySpeedBonus: 1.25,
    /** Speed multiplier while dragging a Shame-frozen Detective (DECISIONS D9). */
    dragSpeedMultiplier: 0.5,
  },

  /** Each player sees a circle of this radius, blocked by obstacles (D53: owner tuned it down). */
  vision: {
    /** Normal players and Leaders. */
    radius: 230,
    /** Detectives and spies see a bit further: they're the ones hunting / sneaking (D53). */
    roleRadius: 280,
    /** The spy's iced hand is only visible this close (GDD: "visible only to players close by"). */
    nearRadius: 140,
  },

  /** Footprints after a secret freeze (GDD: ~20 s). */
  footprints: {
    /** How long after the freeze the spy keeps leaving prints. */
    trailSec: 4,
    /** One print every this many seconds while trailing. */
    everySec: 0.35,
  },

  /** Every screen shows this many world units of height (DECISIONS D23). */
  camera: {
    /** Zoomed in (D53): was 650. Smaller = closer camera, less of the map on screen. */
    viewHeight: 520,
    /** 0–1: how quickly the camera catches up with you (1 = locked on). */
    followLerp: 0.2,
  },

  /**
   * Max centre-to-centre distance for each interaction.
   * Two blobs touch at 44 (2 × radius 22), so ~64 means "touching or nearly".
   */
  distances: {
    tag: 64,
    /** Pass: "only to a teammate standing right beside you" (GDD). */
    handOff: 70,
    snatch: 64,
    /** Blob centre to the potli's centre. */
    grab: 48,
    lampUnfreeze: 70,
    arrest: 64,
    secretFreeze: 64,
    drag: 60,
    fireplaceUse: 90,
  },

  timers: {
    /** Enemy must stay within snatch reach this long to take the potli. */
    snatchCountdownSec: 3,
    /** After you Tag someone, you can't Tag again for this long (D63, owner). The spy's Ice isn't affected. */
    tagCooldownSec: 10,
    frozenHandSec: 20,
    footprintsSec: 20,
    leaderAutoThawSec: 10,
    leaderProtectionSec: 2.5,
  },

  /** Huddles (GDD + D8): Leader-called, game paused, each team chats privately; caller can end early. */
  huddle: {
    perRound: 2,
    durationSec: 150,
    chatMaxLength: 120,
    /** Anti-spam: at most this many chat lines per second per player. */
    chatPerSecond: 2,
  },

  /** One-tap messages to your team (GDD). Keys 1–4. */
  quickMessages: ["Spy near the fire!", "Leader frozen!", "Potli on the left!", "Trust me bro"],
  /** Anti-spam: one quick message per this many seconds per player. */
  quickMessageCooldownSec: 1.5,

  /**
   * Team score weights (GDD "Automatic stats"). Placeholder 1 each: tune after
   * play-tests. The factor list and whether it adds or subtracts is in
   * shared/src/awards.ts (FACTORS). Units: hold time counts per 10 s;
   * "closest to scoring" counts 0–10.
   */
  scoring: {
    enemiesFrozen: 1,
    objectSnatched: 1,
    holdTime: 1,
    closestToGoal: 1,
    handOffs: 1,
    lampUnfreezes: 1,
    spyUntracedFreezes: 1,
    spySilentPasses: 1,
    spySecretUnfreezes: 1,
    spySurvived: 1,
    correctArrest: 1,
    wrongArrest: 1,
    ownPlayersFrozen: 1,
    objectLostToEnemy: 1,
  },

  /** Peer awards after each round (GDD "Peer awards"). */
  awards: {
    minPerPlayer: 3,
    maxPerPlayer: 5,
    /** Seconds everyone gets to hand out awards before results show anyway. */
    votingSec: 90,
    /** Points for each award you receive (roasts too). */
    pointsPerAward: 1,
    /** Honesty bonus: points when your pick matches what the stats show. */
    honestyBonus: 1,
  },
} as const;

export type GameConfig = typeof CONFIG;
