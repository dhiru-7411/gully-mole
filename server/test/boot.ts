/**
 * Start a test server on the port we ask for.
 *
 * @colyseus/testing's boot() ignores the port when given a ready-made Server
 * (it always uses 2568), so another game server on this machine made every
 * room test fail with EADDRINUSE. This listens on the requested port instead.
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";

type Config = Parameters<typeof boot>[0];

export async function bootOn(config: Config, port: number): Promise<ColyseusTestServer> {
  const server = config as { listen?: (port: number) => Promise<unknown> };
  if (typeof server.listen === "function") {
    await server.listen(port);
    return new ColyseusTestServer(config as ConstructorParameters<typeof ColyseusTestServer>[0]);
  }
  return boot(config, port);
}
