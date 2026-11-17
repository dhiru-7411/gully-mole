/**
 * PRIVACY (kickoff: "A player must never be able to find a spy by inspecting
 * network traffic"). Real clients connect over the network while bots run a
 * real round. After every patch we check what each client actually RECEIVED
 * against the server's truth:
 *  - no player you can't see (except your own frozen Leader);
 *  - no secret role / real team you aren't allowed to know;
 *  - no iced hand unless they're standing close;
 *  - never the spy's identity unless you're on their real team.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { CONFIG, ClientMsg, Phase, ROOM_NAME, canSee, dist, visionRadius } from "@gully/shared";
import appConfig from "../src/app.config";

let colyseus: ColyseusTestServer<any>;
beforeAll(async () => {
  colyseus = await boot(appConfig, 2597);
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

const MOVE_SLACK = 40; // positions move a little between the server tick and the check

describe("what each client receives", () => {
  it("never leaks hidden players, secrets or close-up clues (bots playing for ~6 s)", async () => {
    const room = await colyseus.createRoom(ROOM_NAME, {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    const friend = await colyseus.connectTo(room, { nickname: "Friend" });
    host.send(ClientMsg.AddBots, { count: 8 }); // 10 players: 5 per team
    await room.waitForNextMessage();
    host.send(ClientMsg.Start);
    await room.waitForNextMessage();
    expect(room.state.phase).toBe(Phase.Playing);

    const clients = [host, friend];
    let checks = 0;
    let hiddenSeen = 0;
    for (let i = 0; i < 120 && room.state.phase === Phase.Playing; i++) {
      await room.waitForNextPatch();
      for (const c of clients) {
        const me = room.state.players.get(c.sessionId)!;
        const received = c.state.players as Map<string, any>;
        for (const [id, truth] of room.state.players) {
          const got = received.get(id);
          const isMe = id === me.id;
          if (!got) {
            if (!isMe) hiddenSeen++;
            continue;
          }
          checks++;
          // 1. Only players I can (nearly) see, or my own frozen Leader.
          const visible =
            isMe ||
            canSee(me, truth, visionRadius(me) + MOVE_SLACK) ||
            (truth.role === "leader" && truth.team === me.team) ||
            dist(me, truth) <= visionRadius(me) + MOVE_SLACK;
          expect(visible, `${me.nickname} received hidden ${truth.nickname}`).toBe(true);

          // 2. Secrets only when allowed.
          const mayKnow =
            isMe ||
            (truth.secretRole === "detective" && truth.team === me.team) ||
            (truth.secretRole === "spy" && truth.realTeam === me.realTeam);
          if (!mayKnow) {
            expect(got.secretRole ?? "", `${me.nickname} learned ${truth.nickname}'s role`).toBe("");
            expect(got.realTeam ?? "", `${me.nickname} learned ${truth.nickname}'s real team`).toBe("");
          }
          // Hard rule: the word "spy" only ever reaches the spy's real team.
          if (got.secretRole === "spy") expect(truth.realTeam).toBe(me.realTeam);

          // 3. Iced hand only up close.
          if (got.icedHand && !isMe) {
            expect(dist(me, truth)).toBeLessThanOrEqual(CONFIG.vision.nearRadius + MOVE_SLACK);
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(100);
    expect(hiddenSeen).toBeGreaterThan(0); // vision really hides people
  });

  it("everything is revealed after the round", async () => {
    const room = await colyseus.createRoom(ROOM_NAME, {});
    const host = await colyseus.connectTo(room, { nickname: "Host" });
    host.send(ClientMsg.AddBots, {});
    await room.waitForNextMessage();
    host.send(ClientMsg.Start);
    await room.waitForNextMessage();

    // End it: freeze one real team.
    for (const p of room.state.players.values()) if (p.realTeam === "green") p.frozen = true;
    await room.waitForNextTimestep();
    expect(room.state.phase).toBe(Phase.Ended);
    await room.waitForNextPatch();
    await room.waitForNextPatch();

    const received = host.state.players as Map<string, any>;
    expect(received.size).toBe(room.state.players.size);
    const spies = [...received.values()].filter((p) => p.secretRole === "spy");
    expect(spies.length).toBe(2);
  });
});
