/**
 * Splitting players into Blue and Green (DECISIONS D4: random every round,
 * odd counts give one side an extra player, chosen at random).
 */
import { MAP, type Point, type Team } from "./map";

/** Fisher–Yates shuffle on a copy. `random` is injectable for tests. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function assignTeams(ids: readonly string[], random: () => number = Math.random): Map<string, Team> {
  const order = shuffled(ids, random);
  // With an odd count, flip a coin for which team gets the extra player.
  const blueCount = order.length % 2 === 0 || random() < 0.5
    ? Math.ceil(order.length / 2)
    : Math.floor(order.length / 2);
  const result = new Map<string, Team>();
  order.forEach((id, i) => result.set(id, i < blueCount ? "blue" : "green"));
  return result;
}

/** The n-th spawn spot in a team's den (wraps if a team is larger than the spot list). */
export function spawnPoint(team: Team, index: number): Point {
  const spots = MAP.spawns[team];
  return spots[index % spots.length];
}
