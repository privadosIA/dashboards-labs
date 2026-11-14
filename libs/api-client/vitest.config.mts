import { defineConfig } from 'vitest/config';

// The integration test talks to the real mock of the API. Starting a process needs Node, not the browser-like
// bundle the specs are built into, so the mock is started here (globalSetup runs in Node) and its address is
// handed to the specs with `inject('mockUrl')`.
export default defineConfig({
  test: {
    globalSetup: ['./libs/api-client/vitest.mock-setup.mts'],
  },
});
