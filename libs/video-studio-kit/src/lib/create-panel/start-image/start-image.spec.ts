import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideLabForms } from '@lab/forms-kit';

import { stubStorage } from '../../../testing/memory-storage';
import { RETOUCHED, dialogClosed, retouchAndUse, stubImageEdit } from '../../../testing/retouch';
import { IMAGE_EDIT } from '../../retouch/tokens';
import { MAX_IMAGE_BYTES, StartImage } from './start-image';

function setup(lang: 'es' | 'en' = 'en') {
  stubStorage({ 'video-studio.lang': lang });
  const port = stubImageEdit();
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang }), { provide: IMAGE_EDIT, useValue: port }] });
  const fixture = TestBed.createComponent(StartImage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends Element>(selector: string) => el.querySelector(selector) as T;
  const pick = (file: File) => {
    const input = q<HTMLInputElement>('input[type=file]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el, q, pick, port, settle };
}

const file = (type = 'image/png', size = 10) => new File([new Uint8Array(size)], 'a.png', { type });

describe('StartImage', () => {
  it('has its image buttons at least as tall as the control token, the drop zone rounded as a panel, and room under it', () => {
    setup();
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(styles).toMatch(/\.btn[^{]*\{[^}]*min-height:\s*var\(--lab-control-h\)/);
    expect(styles).toMatch(/\.drop[^{]*\{[^}]*border-radius:\s*var\(--lab-radius-panel\)/);
    expect(styles).toMatch(/section[^{]*\{[^}]*margin-bottom:\s*var\(--lab-space-3\)/);
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    vi.unstubAllGlobals();
  });

  it('starts with a way to choose an image and no preview', () => {
    const { q } = setup();
    expect(q('input[type=file]')).not.toBeNull();
    expect(q('.preview')).toBeNull();
  });

  it('shows the Retouch and Delete buttons with the chosen image, in English, and none without it', async () => {
    const { fixture, q, pick } = setup();
    expect(q('.preview-actions')).toBeNull();
    pick(file());
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q('.preview img')).not.toBeNull();
    });
    expect(q<HTMLButtonElement>('.preview .retouch').tagName).toBe('BUTTON');
    expect(q<HTMLButtonElement>('.preview .delete').tagName).toBe('BUTTON');
    expect(q('.preview .retouch').textContent?.trim()).toBe('Retouch');
    expect(q('.preview .delete').textContent?.trim()).toBe('Delete');
  });

  it('writes the buttons in Spanish in a Spanish browser', async () => {
    const { fixture, q, pick } = setup('es');
    pick(file());
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q('.preview img')).not.toBeNull();
    });
    expect(q('.preview .retouch').textContent?.trim()).toBe('Retocar');
    expect(q('.preview .delete').textContent?.trim()).toBe('Borrar');
  });

  it('shows a preview of the chosen image, with a way to remove it', async () => {
    const { fixture, q, pick } = setup();
    pick(file());
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(q('.preview img')).not.toBeNull();
    });
    expect(q<HTMLImageElement>('.preview img').src).toContain('data:image/png');
    expect(fixture.componentInstance.image()?.name).toBe('a.png');

    q<HTMLButtonElement>('.preview .delete').click();
    fixture.detectChanges();
    expect(q('.preview')).toBeNull();
    expect(fixture.componentInstance.image()).toBeNull();
  });

  it('takes an image dropped on the zone', async () => {
    const { fixture, q } = setup();
    const drop = new Event('drop', { cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file()] } });
    q('.drop').dispatchEvent(drop);
    await vi.waitFor(() => expect(fixture.componentInstance.image()?.name).toBe('a.png'));
    expect(drop.defaultPrevented).toBe(true);
  });

  it('refuses a dropped file that is not an image', () => {
    const { fixture, el, q } = setup();
    const drop = new Event('drop', { cancelable: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file('application/pdf')] } });
    q('.drop').dispatchEvent(drop);
    fixture.detectChanges();
    expect(fixture.componentInstance.image()).toBeNull();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('not an image');
  });

  it('refuses a file that is not an image, with a message', () => {
    const { fixture, el, q, pick } = setup();
    pick(file('application/pdf'));
    fixture.detectChanges();
    expect(q('.preview')).toBeNull();
    expect(fixture.componentInstance.image()).toBeNull();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('not an image');
  });

  it('refuses an image over the size cap, with a message', () => {
    const { fixture, el, q, pick } = setup();
    pick(file('image/png', MAX_IMAGE_BYTES + 1));
    fixture.detectChanges();
    expect(q('.preview')).toBeNull();
    expect(fixture.componentInstance.image()).toBeNull();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('larger than 5 MB');
  });

  it('says it in Spanish in a Spanish browser', () => {
    const { fixture, el, pick } = setup('es');
    pick(file('application/pdf'));
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('no es una imagen');
  });

  describe('the retouch', () => {
    const withImage = (image = { name: 'fox.png', dataUrl: 'data:image/png;base64,ORIGINAL' }) => {
      const s = setup();
      s.fixture.componentInstance.image.set(image);
      return s;
    };
    const retouchButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.preview .retouch');

    it('is not offered without an image', () => {
      const { el } = setup();
      expect(retouchButton(el)).toBeNull();
      expect(document.querySelector('app-retouch-dialog')).toBeNull();
    });

    it('is offered with an image and opens the dialog with it', async () => {
      const { fixture, el, settle } = withImage();
      await settle();
      expect(retouchButton(el)?.textContent?.trim()).toBe('Retouch');
      retouchButton(el)!.click();
      await settle();
      expect(document.querySelector<HTMLImageElement>('app-retouch-dialog .original img')?.src).toBe('data:image/png;base64,ORIGINAL');
      expect(fixture.componentInstance.image()?.name).toBe('fox.png');
    });

    it('replaces the image with the variant used', async () => {
      const { fixture, el, settle, port } = withImage();
      await settle();
      retouchButton(el)!.click();
      await settle();
      await retouchAndUse(settle, 'as a watercolor', 1, 'blurry');
      expect(fixture.componentInstance.image()).toEqual(RETOUCHED[1]);
      expect(document.querySelector('app-retouch-dialog')).toBeNull();
      expect(el.querySelector<HTMLImageElement>('.preview img')?.src).toBe(RETOUCHED[1].dataUrl);
      expect(port.requests).toHaveLength(1);
      expect(port.requests[0]).toMatchObject({ prompt: 'as a watercolor', negativePrompt: 'blurry', image: { name: 'fox.png' } });
    });

    it('retouches with the default model, or with the one chosen', async () => {
      const { el, settle, port } = withImage();
      await settle();
      retouchButton(el)!.click();
      await settle();
      await retouchAndUse(settle);
      retouchButton(el)!.click();
      await settle();
      await retouchAndUse(settle, 'bolder', 0, '', 'Creative');
      expect(port.requests.map((r) => r.model)).toEqual(['balanced', 'creative']);
    });

    it('keeps the image when cancelled', async () => {
      const { fixture, el, settle } = withImage();
      await settle();
      retouchButton(el)!.click();
      await settle();
      Array.from(document.querySelectorAll<HTMLButtonElement>('app-retouch-dialog .actions button'))
        .find((b) => b.textContent?.trim() === 'Cancel')!
        .click();
      await dialogClosed(settle);
      expect(fixture.componentInstance.image()?.name).toBe('fox.png');
    });

    it('can retouch the result again, and the result can be removed', async () => {
      const { fixture, el, settle, port } = withImage();
      await settle();
      retouchButton(el)!.click();
      await settle();
      await retouchAndUse(settle);

      retouchButton(el)!.click();
      await settle();
      expect(document.querySelector<HTMLImageElement>('app-retouch-dialog .original img')?.src).toBe(RETOUCHED[0].dataUrl);
      await retouchAndUse(settle, 'with more contrast', 1);
      expect(fixture.componentInstance.image()).toEqual(RETOUCHED[1]);
      expect(port.requests.map((r) => r.image.name)).toEqual(['fox.png', 'retouched-1.png']);

      el.querySelector<HTMLButtonElement>('.preview .delete')!.click();
      await settle();
      expect(fixture.componentInstance.image()).toBeNull();
      expect(retouchButton(el)).toBeNull();
    });
  });
});
