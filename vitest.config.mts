import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    // Integration tests hit real services (Supabase, Claude); run them via `npm run test:db` / `npm run test:ai`.
    exclude: ['node_modules/**', '.next/**', ...(process.env.VITEST_INTEGRATION ? [] : ['**/*.integration.test.ts'])],
  },
});
