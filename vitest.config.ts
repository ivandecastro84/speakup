import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" só existe para o bundler do Next; nos testes é inócuo.
      "server-only": path.resolve(__dirname, "tests/support/vazio.ts"),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["tests/support/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://dev:dev@localhost:5432/speakup_test",
      SESSION_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
