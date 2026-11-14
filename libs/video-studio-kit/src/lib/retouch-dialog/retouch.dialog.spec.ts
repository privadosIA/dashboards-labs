import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';
import { Subject, of, type Observable } from 'rxjs';

import { VIDEO_STUDIO_OPTIONS } from '../core/options';
import { stubStorage } from '../../testing/memory-storage';
import { DEMO_IMAGE_MODELS } from '../retouch/in-memory.adapter';
import type { EditRequest, EditResult, ImageModel } from '../retouch/model';
import { IMAGE_EDIT } from '../retouch/tokens';
import type { StartImage } from '../video/model';
import { RetouchDialog } from './retouch.dialog';

const original: StartImage = { name: 'fox.png', dataUrl: 'data:image/png;base64,ORIGINAL' };
const result = (seed: number): EditResult => ({ seed, image: { name: `fox-${seed}.png`, dataUrl: `data:image/png;base64,V${seed}` } });

async function setup(lang: 'es' | 'en' = 'en', models$: Observable<readonly ImageModel[]> = of(DEMO_IMAGE_MODELS), memory = true) {
  stubStorage({ 'video-studio.lang': lang });
  const calls: EditRequest[] = [];
  const pending: Subject<readonly EditResult[]>[] = [];
  const port = {
    models: () => models$,
    edit: (request: EditRequest) => {
      calls.push(request);
      const answer = new Subject<readonly EditResult[]>();
      pending.push(answer);
      return answer;
    },
  };
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideLabForms({ lang }),
      { provide: VIDEO_STUDIO_OPTIONS, useValue: { lang, memory } },
      { provide: IMAGE_EDIT, useValue: port },
      { provide: MAT_DIALOG_DATA, useValue: original },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(RetouchDialog);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  await settle();

  const q = <T extends Element>(selector: string) => el.querySelector(selector) as T;
  const all = <T extends Element>(selector: string) => Array.from(el.querySelectorAll<T>(selector));
  const [prompt, negative] = all<HTMLTextAreaElement>('textarea');
  const [strength, variants] = all<HTMLInputElement>('input[type=number]');
  const write = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const click = async (target: HTMLElement) => {
    target.click();
    await settle();
  };
  const button = (label: string) => all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === label)!;
  const answer = async (n: number, results: readonly EditResult[]) => {
    pending[n].next(results);
    pending[n].complete();
    await settle();
  };
  return { fixture, el, q, all, prompt, negative, strength, variants, write, click, button, calls, pending, answer, close, settle };
}

