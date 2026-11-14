import { provideHttpClient } from '@angular/common/http';
import { MOTION_EDIT_OPTIONS } from '../core/options';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AnimationFailure } from '@lab/animation-core';
import { provideLabForms } from '@lab/forms-kit';
import { provideMotionEditor } from '@lab/motion-editor';
import { provideMotionParts } from '@lab/motion-parts';
import { ANIMATION, InMemoryAnimation } from '@lab/music-motion';
import { provideServerConnection } from '@lab/server-connection';

import { stubStorage } from '../../testing/memory-storage';
import { AUDIO_FACTORY } from './audio';
import { MONACO } from './code/code-pane/code-pane';
import { EditorPage } from './editor.page';

class FakeAudio {
  currentTime = 0;
  paused = true;
  constructor(public src: string) {}
  play = () => ((this.paused = false), Promise.resolve());
  pause = () => void (this.paused = true);
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
}

async function setup(id: string, lang: 'es' | 'en' = 'en', options: ConstructorParameters<typeof InMemoryAnimation>[0] = {}, prepare?: (port: InMemoryAnimation) => Promise<unknown>) {
  stubStorage({ 'motion-edit.lang': lang, 'motion-edit.open.song-design': '1' });
  const port = new InMemoryAnimation({ stepMs: 100, pollMs: 10, ...options });
  await firstValueFrom(port.loadSample());
  await prepare?.(port);
  const audios: FakeAudio[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: MONACO, useValue: () => Promise.reject(new Error('no monaco in tests')) },
      { provide: MOTION_EDIT_OPTIONS, useValue: { lang } },
      provideRouter([]),
      provideHttpClient(),
      provideServerConnection({ lang }),
      provideLabForms({ lang }),
      provideMotionParts({ lang }),
      provideMotionEditor({ lang }),
      { provide: ANIMATION, useValue: port },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })), queryParamMap: of(convertToParamMap({})) } },
      { provide: AUDIO_FACTORY, useValue: (src: string) => (audios.push(new FakeAudio(src)), audios.at(-1)) },
    ],
  });
  const fixture = TestBed.createComponent(EditorPage);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async (check: () => void) => {
    await vi.waitFor(() => {
      fixture.detectChanges();
      check();
    }, { timeout: 2000 });
  };
  return { fixture, el, port, audios, settle };
}

