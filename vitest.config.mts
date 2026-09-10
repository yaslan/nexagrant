import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/.next/**', '**/docs/**', '**/.claude/worktrees/**'],
    alias: {
      '@': path.resolve(import.meta.dirname || __dirname, './src'),
    },
  },
});
