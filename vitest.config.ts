import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: { provider: 'v8', include: ['src/**', 'shared/**', 'server/**', 'extension/**'] },
    projects: [
      {
        // shared/, server/ and extension/ are plain logic and run in milliseconds; only the UI pays for a DOM.
        test: { name: 'logic', include: ['{shared,server,extension}/**/*.test.ts'], environment: 'node' },
      },
      {
        plugins: [react()],
        test: { name: 'ui', include: ['src/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['./src/setupTests.ts'] },
      },
    ],
  },
});