describe('RetouchDialog', () => {
  it.each([[true, 1], [false, 0]])('with memory %s it shows the simulated note %s times', async (memory, count) => {
    const { el } = await setup('en', of(DEMO_IMAGE_MODELS), memory);
    expect(el.querySelectorAll('.note')).toHaveLength(count);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  it('opens with the original, the fields at their defaults, and retouching unavailable with the reason', async () => {
    const { el, q, prompt, negative, strength, variants, button } = await setup();
    expect(q<HTMLImageElement>('.original img').src).toBe(original.dataUrl);
    expect(prompt.value).toBe('');
    expect(negative.value).toBe('');
    expect(strength.value).toBe('0.6');
    expect(variants.value).toBe('2');
    expect(button('Retouch').disabled).toBe(true);
    expect(el.textContent).toContain('Write what you want to change.');
    expect(el.textContent).toContain('Simulated retouch');
  });

  it('retouches with what was written, negative prompt included, and shows the variants', async () => {
    const { all, prompt, negative, strength, variants, write, click, button, calls, answer } = await setup();
    await write(prompt, 'as a watercolor');
    await write(negative, 'blurry, extra fingers');
    await write(strength, '0.4');
    await write(variants, '3');
    expect(button('Retouch').disabled).toBe(false);
    await click(button('Retouch'));
    expect(calls).toEqual([{ image: original, model: DEMO_IMAGE_MODELS[0].id, prompt: 'as a watercolor', negativePrompt: 'blurry, extra fingers', strength: 0.4, variants: 3 }]);

    await answer(0, [result(1), result(2), result(3)]);
    expect(all('.variant')).toHaveLength(3);
    expect(all<HTMLImageElement>('.variant img').map((i) => i.src)).toEqual([result(1), result(2), result(3)].map((r) => r.image.dataUrl));
  });

  it('shows that it is retouching, and retouches once however many times it is asked', async () => {
    const { el, write, prompt, click, button, calls, pending, q } = await setup();
    await write(prompt, 'a fox');
    await click(button('Retouch'));
    await click(q<HTMLButtonElement>('button[type=submit]'));
    expect(calls).toHaveLength(1);
    expect(pending).toHaveLength(1);
    expect(el.querySelector('[role=status]')?.textContent).toContain('Retouching…');
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(true);
  });

  it('uses the variant chosen: it closes with that image, and only once one is chosen', async () => {
    const { write, prompt, click, button, answer, all, close } = await setup();
    await write(prompt, 'a fox');
    await click(button('Retouch'));
    await answer(0, [result(1), result(2)]);
    expect(button('Use this one').disabled).toBe(true);

    await click(all<HTMLElement>('.variant')[1]);
    expect(all<HTMLElement>('.variant')[1].getAttribute('aria-pressed')).toBe('true');
    expect(all<HTMLElement>('.variant')[0].getAttribute('aria-pressed')).toBe('false');
    expect(button('Use this one').disabled).toBe(false);
    await click(button('Use this one'));
    expect(close).toHaveBeenCalledExactlyOnceWith(result(2).image);
  });

  it('closes with nothing when cancelled, with or without variants', async () => {
    const first = await setup();
    await first.click(first.button('Cancel'));
    expect(first.close).toHaveBeenCalledExactlyOnceWith();

    TestBed.resetTestingModule();
    const second = await setup();
    await second.write(second.prompt, 'a fox');
    await second.click(second.button('Retouch'));
    await second.answer(0, [result(1)]);
    await second.click(second.all<HTMLElement>('.variant')[0]);
    await second.click(second.button('Cancel'));
    expect(second.close).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    ['strength', '0'],
    ['strength', '1.2'],
    ['variants', '0'],
    ['variants', '5'],
  ] as const)('does not retouch with a %s of %s and says what is accepted', async (field, value) => {
    const s = await setup();
    await s.write(s.prompt, 'a fox');
    expect(s.button('Retouch').disabled).toBe(false);
    await s.write(field === 'strength' ? s.strength : s.variants, value);
    expect(s.button('Retouch').disabled).toBe(true);
    expect(s.el.textContent).toContain(field === 'strength' ? 'The strength must be from 0.05 to 1.' : 'The variants must be a number from 1 to 4.');
    await s.click(s.q<HTMLButtonElement>('button[type=submit]'));
    expect(s.calls).toEqual([]);
  });

  it('shows a failure with its message, keeps what was written and the original, and lets it try again', async () => {
    const { el, q, prompt, negative, write, click, button, pending, calls, answer } = await setup();
    await write(prompt, 'a fox');
    await write(negative, 'blurry');
    await click(button('Retouch'));
    pending[0].error(new Error('the server is busy'));
    await click(q<HTMLElement>('.original'));

    expect(el.querySelector('[role=alert]')?.textContent).toContain('the server is busy');
    expect(prompt.value).toBe('a fox');
    expect(negative.value).toBe('blurry');
    expect(q<HTMLImageElement>('.original img').src).toBe(original.dataUrl);
    expect(button('Retouch').disabled).toBe(false);

    await click(button('Retouch'));
    expect(calls).toHaveLength(2);
    await answer(1, [result(1)]);
    expect(el.querySelector('[role=alert]')).toBeNull();
    expect(el.querySelectorAll('.variant')).toHaveLength(1);
  });

  it('replaces the variants when retouching again, with none chosen', async () => {
    const { write, prompt, click, button, answer, all } = await setup();
    await write(prompt, 'a fox');
    await click(button('Retouch'));
    await answer(0, [result(1), result(2)]);
    await click(all<HTMLElement>('.variant')[0]);

    await click(button('Retouch'));
    await answer(1, [result(3)]);
    expect(all('.variant')).toHaveLength(1);
    expect(all<HTMLElement>('.variant')[0].getAttribute('aria-pressed')).toBe('false');
    expect(button('Use this one').disabled).toBe(true);
  });

  describe('the model', () => {
    const choose = async (el: HTMLElement, settle: () => Promise<void>, name: string) => {
      el.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await settle();
      Array.from(document.querySelectorAll<HTMLElement>('mat-option'))
        .find((o) => o.textContent?.trim() === name)!
        .click();
      await settle();
    };

    it('has the first model of the port selected', async () => {
      const { el } = await setup();
      expect(el.querySelector('mat-select')?.textContent).toContain(DEMO_IMAGE_MODELS[0].name);
    });

    it('offers every model of the port', async () => {
      const { el, settle } = await setup();
      el.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
      await settle();
      expect(Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent?.trim())).toEqual(DEMO_IMAGE_MODELS.map((m) => (m.available ? m.name : `${m.name} (unavailable)`)));
    });

    it('retouches with the model chosen', async () => {
      const { el, settle, write, click, button, calls } = await setup();
      await choose(el, settle, 'Creative');
      // The form is drawn again when the model changes, so the box is looked up again.
      await write(el.querySelector('textarea')!, 'a fox');
      await click(button('Retouch'));
      expect(calls.map((c) => c.model)).toEqual(['creative']);
    });

    describe('a model that cannot be used', () => {
      const take = { strength: true, negativePrompt: true, maxVariants: 4 };
      const listed: readonly ImageModel[] = [
        { id: 'qwen', name: 'Qwen', description: 'needs files', available: false, reason: 'not installed', ...take },
        { id: 'sd', name: 'SD', description: 'the usual', available: true, ...take },
      ];
      const options = () => Array.from(document.querySelectorAll<HTMLElement>('mat-option'));

      it('is listed disabled with the suffix, the first usable one is selected, and retouching asks for it', async () => {
        const { el, settle, write, click, button, calls } = await setup('en', of(listed));
        expect(el.querySelector('mat-select')?.textContent).toContain('SD');
        el.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
        await settle();
        expect(options().map((o) => o.textContent?.trim())).toEqual(['Qwen (unavailable)', 'SD']);
        expect(options()[0].getAttribute('aria-disabled')).toBe('true');
        options()[0].click();
        await settle();
        expect(el.querySelector('mat-select')?.textContent).toContain('SD');
        await write(el.querySelector('textarea')!, 'a fox');
        await click(button('Retouch'));
        expect(calls.map((c) => c.model)).toEqual(['sd']);
      });

      it('writes the suffix in Spanish in a Spanish browser', async () => {
        const { el, settle } = await setup('es', of(listed));
        el.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
        await settle();
        expect(options()[0].textContent?.trim()).toBe('Qwen (no disponible)');
      });
    });

    describe('the fields follow the model', () => {
      const numbers = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLInputElement>('input[type=number]'));

      it('shows every field for a model that takes them all, with variants up to what it makes', async () => {
        const { el } = await setup();
        expect(el.querySelectorAll('textarea')).toHaveLength(2);
        expect(numbers(el)).toHaveLength(2);
        expect(el.textContent).toContain('Variants (1 to 4)');
      });

      it('shows neither the strength nor the negative prompt for a model that takes none, and asks the port without them', async () => {
        const { el, settle, write, click, button, calls } = await setup();
        await choose(el, settle, 'Creative');
        expect(el.querySelectorAll('textarea')).toHaveLength(1);
        expect(el.textContent).not.toContain('Strength');
        expect(el.textContent).not.toContain('Negative prompt');
        await write(el.querySelector('textarea')!, 'a fox');
        await click(button('Retouch'));
        expect(calls).toHaveLength(1);
        expect(calls[0].model).toBe('creative');
        expect(calls[0].variants).toBe(1);
      });

      it('has no variants to choose from a model that makes one', async () => {
        const { el, settle } = await setup();
        await choose(el, settle, 'Creative');
        expect(el.textContent).not.toContain('Variants');
        expect(numbers(el)).toHaveLength(0);
      });

      it('accepts as many variants as a model makes and refuses one more', async () => {
        const { el, settle, write, button } = await setup();
        await choose(el, settle, 'Detailed');
        expect(el.textContent).toContain('Variants (1 to 8)');
        await write(el.querySelector('textarea')!, 'a fox');
        const variants = () => numbers(el)[1];
        await write(variants(), '8');
        expect(button('Retouch').disabled).toBe(false);
        await write(variants(), '9');
        expect(button('Retouch').disabled).toBe(true);
        expect(el.textContent).toContain('The variants must be a number from 1 to 8.');
      });

      it('keeps what was written when the model changes, and brings the variants down to what the new model makes', async () => {
        const { el, settle, write, click, button, calls } = await setup();
        await choose(el, settle, 'Detailed');
        await write(el.querySelector('textarea')!, 'a fox');
        await write(numbers(el)[1], '7');
        await choose(el, settle, 'Balanced');
        expect(el.querySelector('textarea')!.value).toBe('a fox');
        expect(numbers(el)[1].value).toBe('4');
        await click(button('Retouch'));
        expect(calls[0]).toMatchObject({ model: 'balanced', prompt: 'a fox', variants: 4 });
      });

      it('writes the range in Spanish in a Spanish browser', async () => {
        const { el, settle } = await setup('es');
        await choose(el, settle, 'Detailed');
        expect(el.textContent).toContain('Variantes (de 1 a 8)');
      });
    });

    it('takes the default when the list of models arrives after the dialog opened', async () => {
      const late = new Subject<readonly ImageModel[]>();
      const { el, settle, write, click, button, calls } = await setup('en', late);
      late.next([{ id: 'only', name: 'Only', description: 'the one', available: true, strength: true, negativePrompt: true, maxVariants: 4 }]);
      await settle();
      expect(el.querySelector('mat-select')?.textContent).toContain('Only');
      // The form is drawn again when the list arrives, so the box is looked up again.
      await write(el.querySelector('textarea')!, 'a fox');
      await click(button('Retouch'));
      expect(calls.map((c) => c.model)).toEqual(['only']);
    });
  });

  describe('the language', () => {
    it('gives the reason in Spanish in a Spanish browser', async () => {
      const { el, button } = await setup('es');
      expect(el.textContent).toContain('Escribe qué quieres cambiar.');
      expect(el.textContent).toContain('Retoque simulado');
      expect(button('Retocar').disabled).toBe(true);
    });

    it('gives the strength message in Spanish in a Spanish browser', async () => {
      const { el, strength, write } = await setup('es');
      await write(strength, '1.2');
      expect(el.textContent).toContain('La fuerza debe estar entre 0,05 y 1.');
    });
  });
});

describe('RetouchDialog look', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has its buttons at least as tall as the control token, a panel title, rounded variants and room between its blocks', async () => {
    await setup();
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(styles).toMatch(/\.actions[^{]*button[^{]*\{[^}]*min-height:\s*var\(--lab-control-h\)/);
    expect(styles).toMatch(/button\.primary[^{]*\{[^}]*min-height:\s*var\(--lab-control-h\)/);
    expect(styles).toMatch(/h2[^{]*\{[^}]*font-size:\s*var\(--lab-fs-title\)/);
    expect(styles).toMatch(/\.variant[^{]*\{[^}]*var\(--lab-radius-panel\)/);
    expect(styles).toMatch(/\.retouch[^{]*\{[^}]*gap:\s*var\(--lab-space-4\)/);
  });
});
