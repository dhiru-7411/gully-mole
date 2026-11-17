/**
 * Role assignment (GDD "Players and teams"): every round, inside each team,
 * one Leader, one Detective, and one spy (two for teams of 7+) planted by the
 * OTHER team. Everyone else is a Normal player. Roles stay fixed all round.
 */
import { CONFIG } from "./config";
import type { Team } from "./map";
import { shuffled } from "./teams";

export interface RoleAssignment {
  /** "leader" or "" (public). */
  role: string;
  /** "detective" | "spy" | "" (secret). */
  secretRole: string;
  /** The team they really play for. A spy's real team is the other team. */
  realTeam: Team;
}

/** How many spies sit in a team of this size (GDD table). */
export function spiesFor(teamSize: number): number {
  if (teamSize < 3) return 0; // too small to hide a spy (tests / tiny games)
  return teamSize >= CONFIG.teams.secondSpyAtTeamSize ? 2 : 1;
}

/** Roles for the members of ONE team (ids = everyone sitting in `team`). */
export function assignRoles(
  team: Team,
  ids: readonly string[],
  random: () => number = Math.random,
): Map<string, RoleAssignment> {
  const other: Team = team === "blue" ? "green" : "blue";
  const order = shuffled(ids, random);
  const spies = spiesFor(order.length);
  const out = new Map<string, RoleAssignment>();
  order.forEach((id, i) => {
    if (i === 0) out.set(id, { role: "leader", secretRole: "", realTeam: team });
    else if (i === 1 && order.length >= 2) out.set(id, { role: "", secretRole: "detective", realTeam: team });
    else if (i >= 2 && i < 2 + spies) out.set(id, { role: "", secretRole: "spy", realTeam: other });
    else out.set(id, { role: "", secretRole: "", realTeam: team });
  });
  return out;
}
