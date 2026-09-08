import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/.next/**', '**/docs/**'],
    alias: {
      '@': path.resolve(import.meta.dirname || __dirname, './src'),
    },
  },
});
