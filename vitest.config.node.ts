import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts', 'scripts/**/*.test.ts'],
    server: {
      deps: {
        inline: [/@llamaindex\/liteparse-wasm/]
      }
    }
  },
});