describe('EditorPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens a piece: its title, the layers, the preview with its transport, the inspector and the timeline', async () => {
    const { el, settle } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('h1')).not.toBeNull());
    expect(el.querySelector('h1')!.textContent).toBe('Sample Beat');
    for (const sel of ['lab-motion-layers', 'lab-preview-frame-host', 'lab-preview-transport', 'app-inspector', 'lab-motion-timeline', 'app-actions']) expect(el.querySelector(sel), sel).not.toBeNull();
  });

  it('shows the pieces or the library in the left column, one at a time, and keeps both drawn', async () => {
    const { el, settle } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('[data-testid="tab-library"]')).not.toBeNull());
    const panel = (name: string) => el.querySelector(`#panel-${name}`) as HTMLElement;
    expect(panel('layers').hidden).toBe(false);
    expect(panel('library').hidden).toBe(true);
    (el.querySelector('[data-testid="tab-library"]') as HTMLButtonElement).click();
    await settle(() => expect(panel('library').hidden).toBe(false));
    expect(panel('layers').hidden).toBe(true);
    expect(el.querySelector('lab-motion-layers')).not.toBeNull();
  });

  it('opens the preview in a window and closing it leaves the playhead where it was', async () => {
    // jsdom has no <dialog> modal: stand in for it so the page's own open/close logic is what runs.
    const proto = HTMLDialogElement.prototype;
    vi.stubGlobal('HTMLDialogElement', HTMLDialogElement);
    proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
    const { fixture, el, settle } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('[data-testid="preview-enlarge"]')).not.toBeNull());
    const clock = (fixture.componentInstance as unknown as { clock: { seek(t: number): void; time(): number } }).clock;
    clock.seek(1.5);
    (el.querySelector('[data-testid="preview-enlarge"]') as HTMLButtonElement).click();
    await settle(() => expect(el.querySelector('app-preview-modal lab-preview-frame-host')).not.toBeNull());
    (el.querySelector('[data-testid="preview-close"]') as HTMLButtonElement).click();
    await settle(() => expect(el.querySelector('app-preview-modal lab-preview-frame-host')).toBeNull());
    expect(clock.time()).toBe(1.5);
  });

  it('moves the preview window by its title bar and keeps it where it was left', async () => {
    const proto = HTMLDialogElement.prototype;
    proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
    const { el, settle } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('[data-testid="preview-enlarge"]')).not.toBeNull());
    (el.querySelector('[data-testid="preview-enlarge"]') as HTMLButtonElement).click();
    await settle(() => expect(el.querySelector('[data-testid="preview-bar"]')).not.toBeNull());
    const bar = el.querySelector('[data-testid="preview-bar"]') as HTMLElement;
    const dialog = el.querySelector('[data-testid="preview-modal"]') as HTMLElement;
    bar.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }));
    bar.dispatchEvent(new MouseEvent('pointermove', { clientX: 160, clientY: 130, bubbles: true }));
    bar.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    await settle(() => expect(dialog.style.transform).toBe('translate(60px, 30px)'));
    // a press on the close button does not take the window
    (el.querySelector('[data-testid="preview-close"]') as HTMLButtonElement).dispatchEvent(new MouseEvent('pointerdown', { clientX: 500, clientY: 500, bubbles: true }));
    bar.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 900, bubbles: true }));
    expect(dialog.style.transform).toBe('translate(60px, 30px)');
  });

  it('opens the shortcuts with ? and closes them with the ×', async () => {
    const proto = HTMLDialogElement.prototype;
    proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
    const { el, settle } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('[data-testid="help-open"]')).not.toBeNull());
    expect(el.querySelector('[data-testid="help"] kbd')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    await settle(() => expect(el.querySelector('[data-testid="help"] kbd')).not.toBeNull());
    expect(el.querySelector('[data-testid="help"]')!.textContent).toContain('Split the piece at the playhead');
    (el.querySelector('[data-testid="help-close"]') as HTMLButtonElement).click();
    await settle(() => expect(el.querySelector('[data-testid="help"] kbd')).toBeNull());
  });

  it('draws the sample\'s own part for real, from the fragment it carries, and says what it could not draw', async () => {
    const { el, settle } = await setup('sample-piece');
    await settle(() => expect((el.querySelector('iframe') as HTMLIFrameElement).srcdoc).toContain('id="cb"'));
    const html = (el.querySelector('iframe') as HTMLIFrameElement).srcdoc;
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(html).toContain('window.__partSeek');
    // the piece uses built-in parts on its other scenes, and the badge says so
    expect(el.querySelector('lab-preview-frame-host .badge')!.textContent).toContain('Approximate');
  });

  it('plays the song of the piece: the sample\'s audio is the one of its video', async () => {
    const { audios, settle, fixture } = await setup('sample-piece');
    await settle(() => expect(audios).toHaveLength(1));
    expect(audios[0].src).toBe('samples/music-motion/sample.mp4');
    expect(fixture.nativeElement.querySelector('lab-preview-transport .hint')).toBeNull();
  });

  it('selects on the timeline and shows that piece in the inspector, and a click on a lane moves the playhead', async () => {
    const { el, settle, fixture } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('lab-motion-timeline .lane.main .block')).not.toBeNull());
    expect(el.querySelector('[data-testid="song"]')).not.toBeNull();
    (el.querySelector('lab-motion-timeline .lane.main .block') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="piece"]')!.textContent).toContain('confetti-burst');
    expect(el.querySelector('lab-motion-layers .row.selected')).not.toBeNull();
    (el.querySelector('lab-motion-timeline .lanes') as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('lab-preview-transport .time')!.textContent).toContain('0:');
    expect(el.querySelector('lab-preview-transport .time')!.textContent).not.toContain('0:00.000 /');
  });

  it('takes the playhead to the piece pressed in the layers', async () => {
    const { el, settle, fixture } = await setup('sample-piece');
    await settle(() => expect(el.querySelectorAll('lab-motion-layers .piece').length).toBeGreaterThan(1));
    (el.querySelectorAll('lab-motion-layers .piece > .row .name')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(el.querySelector('lab-preview-transport .time')!.textContent).toContain('0:06.000'); // p2 starts at 6 s
    expect(el.querySelector('lab-motion-layers .row.selected')).not.toBeNull();
    expect(el.querySelector('[data-testid="piece"]')!.textContent).toContain('counter');
  });

  it('answers the transport keys on the page', async () => {
    const { el, settle, fixture } = await setup('sample-piece');
    await settle(() => expect(el.querySelector('lab-preview-transport')).not.toBeNull());
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(el.querySelector('lab-preview-transport button[aria-label="Pause"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(el.querySelector('lab-preview-transport button[aria-label="Play"]')).not.toBeNull();
  });

  it('says there is no such piece, with a way back', async () => {
    const { el, settle } = await setup('no-such-piece');
    await settle(() => expect(el.querySelector('[data-testid="missing"]')).not.toBeNull());
    expect(el.textContent).toContain('There is no piece with the id "no-such-piece".');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('/pieces');
  });

  it('says it in Spanish', async () => {
    const { el, settle } = await setup('no-such-piece', 'es');
    await settle(() => expect(el.querySelector('[data-testid="missing"]')).not.toBeNull());
    expect(el.textContent).toContain('No hay ninguna pieza con el id «no-such-piece».');
  });

  it('follows a piece while it is drawn and reads it again when it ends', async () => {
    const { el, settle } = await setup('sample-piece', 'en', { stepMs: 40, pollMs: 5 }, (port) => firstValueFrom(port.render('sample-piece')));
    await settle(() => expect(el.querySelector('[data-testid="drawing"]')).not.toBeNull());
    await settle(() => expect(el.querySelector('[data-testid="drawing"]')).toBeNull());
    expect(el.querySelector('[data-testid="video"]')).not.toBeNull();
  });

  describe('editing', () => {
    const select = async (el: HTMLElement, fixture: { detectChanges(): void }, n = 0) => {
      (el.querySelectorAll('lab-motion-layers .piece > .row .name')[n] as HTMLElement).click();
      fixture.detectChanges();
    };
    const type = (el: HTMLElement, fixture: { detectChanges(): void }, text: string) => {
      const box = el.querySelector('app-lines-editor input.text') as HTMLInputElement;
      box.value = text;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const html = (el: HTMLElement) => (el.querySelector('lab-preview-frame-host iframe') as HTMLIFrameElement).srcdoc;

    it('opens a piece with nothing to save', async () => {
      const { el, settle } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers')).not.toBeNull());
      expect(el.querySelector('[data-testid="dirty"]')).toBeNull();
      expect((el.querySelector('[data-testid="save"]') as HTMLButtonElement).disabled).toBe(true);
      expect((el.querySelector('[data-testid="undo"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it('edits the words of a line: the preview shows them at once and the piece is marked as not saved', async () => {
      const { el, settle, fixture } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      await select(el, fixture);
      type(el, fixture, 'Brand new words');
      expect(el.querySelector('[data-testid="dirty"]')!.textContent).toContain('Unsaved changes');
      await settle(() => expect(html(el)).toContain('Brand new words'));
    });

    it('undoes and redoes, and an undone edit leaves nothing to save', async () => {
      const { el, settle, fixture } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      await select(el, fixture);
      type(el, fixture, 'Changed');
      (el.querySelector('[data-testid="undo"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="dirty"]')).toBeNull();
      (el.querySelector('[data-testid="redo"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="dirty"]')).not.toBeNull();
    });

    it('saves what changed on the server and shows it saved', async () => {
      const { el, settle, fixture, port } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      const saveScript = vi.spyOn(port, 'saveScript');
      const saveDesign = vi.spyOn(port, 'saveDesign');
      await select(el, fixture);
      type(el, fixture, 'Saved words');
      (el.querySelector('[data-testid="save"]') as HTMLButtonElement).click();
      await settle(() => expect(el.querySelector('[data-testid="saved"]')).not.toBeNull());
      expect(saveScript).toHaveBeenCalledTimes(1);
      expect(saveDesign).not.toHaveBeenCalled();
      expect(el.querySelector('[data-testid="dirty"]')).toBeNull();
      const stored = await firstValueFrom(port.piece('sample-piece'));
      expect(JSON.stringify(stored.script)).toContain('Saved words');
    });

    it('saves with Ctrl+S', async () => {
      const { el, settle, fixture, port } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      const saveScript = vi.spyOn(port, 'saveScript');
      await select(el, fixture);
      type(el, fixture, 'With the keyboard');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(saveScript).toHaveBeenCalledTimes(1));
    });

    it('shows a refusal of the server on the piece it is about, and keeps the changes', async () => {
      const { el, settle, fixture, port } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      vi.spyOn(port, 'saveScript').mockReturnValue(throwError(() => new AnimationFailure('refused', 'piece p2: the part "x" is not in the catalog')));
      await select(el, fixture);
      type(el, fixture, 'Will be refused');
      (el.querySelector('[data-testid="save"]') as HTMLButtonElement).click();
      await settle(() => expect(el.querySelector('app-piece-panel [data-testid="refused"]')).not.toBeNull());
      expect(el.querySelector('[data-testid="refused"]')!.textContent).toContain('piece p2: the part "x" is not in the catalog');
      expect(el.querySelector('lab-motion-layers .row.selected .part')!.textContent).not.toBe('');
      expect(el.querySelector('[data-testid="dirty"]')).not.toBeNull();
    });

    it('says why the save failed when the reason is not about a piece', async () => {
      const { el, settle, fixture, port } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      vi.spyOn(port, 'saveScript').mockReturnValue(throwError(() => new AnimationFailure('busy', 'the piece is being drawn')));
      await select(el, fixture);
      type(el, fixture, 'Busy');
      (el.querySelector('[data-testid="save"]') as HTMLButtonElement).click();
      await settle(() => expect(el.querySelector('[data-testid="save-problem"]')!.textContent).toContain('the piece is being drawn'));
    });

    it('asks before throwing the changes away, and does nothing when the answer is no', async () => {
      const { el, settle, fixture } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      await select(el, fixture);
      type(el, fixture, 'Maybe lost');
      vi.stubGlobal('confirm', () => false);
      (el.querySelector('[data-testid="discard"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="dirty"]')).not.toBeNull();
      vi.stubGlobal('confirm', () => true);
      (el.querySelector('[data-testid="discard"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="dirty"]')).toBeNull();
    });

    it('goes back to the song\'s design with Escape or the button', async () => {
      const { el, settle, fixture } = await setup('sample-piece');
      await settle(() => expect(el.querySelector('lab-motion-layers .piece')).not.toBeNull());
      await select(el, fixture);
      expect(el.querySelector('[data-testid="piece"]')).not.toBeNull();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="song"]')).not.toBeNull();
      await select(el, fixture);
      (el.querySelector('[data-testid="to-song"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="song"]')).not.toBeNull();
    });

    describe('adding to the timeline', () => {
      const drop = (el: HTMLElement, clientX: number, clientY: number, item: object) => {
        const event = new MouseEvent('drop', { clientX, clientY, bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: { types: ['application/x-motion-palette-item'], getData: () => JSON.stringify(item) } });
        el.querySelector('lab-motion-timeline .lanes')!.dispatchEvent(event);
      };
      const script = (fixture: { componentInstance: unknown }) => ((fixture.componentInstance as { doc: () => { script: { pieces: { id: string; part: string; with?: { part: string }[]; lines?: { text?: string }[]; start: number; end: number }[] } } }).doc().script.pieces);
      const ready = async () => {
        const c = await setup('sample-piece');
        await c.settle(() => expect(c.el.querySelector('lab-parts-palette [data-part="toggle"]')).not.toBeNull());
        return c;
      };

      it('has the library next to the layers', async () => {
        const { el } = await ready();
        expect(el.querySelectorAll('lab-parts-palette [data-testid="palette-part"]').length).toBeGreaterThan(3);
        expect(el.querySelector('lab-parts-palette [data-testid="palette-text"]')).not.toBeNull();
      });

      it('adds a part from the library as an extra of the selected piece, with the + button', async () => {
        const { el, fixture } = await ready();
        await select(el, fixture);
        (el.querySelector('lab-parts-palette [data-part="toggle"] .plus') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(script(fixture)[0].with!.map((w) => w.part)).toEqual(['toggle']);
        expect(el.querySelector('[data-testid="dirty"]')).not.toBeNull();
      });

      it('says so when the piece already has the part or has three extras', async () => {
        const { el, fixture } = await ready();
        await select(el, fixture);
        for (const name of ['toggle', 'counter', 'parallax-cards']) (el.querySelector(`lab-parts-palette [data-part="${name}"] .plus`) as HTMLButtonElement).click();
        fixture.detectChanges();
        (el.querySelector('lab-parts-palette [data-part="wire-sphere"] .plus') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(el.querySelector('[data-testid="notice"]')!.textContent).toContain('three extra parts at most');
        expect(script(fixture)[0].with!.length).toBe(3);
      });

      it('drops a part on an extra lane to add it, and on the main track to replace the piece\'s part', async () => {
        const { el, fixture } = await ready();
        drop(el, 50, 150, { kind: 'part', name: 'toggle' }); // extra lane 0, at 1 s: piece p1
        fixture.detectChanges();
        expect(script(fixture)[0].with!.map((w) => w.part)).toContain('toggle');
        drop(el, 50, 120, { kind: 'part', name: 'wire-sphere' }); // main track
        fixture.detectChanges();
        expect(script(fixture)[0].part).toBe('wire-sphere');
      });

      it('drops a text on the timeline: a new line at that time, in the piece that holds it', async () => {
        const { el, fixture } = await ready();
        const before = script(fixture)[1].lines?.length ?? 0;
        // zoom 40 px/s: x = 137 + 7 s * 40 is inside the second piece (6..12 s); the lanes start at the scroller's left edge in the test
        drop(el, 280, 120, { kind: 'text' });
        fixture.detectChanges();
        const lines = script(fixture)[1].lines!;
        expect(lines.length).toBe(before + 1);
        expect(lines.some((l) => l.text === 'New text')).toBe(true);
        expect(el.querySelector('app-lines-editor')).not.toBeNull();
      });

      it('splits the piece at the playhead and selects the new one', async () => {
        const { el, fixture } = await ready();
        const before = script(fixture).length;
        (el.querySelector('lab-motion-timeline .lanes') as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { clientX: 90, bubbles: true })); // about 2.25 s
        fixture.detectChanges();
        (el.querySelector('[data-testid="split"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        const pieces = script(fixture);
        expect(pieces.length).toBe(before + 1);
        expect(pieces[0].end).toBeCloseTo(pieces[1].start, 2);
        expect(el.querySelector('[data-testid="piece"] h2')!.textContent).toContain(pieces[1].id);
      });

      it('refuses to split where a half would be too short, and says why', async () => {
        const { el, fixture } = await ready();
        (el.querySelector('[data-testid="split"]') as HTMLButtonElement).click(); // at 0 s
        fixture.detectChanges();
        expect(el.querySelector('[data-testid="notice"]')!.textContent).toContain('at least half a second');
      });

      it('empties the selected piece, keeping its time, and removing the empty slot gives its time to the one before; the last one stays', async () => {
        const { el, fixture } = await ready();
        await select(el, fixture, 1);
        const remove = () => {
          (el.querySelector('[data-testid="remove-piece"]') as HTMLButtonElement).click();
          fixture.detectChanges();
        };
        const [first, second] = script(fixture);
        remove();
        const emptied = script(fixture);
        expect(emptied.length).toBe(2);
        expect(emptied[1]).toMatchObject({ id: second.id, start: second.start, end: second.end, part: 'blank' });
        expect(el.querySelector('lab-motion-timeline .block.empty')).not.toBeNull();
        remove();
        const pieces = script(fixture);
        expect(pieces.length).toBe(1);
        expect(pieces[0].end).toBe(second.end);
        expect(pieces[0].id).toBe(first.id);
        await select(el, fixture, 0);
        remove();
        remove();
        expect(el.querySelector('[data-testid="notice"]')!.textContent).toContain('last piece left');
      });

      it('fills an empty slot with the part added from the library, as its own part', async () => {
        const { el, fixture } = await ready();
        await select(el, fixture, 1);
        (el.querySelector('[data-testid="remove-piece"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(script(fixture)[1].part).toBe('blank');
        (el.querySelector('[data-testid="tab-library"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        (el.querySelector('lab-parts-palette [data-testid="palette-part"]:not([data-part="blank"]) button') as HTMLButtonElement).click();
        fixture.detectChanges();
        const filled = script(fixture)[1];
        expect(filled.part).not.toBe('blank');
        expect(filled.with ?? []).toEqual([]);
      });

      it('splits with S and removes with Delete', async () => {
        const { el, fixture } = await ready();
        (el.querySelector('lab-motion-timeline .lanes') as HTMLElement).dispatchEvent(new MouseEvent('pointerdown', { clientX: 90, bubbles: true }));
        fixture.detectChanges();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }));
        fixture.detectChanges();
        expect(script(fixture).length).toBe(3);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        fixture.detectChanges();
        // the first Delete empties the piece (it stays), the second takes the empty slot out
        expect(script(fixture).length).toBe(3);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
        fixture.detectChanges();
        expect(script(fixture).length).toBe(2);
      });
    });

    it('edits nothing while the server draws the piece', async () => {
      const { el, settle } = await setup('sample-piece', 'en', { stepMs: 200, pollMs: 5 }, (port) => firstValueFrom(port.render('sample-piece')));
      await settle(() => expect(el.querySelector('[data-testid="locked"]')).not.toBeNull());
      expect((el.querySelector('[data-testid="save"]') as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
