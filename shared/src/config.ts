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

  /** GDD team-size table: teams of 7+ get a second spy. (M3+) */
  teams: {
    secondSpyAtTeamSize: 7,
  },

  /** (M1+) */
  movement: {
    tickRate: 20,
    playerSpeed: 160,
    playerRadius: 14,
    /** Multiplier while the Leader carries the object and no teammate is frozen. */
    leaderCarrySpeedBonus: 1.25,
    /** Speed multiplier while dragging a Shame-frozen Detective (DECISIONS D9). */
    dragSpeedMultiplier: 0.5,
  },

  /** (M3+) Each player sees a circle of this radius, blocked by obstacles. */
  vision: {
    radius: 220,
  },

  /** Max centre-to-centre distance for each interaction. (M2+) */
  distances: {
    tag: 36,
    handOff: 40,
    snatch: 36,
    arrest: 36,
    lampUnfreeze: 40,
    secretFreeze: 36,
    drag: 40,
    fireplaceUse: 60,
  },

  /** (M2+) */
  timers: {
    snatchCountdownSec: 3,
    frozenHandSec: 20,
    footprintsSec: 20,
    leaderAutoThawSec: 10,
    leaderProtectionSec: 2.5,
  },

  /** (M4+) DECISIONS D8: both teams chat at once; caller can end early. */
  huddle: {
    perRound: 2,
    durationSec: 150,
  },

  /** (M5+) Placeholder weights: 1 each, tune after play-tests. Negative factors subtract. */
  scoring: {
    enemiesFrozen: 1,
    objectSnatched: 1,
    objectHoldSecond: 1,
    objectClosestToBase: 1,
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
} as const;

export type GameConfig = typeof CONFIG;
