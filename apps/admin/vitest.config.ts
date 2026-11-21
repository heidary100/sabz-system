import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Large jsdom grids render for several seconds when all workers run in
    // parallel; the default 5s timeout produced load-dependent flakes.
    testTimeout: 15_000,
  },
})