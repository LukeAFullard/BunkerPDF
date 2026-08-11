import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/lib/**/*.test.ts',
      'tests/lib/**/*.spec.ts',
      'tests/testTableExtraction.spec.ts',
      'tests/testTableExtractionLogic.spec.ts',
      'scripts/**/*.test.ts',
    ],
    server: {
      deps: {
        inline: [/@llamaindex\/liteparse-wasm/]
      }
    }
  },
});
