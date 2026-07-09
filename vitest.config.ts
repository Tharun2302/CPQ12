import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Pure-utility tests run in node. Component tests must opt into jsdom with a
      // `// @vitest-environment jsdom` docblock (environmentMatchGlobs was removed in Vitest 4)
      environment: 'node',
      include: ['tests/**/*.test.{ts,tsx}'],
      setupFiles: ['tests/setup.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/utils/**', 'src/services/**'],
        // Global 80% gate deferred until coverage grows; enforce only on tested modules
        thresholds: {
          'src/utils/pricing.ts': { statements: 80, branches: 70, functions: 80 },
          'src/utils/configDuration.ts': { statements: 90, branches: 80, functions: 100 },
          'src/utils/tierScenario.ts': { statements: 90, branches: 80, functions: 100 },
        },
      },
    },
  }),
);
