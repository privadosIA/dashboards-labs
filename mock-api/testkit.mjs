// A running mock for a test: it starts `server.mjs` on a free port with the environment the test asks for, and stops it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

/** Starts the mock (`env` adds variables such as `MOCK_BULK`, `args` adds options) and answers `{ base, stop, get, send }`. */
export async function startMock({ env = {}, args = [] } = {}) {
  // Many tests start a mock at once: the free port found a moment ago can be taken by another before this one binds it, and the mock then exits at once. A start that fails like that is tried again.
  let port;
  let child;
  for (let attempt = 1; ; attempt++) {
    port = await freePort();
    child = spawn(process.execPath, [resolve(here, 'server.mjs'), '--port', String(port), ...(process.env.SPEC ? ['--spec', process.env.SPEC] : []), ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, ...env },
    });
    try {
      await new Promise((ok, no) => {
        child.stdout.on('data', (d) => /on http/.test(String(d)) && ok());
        child.on('exit', (c) => no(new Error(`the mock exited with ${c}`)));
      });
      break;
    } catch (e) {
      if (attempt >= 4) throw e;
    }
  }
  const base = `http://127.0.0.1:${port}`;
  const send = (method, path, body) =>
    fetch(`${base}${path}`, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return {
    base,
    stop: () => child.kill(),
    send,
    get: (path) => send('GET', path),
    /** The JSON of an answer with its status and headers: `{ status, body, headers }`. */
    json: async (method, path, body) => {
      const res = await send(method, path, body);
      const text = await res.text();
      return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined };
    },
  };
}
