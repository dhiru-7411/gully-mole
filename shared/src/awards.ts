/**
 * End-of-round scoring (GDD "Scoring"):
 *  - FACTORS: the automatic stats that decide a timed-out round (team score).
 *  - AWARDS: the Gen-Z roast awards players hand to opponents (decide the MVP).
 */
import { CONFIG } from "./config";

export type FactorKey = keyof typeof CONFIG.scoring;

export interface FactorDef {
  key: FactorKey;
  label: string;
  /** +1 adds to the team score, -1 subtracts. */
  sign: 1 | -1;
}

/** In GDD table order. Spy factors count for the spy's REAL team. */
export const FACTORS: readonly FactorDef[] = [
  { key: "enemiesFrozen", label: "Enemies frozen", sign: 1 },
  { key: "objectSnatched", label: "Potli snatched from an enemy", sign: 1 },
  { key: "holdTime", label: "Time holding the potli (per 10 s)", sign: 1 },
  { key: "closestToGoal", label: "Closest the potli got to scoring (0–10)", sign: 1 },
  { key: "handOffs", label: "Hand-offs to a teammate", sign: 1 },
  { key: "lampUnfreezes", label: "Teammates unfrozen with the lamp", sign: 1 },
  { key: "spyUntracedFreezes", label: "Spy: secret freezes never traced", sign: 1 },
  { key: "spySilentPasses", label: "Spy: silent passes", sign: 1 },
  { key: "spySecretUnfreezes", label: "Spy: secret unfreezes", sign: 1 },
  { key: "spySurvived", label: "Spy survived uncaught", sign: 1 },
  { key: "correctArrest", label: "Correct arrests", sign: 1 },
  { key: "wrongArrest", label: "Wrong arrests", sign: -1 },
  { key: "ownPlayersFrozen", label: "Own players frozen", sign: -1 },
  { key: "objectLostToEnemy", label: "Potli snatched by the enemy", sign: -1 },
];

export type FactorCounts = Record<FactorKey, number>;

export function emptyFactors(): FactorCounts {
  return Object.fromEntries(FACTORS.map((f) => [f.key, 0])) as FactorCounts;
}

/** A team's score: sum of weight × count, negatives subtracted. */
export function teamScore(counts: FactorCounts): number {
  let total = 0;
  for (const f of FACTORS) total += f.sign * CONFIG.scoring[f.key] * counts[f.key];
  return Math.round(total * 10) / 10;
}

// ------------------------------------------------------------------ awards

export interface AwardDef {
  id: string;
  name: string;
  /** Who it should go to (shown under the name). */
  goesTo: string;
  /** "default" awards are always on; "settings" ones the host can switch off in the lobby. */
  set: "default" | "settings";
  /** Only offered if the moment actually happened this round. */
  situational?: boolean;
}

export const AWARDS: readonly AwardDef[] = [
  { id: "ate", name: "Ate and Left No Crumbs", goesTo: "Best player", set: "default" },
  { id: "lowkey", name: "Lowkey Carried", goesTo: "Underrated, quietly useful", set: "default" },
  { id: "npc", name: "NPC Energy", goesTo: "Least impact", set: "default" },
  { id: "rizz", name: "Ice Cold Rizz", goesTo: "Best liar or bluffer", set: "default" },
  { id: "sus", name: "Sus Since Minute One", goesTo: "Most suspected, spy or not", set: "default" },
  { id: "delulu", name: "Delulu Detective", goesTo: "Confident wrong arrest", set: "settings", situational: true },
  { id: "fumbled", name: "Fumbled the Bag", goesTo: "Dropped the potli right before scoring", set: "settings", situational: true },
  { id: "maincharacter", name: "Main Character Syndrome", goesTo: "Hogged the potli, got frozen anyway", set: "settings" },
  { id: "yapper", name: "Professional Yapper", goesTo: "Most talk in huddles, least work in game", set: "settings" },
  { id: "caught4k", name: "Caught in 4K", goesTo: "Exposed red-handed", set: "settings", situational: true },
];

export const SETTINGS_AWARD_IDS = AWARDS.filter((a) => a.set === "settings").map((a) => a.id);

export const awardById = (id: string) => AWARDS.find((a) => a.id === id);

/** One pick when handing out awards. */
export interface AwardPick {
  awardId: string;
  toId: string;
}
