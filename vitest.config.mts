import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // TASK-MULSCEK4JHK8X — tests exercise the demo sign-in path, which is off
    // unless this says otherwise (src/lib/demo-login.ts).
    env: { DEMO_LOGIN_ENABLED: 'true' },
    exclude: ['**/node_modules/**', '**/dist/**', '**/tests/e2e/**', '**/.next/**', '**/docs/**', '**/.claude/worktrees/**'],
    alias: {
      '@': path.resolve(import.meta.dirname || __dirname, './src'),
    },
  },
});
