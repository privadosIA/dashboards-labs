import { ApiError } from '@lab/api-client';
import { type Observable, firstValueFrom, of, throwError } from 'rxjs';

import { DatasetFailed } from './port';
import { ServerDataset, type DatasetApi } from './server.adapter';

/** An API client that records its calls and answers what it is told. */
function fakeApi(answer: (path: string) => Observable<unknown>) {
  const calls: Array<{ path: string; body: unknown }> = [];
  const api = {
    post: (path: string, options?: { body?: unknown }) => {
      calls.push({ path, body: options?.body });
      return answer(path);
    },
  } as unknown as DatasetApi;
  return { api, calls };
}

describe('ServerDataset', () => {
  it('sends the file as text to the preview, with the mode for music, and reads the counts', async () => {
    const { api, calls } = fakeApi(() => of({ yaml: 'project: x', report: 'ok', entries: 5, imported: 4, silent: 0, instrumental: 2, rejected: 1 }));
    const preview = await firstValueFrom(new ServerDataset(api).preview('[{"a":1}]', 'music'));
    expect(calls).toEqual([{ path: '/api/import/preview', body: { content: '[{"a":1}]', mode: 'music' } }]);
    expect(preview).toEqual({ yaml: 'project: x', report: 'ok', entries: 5, imported: 4, quiet: 2, rejected: 1 });
  });

  it('leaves the mode out for video (the server\'s default) and counts the silent scenes as quiet', async () => {
    const { api, calls } = fakeApi(() => of({ yaml: 'y', report: 'r', entries: 3, imported: 3, silent: 1, rejected: 0 }));
    const preview = await firstValueFrom(new ServerDataset(api).preview('x', 'video'));
    expect(calls[0].body).toEqual({ content: 'x' });
    expect(preview.quiet).toBe(1);
  });

  it('sends mode motion and counts the silent graphics as quiet', async () => {
    const { api, calls } = fakeApi(() => of({ yaml: 'y', report: 'r', entries: 2, imported: 2, silent: 2, rejected: 0 }));
    const preview = await firstValueFrom(new ServerDataset(api).preview('x', 'motion'));
    expect(calls[0].body).toEqual({ content: 'x', mode: 'motion' });
    expect(preview.quiet).toBe(2);
  });

  it('reads the entries and the report when the server answers a list and an object', async () => {
    const { api } = fakeApi(() => of({ yaml: 'y', report: { took: 2 }, entries: [{}, {}, {}], imported: 3, rejected: 0 }));
    const preview = await firstValueFrom(new ServerDataset(api).preview('x', 'music'));
    expect(preview.entries).toBe(3);
    expect(preview.report).toContain('"took": 2');
  });

  it('sends the id and the previewed file to confirm and answers the id the server made', async () => {
    const { api, calls } = fakeApi(() => of({ id: 'mis-canciones' }));
    expect(await firstValueFrom(new ServerDataset(api).confirm('mis-canciones', 'project: x'))).toBe('mis-canciones');
    expect(calls).toEqual([{ path: '/api/import/confirm', body: { id: 'mis-canciones', yaml: 'project: x' } }]);
  });

  describe('when the server says no', () => {
    const fail = async (status: number, message: string, call: 'preview' | 'confirm') => {
      const { api } = fakeApi(() => throwError(() => new ApiError(status, 'unknown', message)));
      const port = new ServerDataset(api);
      const result: Observable<unknown> = call === 'preview' ? port.preview('x', 'music') : port.confirm('a', 'y');
      return firstValueFrom(result).catch((e) => e as DatasetFailed);
    };

    it('says the id is taken on a 409', async () => {
      expect(((await fail(409, 'exists', 'confirm')) as DatasetFailed).kind).toBe('taken');
    });

    it('says the file was rejected on a 400 or 422 of the preview', async () => {
      expect(((await fail(422, 'bad json', 'preview')) as DatasetFailed).kind).toBe('rejected');
      expect(((await fail(400, 'bad json', 'preview')) as DatasetFailed).detail).toBe('bad json');
    });

    it('says the name is not valid when the server complains about the id', async () => {
      expect(((await fail(400, 'invalid id', 'confirm')) as DatasetFailed).kind).toBe('invalidName');
    });

    it('says it cannot be reached for anything else', async () => {
      expect(((await fail(0, 'no answer', 'preview')) as DatasetFailed).kind).toBe('unreachable');
      expect(((await fail(500, 'boom', 'confirm')) as DatasetFailed).kind).toBe('unreachable');
    });
  });

  it('asks for an images project when told to, on the preview and on the confirm, and not otherwise', async () => {
    const { api, calls } = fakeApi(() => of({ yaml: 'y', report: 'r', entries: 1, imported: 1, silent: 0, rejected: 0, id: 'p' }));
    const server = new ServerDataset(api);
    await firstValueFrom(server.preview('x', 'video', { outputMode: 'images' }));
    await firstValueFrom(server.confirm('p', 'y', { outputMode: 'images' }));
    await firstValueFrom(server.preview('x', 'video'));
    await firstValueFrom(server.confirm('p', 'y'));
    expect(calls.map((c) => c.body)).toEqual([{ content: 'x', output_mode: 'images' }, { id: 'p', yaml: 'y', output_mode: 'images' }, { content: 'x' }, { id: 'p', yaml: 'y' }]);
  });
});
