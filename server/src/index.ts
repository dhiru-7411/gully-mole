/**
 * Server entry point. Listens on $PORT (Render sets it) or 2567 locally.
 */
import { listen } from "colyseus";
import app from "./app.config";

listen(app, Number(process.env.PORT) || 2567);
