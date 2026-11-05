import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Project-page deploy: https://yakovkhalinsky.github.io/microkorg-xl-editor/
  base: '/microkorg-xl-editor/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
