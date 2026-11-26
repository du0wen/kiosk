import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

config({ path: "../../.env" });
config({ path: ".env" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB-integration tests run serially against one test database.
    fileParallelism: false,
    // Integration tests make several round-trips to remote Neon; be generous.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
