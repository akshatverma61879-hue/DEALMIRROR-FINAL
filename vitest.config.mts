import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // vmThreads: the default forks/threads pools fail before any test runs on Node 26 + vitest 5
  // ("Cannot read properties of undefined (reading 'config')").
  test: { include: ["src/**/*.test.ts"], pool: "vmThreads" },
});
