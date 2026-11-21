import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';

import { RequestPlan } from '../core/api.models';
import { ALL_AVAILABLE } from '../core/availability.fake';
import { AvailabilityStore } from '../core/availability.store';
import { EnvironmentStore } from '../core/environment.store';
import { PhoneService } from '../core/phone.service';
import { CreateFlowService } from './create-flow.service';
import { CreatePageComponent } from './create-page.component';

const q = (el: HTMLElement, id: string) => el.querySelector(`[data-testid=${id}]`) as HTMLElement | null;
const sheetRow = (option: string) => document.querySelector(`[data-testid="sheet-action"][data-option="${option}"]`) as HTMLElement | null;

async function answerPlan(http: HttpTestingController, body: object) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r));
    for (const r of http.match((x) => /\/(music\/engines|assets\/catalog|environment)(\?|$)/.test(x.url))) r.flush({});
    const found = http.match((x) => x.url.endsWith('/assist/request'));
    if (found.length > 0) return found[0].flush(body);
  }
  throw new Error('the plan request never came');
}

// The options of the card on a phone are chosen in bottom sheets (specs/mobile-create).
describe('CreatePageComponent on a phone', () => {
  async function mount() {
    TestBed.configureTestingModule({
      imports: [MatBottomSheetModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PhoneService, useValue: { phone: signal(true) } },
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
      ],
    });
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    TestBed.inject(EnvironmentStore).report.set({ binaries: [], models: [], voices: [], loras: [], gpus: [], dictation: { available: true } } as never);
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(CreatePageComponent);
    fixture.detectChanges();
    http.match((r) => r.url.endsWith('/projects')).forEach((r) => r.flush([]));
    http.match(() => true).forEach((r) => r.flush({}));
    fixture.detectChanges();
    const flow = TestBed.inject(CreateFlowService);
    const plan: RequestPlan = { kind: 'video', kind_source: 'model', title: 'Gato', image_prompt: 'A cat.', motion_prompt: 'It sways.', instrumental: false, warnings: [] };
    const sent = flow.submit('un gato', []);
    await answerPlan(http, plan);
    await sent;
    TestBed.inject(AvailabilityStore).data.set(ALL_AVAILABLE);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, flow };
  }

  afterEach(async () => {
    document.querySelectorAll<HTMLElement>('.cdk-overlay-backdrop').forEach((b) => b.click());
    await vi.waitFor(() => expect(document.querySelector('mat-bottom-sheet-container')).toBeNull());
  });

  it('shows the kind and the resolution as single lines, not as rows of buttons', async () => {
    const { el } = await mount();
    expect(q(el, 'create-kinds')?.tagName).toBe('BUTTON');
    expect(q(el, 'create-levels')?.tagName).toBe('BUTTON');
    expect(q(el, 'create-kinds')?.textContent).toContain('Vídeo');
    expect(el.querySelector('mat-button-toggle[data-testid="kind-video"]')).toBeNull();
  });

  it('changing the resolution: the line opens a sheet and the choice changes the draft', async () => {
    const { fixture, el, flow } = await mount();
    q(el, 'create-levels')!.click();
    TestBed.tick();
    expect(sheetRow('level-auto')).not.toBeNull();
    sheetRow('level-draft')!.click();
    fixture.detectChanges();
    expect(flow.items()[0].draft()?.resolution).toBe('draft');
    expect(q(el, 'create-levels')?.textContent).toContain('Borrador');
  });

  it('changing the kind to a song brings the song options, with the same effect as the buttons', async () => {
    const { fixture, el, flow } = await mount();
    q(el, 'create-kinds')!.click();
    TestBed.tick();
    sheetRow('kind-music')!.click();
    fixture.detectChanges();
    expect(flow.items()[0].draft()?.kind).toBe('music');
    expect(q(el, 'create-lengths')?.tagName).toBe('BUTTON');
    expect(q(el, 'create-instrumental')).not.toBeNull();
  });

  it('the length of a song is chosen in a sheet too', async () => {
    const { fixture, el, flow } = await mount();
    flow.setKind(flow.items()[0], 'music');
    fixture.detectChanges();
    q(el, 'create-lengths')!.click();
    TestBed.tick();
    sheetRow('length-long')!.click();
    fixture.detectChanges();
    expect(flow.items()[0].draft()?.seconds).toBeGreaterThan(flow.items()[0].draft() ? 0 : 1);
    expect(q(el, 'create-lengths')?.textContent).toContain('Larga');
  });
});
