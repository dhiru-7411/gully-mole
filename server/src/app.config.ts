import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME } from "@gully/shared";
import { GullyRoom } from "./rooms/GullyRoom";

const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(GullyRoom),
  },

  express: (app) => {
    // Health check (Render pings this; also handy to see the server is awake).
    app.get("/health", (_req, res) => {
      res.send("ok");
    });
  },
});

export default server;
