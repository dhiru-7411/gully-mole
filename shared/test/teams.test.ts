import { describe, expect, it } from "vitest";
import { assignTeams, spawnPoint } from "../src";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const sizes = (m: Map<string, string>) => {
  const v = [...m.values()];
  return { blue: v.filter((t) => t === "blue").length, green: v.filter((t) => t === "green").length };
};

describe("team assignment (DECISIONS D4)", () => {
  it("splits an even group evenly", () => {
    expect(sizes(assignTeams(ids(8)))).toEqual({ blue: 4, green: 4 });
    expect(sizes(assignTeams(ids(20)))).toEqual({ blue: 10, green: 10 });
  });

  it("gives the extra player of an odd group to either side", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = sizes(assignTeams(ids(9)));
      expect(Math.abs(s.blue - s.green)).toBe(1);
      seen.add(s.blue > s.green ? "blue" : "green");
    }
    expect(seen.size).toBe(2);
  });

  it("assigns everyone exactly once", () => {
    const m = assignTeams(ids(13));
    expect(m.size).toBe(13);
  });

  it("shuffles: teams differ between rounds", () => {
    const a = [...assignTeams(ids(10)).entries()].join();
    let different = false;
    for (let i = 0; i < 20 && !different; i++) different = [...assignTeams(ids(10)).entries()].join() !== a;
    expect(different).toBe(true);
  });

  it("gives each team member a different spawn spot", () => {
    const spots = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(spawnPoint("blue", i))));
    expect(spots.size).toBe(10);
  });
});
