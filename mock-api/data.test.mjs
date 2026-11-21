// The data of the server as the mock simulates it: the status, the import, the cleaning and the export.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMock } from './testkit.mjs';
import { unzip } from './zip.mjs';
import { ENTITIES } from './data.mjs';

const filesOf = (status, entity) => status.legacy_files.find((f) => f.entity === entity);

test('the status names the engine, the migrations, the rows of each table and the files left behind per entity', async () => {
  const mock = await startMock();
  try {
    const { status, body } = await mock.json('GET', '/api/data/status');
    assert.equal(status, 200);
    assert.equal(body.engine, 'sqlite');
    assert.ok(body.migrations.applied.length > 0);
    assert.deepEqual(body.migrations.pending, []);
    const projects = body.tables.find((t) => t.name === 'projects');
    assert.equal(projects.rows, 2);
    assert.deepEqual(body.imports, []);
    assert.deepEqual(body.legacy_files.map((f) => f.entity), ENTITIES);
    assert.ok(filesOf(body, 'prompts').files > 0);
    assert.equal(filesOf(body, 'prompts').bytes, filesOf(body, 'prompts').files * 2048);
  } finally {
    mock.stop();
  }
});

test('importing moves the entities to done with a record; the files left behind stay until they are cleaned', async () => {
  const mock = await startMock();
  try {
    const before = (await mock.json('GET', '/api/data/status')).body;
    const imported = await mock.json('POST', '/api/data/import', {});
    assert.equal(imported.status, 200);
    assert.deepEqual(imported.body.imports.map((r) => r.entity), ENTITIES);
    assert.ok(imported.body.imports.every((r) => r.state === 'done' && r.started_at && r.finished_at));

    const after = (await mock.json('GET', '/api/data/status')).body;
    assert.equal(after.imports.length, ENTITIES.length);
    assert.equal(filesOf(after, 'prompts').files, filesOf(before, 'prompts').files);

    // a file that cannot be read is skipped and named
    const prompts = after.imports.find((r) => r.entity === 'prompts');
    assert.equal(prompts.skipped.length, 1);
    assert.match(prompts.skipped[0].path, /broken-preset/);

    // a second import without an entity has nothing left to do
    assert.deepEqual((await mock.json('POST', '/api/data/import', {})).body.imports, []);
  } finally {
    mock.stop();
  }
});

test('an unknown entity is a 404 that names the ones that exist; a second import while one runs is a 409', async () => {
  const mock = await startMock({ env: { MOCK_IMPORT_MS: '400' } });
  try {
    const missing = await mock.json('POST', '/api/data/import', { entity: 'nothing' });
    assert.equal(missing.status, 404);
    for (const e of ENTITIES) assert.ok(missing.body.error.message.includes(e), e);

    const running = mock.json('POST', '/api/data/import', {});
    await new Promise((ok) => setTimeout(ok, 100));
    const second = await mock.json('POST', '/api/data/import', {});
    assert.equal(second.status, 409);
    assert.equal((await running).status, 200);
    assert.equal((await mock.json('POST', '/api/data/import', { entity: 'settings' })).status, 200);
  } finally {
    mock.stop();
  }
});

test('an entity can be imported again whatever its state, and a failed import is undone and can be repeated', async () => {
  const mock = await startMock({ env: { MOCK_DATA_FAIL: 'motions' } });
  try {
    const first = (await mock.json('POST', '/api/data/import', {})).body.imports;
    const failed = first.find((r) => r.entity === 'motions');
    assert.equal(failed.state, 'failed');
    assert.equal(failed.created, 0);
    assert.match(failed.error, /undone/);

    // the entities that failed are imported again by a plain import
    const retry = (await mock.json('POST', '/api/data/import', {})).body.imports;
    assert.deepEqual(retry.map((r) => [r.entity, r.state]), [['motions', 'done']]);

    const again = (await mock.json('POST', '/api/data/import', { entity: 'settings' })).body.imports;
    assert.equal(again.length, 1);
    assert.equal(again[0].state, 'done');
  } finally {
    mock.stop();
  }
});

