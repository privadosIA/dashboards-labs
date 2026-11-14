import { TestBed } from '@angular/core/testing';

import type { PieceDetail } from '@lab/animation-core';
import { serverDetail } from '../../animation/server.fixture';
import { toDetail } from '../../animation/server-mapping';
import { MUSIC_MOTION_OPTIONS } from '../../core/options';
import { ProposalStrip } from './proposal-strip';

const detail = (extra: Partial<PieceDetail> = {}): PieceDetail => ({ ...toDetail(serverDetail()), ...extra });

function create(piece: PieceDetail, lang: 'es' | 'en' = 'en') {
  TestBed.configureTestingModule({ providers: [{ provide: MUSIC_MOTION_OPTIONS, useValue: { lang, client: 'video-anim' } }] });
  const fixture = TestBed.createComponent(ProposalStrip);
  fixture.componentRef.setInput('piece', piece);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ProposalStrip', () => {
  it('shows nothing for a piece with no proposal', () => {
    expect(create(detail()).el.querySelector('[data-testid="proposal-strip"]')).toBeNull();
  });

  it('says how long a running proposal has been going, and no part yet', () => {
    const { el } = create(detail({ proposal: { state: 'writing', what: 'all', model: 'gemma4:26b', startedAt: Date.now() - 75_000 } }));
    expect(el.querySelector('[data-testid="proposal-elapsed"]')!.textContent).toContain('Running for 1 min');
    expect(el.querySelector('[data-testid="proposal-model"]')!.textContent).toContain('gemma4:26b');
    expect(el.querySelector('[data-testid="proposal-parts"]')).toBeNull();
  });

  it('says how long a finished proposal took, and who wrote the design and the script, with no reason when the server gave none', () => {
    const { el } = create(detail({ proposal: { state: 'done', what: 'all', startedAt: 1_000, finishedAt: 46_000, design: { source: 'assistant' }, script: { source: 'fallback' } } }));
    expect(el.querySelector('[data-testid="proposal-elapsed"]')!.textContent).toContain('Running for 45 s');
    expect(el.querySelector('[data-testid="proposal-design"]')!.textContent).toContain('Design: written by the assistant');
    expect(el.querySelector('[data-testid="proposal-script"]')!.textContent).toContain('written by the fixed rule (not an error)');
  });

  it('shows the reason a proposal failed, for one that was interrupted', () => {
    const { el } = create(detail({ proposal: { state: 'failed', what: 'all', startedAt: 1, error: 'the server stopped while it was writing' } }));
    expect(el.querySelector('[data-testid="proposal-strip"]')!.getAttribute('data-state')).toBe('failed');
    expect(el.querySelector('[data-testid="proposal-error"]')!.textContent).toContain('the server stopped while it was writing');
  });

  it('speaks Spanish', () => {
    const { el } = create(detail({ proposal: { state: 'waiting', what: 'all', startedAt: Date.now() } }), 'es');
    expect(el.textContent).toContain('Esperando a que acabe una ejecución');
  });
});
