import { defineConfig } from "vite";

export default defineConfig({
  build: { chunkSizeWarningLimit: 2000 }, // Phaser alone is ~1.4 MB
  server: {
    port: 5173,
    host: true, // reachable from phones on the same wifi
  },
});
