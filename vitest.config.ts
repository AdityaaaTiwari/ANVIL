import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "dist/**",
      "coverage/**",
      "catalog/**",
      "node_modules/**",
      ...(process.env.ANVIL_DOCKER_IMAGE ? [] : ["tests/container-sandbox.integration.test.ts"]),
    ],
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 60000,
    pool: "forks",
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["dist/**", "coverage/**", "tests/**", "*.config.ts", ".anvil/**"],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 50,
      },
    },
  },
});
