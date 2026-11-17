import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{shared,server,client}/test/**/*.test.ts"],
    // Integration tests boot a real server on a port; run files one at a time.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
