import { describe, expect, it } from "vitest";
import {
  CONFIG,
  canStart,
  cleanNickname,
  generateRoomCode,
  isValidRoomCode,
  pickNextHost,
  roundDurationSeconds,
} from "../src";

describe("room codes", () => {
  it("generates 4-digit codes without a leading zero", () => {
    for (let i = 0; i < 500; i++) {
      expect(isValidRoomCode(generateRoomCode(() => false))).toBe(true);
    }
    expect(generateRoomCode(() => false, () => 0)).toBe("1000");
    expect(generateRoomCode(() => false, () => 0.99999)).toBe("9999");
  });

  it("skips codes already in use", () => {
    const taken = new Set(["1000"]);
    let call = 0;
    const rolls = [0, 0, 0.5]; // 1000, 1000, then 5500
    const code = generateRoomCode((c) => taken.has(c), () => rolls[call++]);
    expect(code).toBe("5500");
  });

  it("throws if every attempt is taken", () => {
    expect(() => generateRoomCode(() => true)).toThrow();
  });

  it("validates codes", () => {
    expect(isValidRoomCode("4821")).toBe(true);
    expect(isValidRoomCode("0123")).toBe(false);
    expect(isValidRoomCode("123")).toBe(false);
    expect(isValidRoomCode("12a4")).toBe(false);
    expect(isValidRoomCode(1234)).toBe(false);
  });
});

describe("nicknames", () => {
  it("trims, collapses spaces and caps length", () => {
    expect(cleanNickname("  Ravi   Kumar ")).toBe("Ravi Kumar");
    expect(cleanNickname("x".repeat(50))!.length).toBe(CONFIG.lobby.nicknameMaxLength);
  });

  it("rejects empty or non-string names", () => {
    expect(cleanNickname("")).toBeNull();
    expect(cleanNickname("   ")).toBeNull();
    expect(cleanNickname("\u0000\u0007")).toBeNull();
    expect(cleanNickname(undefined)).toBeNull();
    expect(cleanNickname(42)).toBeNull();
  });

  it("numbers duplicates, ignoring case", () => {
    expect(cleanNickname("ravi", ["Ravi"])).toBe("ravi 2");
    expect(cleanNickname("Ravi", ["Ravi", "Ravi 2"])).toBe("Ravi 3");
  });

  it("keeps numbered duplicates within the length cap", () => {
    const long = "y".repeat(CONFIG.lobby.nicknameMaxLength);
    const dup = cleanNickname(long, [long])!;
    expect(dup.length).toBeLessThanOrEqual(CONFIG.lobby.nicknameMaxLength);
    expect(dup.endsWith(" 2")).toBe(true);
  });
});

describe("start check", () => {
  it("needs at least the minimum players (GDD: 8)", () => {
    expect(CONFIG.lobby.minPlayers).toBe(8);
    expect(canStart(7).ok).toBe(false);
    expect(canStart(8).ok).toBe(true);
    expect(canStart(CONFIG.lobby.maxPlayers).ok).toBe(true);
    expect(canStart(CONFIG.lobby.maxPlayers + 1).ok).toBe(false);
  });
});

describe("host hand-over", () => {
  const players = [
    { id: "a", isBot: false, connected: true },
    { id: "bot-1", isBot: true, connected: true },
    { id: "b", isBot: false, connected: false },
    { id: "c", isBot: false, connected: true },
  ];

  it("picks the earliest connected human, never a bot", () => {
    expect(pickNextHost(players, "a")).toBe("c");
  });

  it("returns null when no human is left", () => {
    expect(pickNextHost(players.slice(0, 2), "a")).toBeNull();
  });
});

describe("round timer (GDD)", () => {
  it("is 10 min at 8 players, +1 min per 2 extra, max 15", () => {
    expect(roundDurationSeconds(8)).toBe(600);
    expect(roundDurationSeconds(9)).toBe(600);
    expect(roundDurationSeconds(10)).toBe(660);
    expect(roundDurationSeconds(12)).toBe(720);
    expect(roundDurationSeconds(18)).toBe(900);
    expect(roundDurationSeconds(30)).toBe(900);
  });
});
