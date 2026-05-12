import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/eval_skills/**/*.test.ts"],
    environment: "node",
  },
});
