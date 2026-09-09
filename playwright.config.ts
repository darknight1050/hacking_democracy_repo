import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile.spec.ts',
  workers: 1,
  outputDir: '.local/browser-results',
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ?? `http://${process.env.DEV_HOST ?? '127.0.0.1'}:3000`,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
});