test('cleaning refuses, deleting nothing, an entity that was not imported cleanly, and removes the files of those that were', async () => {
  const mock = await startMock();
  try {
    const notYet = await mock.json('POST', '/api/data/legacy/clean', { entities: ['settings'] });
    assert.equal(notYet.status, 409);

    await mock.json('POST', '/api/data/import', {});
    // `prompts` skipped a file: the request is refused as a whole and `settings` keeps its file as well
    const mixed = await mock.json('POST', '/api/data/legacy/clean', { entities: ['settings', 'prompts'] });
    assert.equal(mixed.status, 409);
    assert.equal(filesOf((await mock.json('GET', '/api/data/status')).body, 'settings').files, 1);

    assert.equal((await mock.json('POST', '/api/data/legacy/clean', { entities: ['nothing'] })).status, 404);
    assert.equal((await mock.json('POST', '/api/data/legacy/clean', { entities: [] })).status, 400);
    assert.equal((await mock.json('POST', '/api/data/legacy/clean', {})).status, 400);

    const cleaned = await mock.json('POST', '/api/data/legacy/clean', { entities: ['settings'] });
    assert.deepEqual(cleaned.body, { cleaned: [{ entity: 'settings', deleted: 1, bytes: 2048 }] });
    assert.deepEqual(filesOf((await mock.json('GET', '/api/data/status')).body, 'settings'), { entity: 'settings', files: 0, bytes: 0 });

    // importing the entity that skipped a file again (the person fixed it) ends clean, and then it can be cleaned
    await mock.json('POST', '/api/data/import', { entity: 'prompts' });
    assert.equal((await mock.json('POST', '/api/data/legacy/clean', { entities: ['prompts'] })).status, 200);
  } finally {
    mock.stop();
  }
});

test('the export is a zip that opens: a manifest and one .jsonl per table, with no secret', async () => {
  const mock = await startMock();
  try {
    await mock.json('PUT', '/api/settings', { heartmula_host: 'musica.local', heartmula_token: 'super-secret-token' });
    const res = await mock.get('/api/data/export');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="mediaorquestator-data-\d{8}-\d{6}\.zip"$/);

    const files = unzip(Buffer.from(await res.arrayBuffer()));
    assert.ok(files.every((f) => f.crcOk), 'every CRC matches');
    const names = files.map((f) => f.name);
    assert.ok(names.includes('manifest.json'));

    const status = (await mock.json('GET', '/api/data/status')).body;
    for (const t of status.tables) {
      const file = files.find((f) => f.name === `${t.name}.jsonl`);
      assert.ok(file, `${t.name}.jsonl`);
      assert.equal(file.data.toString().split('\n').filter(Boolean).length, t.rows, `rows of ${t.name}`);
    }
    const manifest = JSON.parse(files.find((f) => f.name === 'manifest.json').data.toString());
    assert.equal(manifest.engine, 'sqlite');
    assert.ok(manifest.migrations.length > 0);
    assert.ok(!files.some((f) => f.data.toString().includes('super-secret-token')));
  } finally {
    mock.stop();
  }
});

test('with a token set the export wants the token: a ticket is accepted only where the contract lists it', async () => {
  const mock = await startMock({ args: ['--token', 'secret'] });
  try {
    const bearer = { headers: { Authorization: 'Bearer secret' } };
    const ticket = (await (await fetch(`${mock.base}/api/auth/ticket`, { method: 'POST', ...bearer })).json()).ticket;
    assert.equal((await fetch(`${mock.base}/api/data/export`)).status, 401);
    assert.equal((await fetch(`${mock.base}/api/data/export?ticket=${ticket}`)).status, 401, 'the export is not a route that takes a ticket');
    assert.equal((await fetch(`${mock.base}/api/data/export`, bearer)).status, 200);
    // a route that does list it still takes it
    assert.equal((await fetch(`${mock.base}/api/projects/demo/artifacts/out/x.png?ticket=${ticket}`)).status, 200);
  } finally {
    mock.stop();
  }
});
