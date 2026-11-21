import { defineConfig } from '@playwright/test';

// The e2e suite runs against a REAL `orchestrator serve --web-dir` serving the built dashboard, over stub pipeline
// binaries. Launch it with: npm run dashboard-full:e2e  (which runs e2e/run-e2e.sh and sets E2E_BASE_URL).
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1:4670';

// Chromium's fake microphone: a test tone, no permission prompt. The phone projects dictate with it.
const FAKE_MIC = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    // The installed app's worker would answer requests before page.route sees them; the suite tests the pages, not the worker.
    serviceWorkers: 'block',
    // The suite's texts are Spanish: start every test with Spanish chosen (the
    // dashboard defaults to English); language.spec.ts clears this to test the default.
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: 'mo.lang', value: 'es' }] }],
    },
    trace: 'retain-on-failure',
  },
  // The default project is the desktop suite. The phone projects run only the specs
  // named *.mobile.spec.ts (`npm run e2e:mobile`), so the desktop run keeps its time.
  projects: [
    { name: 'desktop', testIgnore: /\.mobile\.spec\.ts$/ },
    {
      name: 'mobile',
      testMatch: /\.mobile\.spec\.ts$/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['microphone'], launchOptions: { args: FAKE_MIC } },
    },
    {
      name: 'landscape',
      testMatch: /\.mobile\.spec\.ts$/,
      use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, permissions: ['microphone'], launchOptions: { args: FAKE_MIC } },
    },
  ],
});
