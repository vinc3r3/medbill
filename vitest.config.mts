import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // Integration tests hit real Supabase; run them only via `npm run test:db`.
    exclude: ['node_modules/**', '.next/**', ...(process.env.VITEST_DB ? [] : ['**/*.integration.test.ts'])],
  },
});
