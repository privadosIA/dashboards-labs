import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

let mock: ChildProcess | undefined;

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => done(port));
    });
  });
}

export default async function setup(project: TestProject): Promise<() => void> {
  const port = await freePort();
  const server = resolve(process.cwd(), 'mock-api/server.mjs');
  const child = spawn(process.execPath, [server, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  mock = child;
  await new Promise<void>((ready, fail) => {
    const timer = setTimeout(() => fail(new Error('the mock of the API did not start in 10 s')), 10_000);
    child.once('error', fail);
    child.once('exit', (code) => fail(new Error(`the mock of the API exited with ${code}`)));
    child.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('mock orchestrator API on')) {
        clearTimeout(timer);
        ready();
      }
    });
  });
  project.provide('mockUrl', `http://127.0.0.1:${port}`);
  return () => {
    mock?.kill();
  };
}
