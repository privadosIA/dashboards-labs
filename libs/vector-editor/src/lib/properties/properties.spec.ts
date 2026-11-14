import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { sampleDocument } from '../../testing/sample-document';
import { shapesDocument } from '../../testing/shapes-document';
import type { VectorDocument } from '../model/document';
import { findNode } from '../model/tree';
import { provideVectorEditor } from '../provide-vector-editor';
import { VectorStore } from '../store/vector-store';
import { VectorProperties } from './properties';

function setup(lang: 'es' | 'en' = 'en', doc: VectorDocument = sampleDocument()) {
  const store = new VectorStore(doc);
  TestBed.configureTestingModule({ providers: [provideVectorEditor({ lang })] });
  const fixture: ComponentFixture<VectorProperties> = TestBed.createComponent(VectorProperties);
  fixture.componentRef.setInput('store', store);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string) => el.querySelector<T>(`[data-testid="${id}"]`)!;
  const type = (id: string, value: string): void => {
    const input = q<HTMLInputElement>(id);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const pick = (id: string, value: string): void => {
    const select = q<HTMLSelectElement>(id);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
  };
  const click = (id: string): void => {
    q(id).click();
    fixture.detectChanges();
  };
  const select = (...ids: string[]): void => {
    store.select(ids);
    fixture.detectChanges();
  };
  const node = (id: string) => findNode(store.doc().nodes, id)!;
  return { store, fixture, el, q, type, pick, click, select, node };
}

describe('lab-vector-properties', () => {
  // The form of a parameter is a modal dialog; the test environment has no layer for it, so opening and closing only set the attribute.
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('asks for a selection when there is none, in the dashboard’s language', () => {
    expect(setup('es').q('props-none').textContent).toContain('Elige un elemento');
    TestBed.resetTestingModule();
    expect(setup('en').q('props-none').textContent).toContain('Pick an element');
  });

  it('shows what the selected node has at the playhead', () => {
    const { store, q, select, fixture } = setup();
    select('dot');
    expect(q<HTMLInputElement>('field-x').value).toBe('0');
    store.seek(2);
    fixture.detectChanges();
    expect(q<HTMLInputElement>('field-x').value).toBe('60');
    expect(q<HTMLInputElement>('field-scaleX').value).toBe('1.438');
  });

  it('changes a static value for good, typing on in one field being one step', () => {
    const { store, select, type, node } = setup();
    select('tag');
    type('field-x', '1');
    type('field-x', '12');
    expect(node('tag').transform.x).toBe(12);
    expect(node('tag').tracks).toEqual({});
    expect(store.past()).toHaveLength(1);
    type('field-x', '');
    expect(node('tag').transform.x).toBe(12);
  });

  it('edits the keyframe at the playhead, and adds one where there is none', () => {
    const { store, select, type, node, fixture } = setup();
    select('dot');
    store.seek(2);
    fixture.detectChanges();
    type('field-x', '70');
    expect(node('dot').tracks.x!.map((f) => [f.t, f.value])).toEqual([[0, 0], [2, 70]]);
    store.seek(1);
    fixture.detectChanges();
    type('field-x', '5');
    expect(node('dot').tracks.x!.map((f) => f.t)).toEqual([0, 1, 2]);
  });

  it('toggles a keyframe at the playhead with the diamond, and removes it when pressed again', () => {
    const { store, select, click, node, q, fixture } = setup();
    select('tag');
    store.seek(1.5);
    fixture.detectChanges();
    expect(q('key-opacity').getAttribute('aria-pressed')).toBe('false');
    click('key-opacity');
    expect(node('tag').tracks.opacity).toEqual([{ t: 1.5, value: 1, ease: 'linear' }]);
    expect(q('key-opacity').getAttribute('aria-pressed')).toBe('true');
    expect(q('key-opacity').getAttribute('aria-label')).toBe('Remove keyframe: Opacity');
    click('key-opacity');
    expect('opacity' in node('tag').tracks).toBe(false);
  });

  it('changes the opacity from the slider as from the field', () => {
    const { select, type, node } = setup();
    select('tag');
    type('field-opacity-range', '0.4');
    expect(node('tag').opacity).toBeCloseTo(0.4);
    type('field-opacity', '0.7');
    expect(node('tag').opacity).toBeCloseTo(0.7);
  });

  it('changes the anchor without a keyframe', () => {
    const { select, type, node } = setup();
    select('tag');
    type('field-anchorX', '170');
    expect(node('tag').transform.anchorX).toBe(170);
  });

  it('chooses a paint: none, a colour, a design variable, or as in the SVG', () => {
    const { select, pick, type, node, q } = setup();
    select('tag');
    pick('mode-fill', 'none');
    expect(node('tag').fill).toEqual({ kind: 'none' });
    pick('mode-fill', 'color');
    expect(node('tag').fill).toEqual({ kind: 'color', value: '#808080' });
    type('colour-fill', '#00ff00');
    expect(node('tag').fill).toEqual({ kind: 'color', value: '#00ff00' });
    pick('mode-fill', 'var');
    pick('var-fill', 'fg');
    expect(node('tag').fill).toEqual({ kind: 'var', name: 'fg' });
    expect(q('var-fill').querySelectorAll('option')).toHaveLength(5);
    pick('mode-fill', 'keep');
    expect(node('tag').fill).toEqual({ kind: 'keep' });
  });

  it('shows an animated paint as a colour and keeps its mode fixed', () => {
    const { select, q, type, node, store, fixture } = setup();
    select('wing-a');
    expect(q<HTMLSelectElement>('mode-fill').disabled).toBe(true);
    expect(q<HTMLSelectElement>('mode-fill').value).toBe('color');
    store.seek(0);
    fixture.detectChanges();
    expect(q<HTMLInputElement>('colour-fill').value).toBe('#457b9d');
    type('colour-fill', '#112233');
    expect(node('wing-a').tracks.fill![0].value).toBe('#112233');
  });

  it('changes every selected node, and shows the first one’s values', () => {
    const { select, type, node, q } = setup();
    select('tag', 'wing-b');
    type('field-x', '9');
    expect(node('tag').transform.x).toBe(9);
    expect(node('wing-b').transform.x).toBe(9);
    expect(q<HTMLInputElement>('field-x').value).toBe('9');
  });

  it('makes a fill a parameter, and then shows it as one and gives it back', () => {
    const { store, el, select, click, type, q, node, fixture } = setup();
    select('wing-b');
    click('param-fill');
    expect(q<HTMLInputElement>('param-name').value).toBe('wing_b_fill');
    type('param-name', 'brand');
    type('param-description', 'The brand colour');
    type('param-default', '#ff0000');
    q('param-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(store.doc().params.map((p) => p.name)).toEqual(['title', 'brand']);
    expect(el.querySelector('[data-testid="param-form"]')).toBeNull();
    expect(q('is-parameter').textContent).toContain('parameter of the part');
    expect(el.querySelector('[data-testid="key-fill"]')).toBeNull();
    click('remove-param-fill');
    expect(store.doc().params.map((p) => p.name)).toEqual(['title']);
    expect(node('wing-b').fill).toEqual({ kind: 'keep' });
  });

  it('refuses to make an animated fill a parameter, saying so, and changes nothing', () => {
    const { store, select, click, q, fixture } = setup();
    select('wing-a');
    click('param-fill');
    q('param-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(q('problem').textContent).toContain('is animated');
    expect(store.doc().params).toHaveLength(1);
    expect(q('param-form')).not.toBeNull();
  });

  it('offers a text parameter on a text element, starting from its text', () => {
    const { store, select, click, q, fixture } = setup();
    select('label');
    expect(q('is-parameter-text')).not.toBeNull();
    click('remove-param-text');
    expect(store.doc().params).toHaveLength(0);
    click('param-text');
    expect(q<HTMLInputElement>('param-default').value).toBe('LOGO');
    q('param-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(store.doc().params[0].target).toEqual({ nodeId: 'label', what: 'text' });
  });

  describe('drawn nodes and alignment', () => {
    it('offers the size fields of the kind: a rectangle’s width, height and corner radius, and a text’s size', () => {
      const { select, q, fixture, el } = setup('en', shapesDocument());
      select('bar');
      expect(['field-width', 'field-height', 'field-rx'].every((id) => q(id) !== null)).toBe(true);
      expect(q('field-fontSize')).toBeNull();
      select('title');
      expect(q('field-fontSize')).not.toBeNull();
      expect(q('field-content')).not.toBeNull();
      expect(q('field-width')).toBeNull();
      select('rule');
      expect(q('field-x2')).not.toBeNull();
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="shape-section"]')).not.toBeNull();
    });

    it('changes a width for good when it has no keyframes and adds a keyframe where it has some', () => {
      const { select, type, store, node } = setup('en', shapesDocument());
      select('dot');
      type('field-width', '90');
      expect(node('dot')).toMatchObject({ width: 90 });
      select('bar');
      store.seek(2);
      type('field-width', '250');
      expect(node('bar').tracks.width!.find((f) => f.t === 2)!.value).toBe(250);
      expect(node('bar')).toMatchObject({ width: 100 });
    });

    it('changes a text’s words, font, weight and alignment', () => {
      const { select, type, pick, node } = setup('en', shapesDocument());
      select('title');
      type('field-content', 'Adiós');
      pick('field-font', 'serif');
      type('field-weight', '420');
      pick('field-text-align', 'middle');
      expect(node('title')).toMatchObject({ content: 'Adiós', font: 'serif', fontWeight: 400, align: 'middle' });
    });

    it('shows "—" where the selected nodes differ and writes a typed value to all of them', () => {
      const { select, type, q, node } = setup('en', shapesDocument());
      select('bar', 'dot');
      expect(q<HTMLInputElement>('field-x').value).toBe('');
      expect(q<HTMLInputElement>('field-x').placeholder).toBe('—');
      type('field-x', '77');
      expect(node('bar').transform.x).toBe(77);
      expect(node('dot').transform.x).toBe(77);
      expect(q<HTMLInputElement>('field-x').value).toBe('77');
      expect(q<HTMLInputElement>('field-x').placeholder).toBe('');
    });

    it('makes a width a number parameter with limits, and refuses it on an animated one', () => {
      const { select, click, type, q, store } = setup('en', shapesDocument());
      select('dot');
      click('param-width');
      type('param-name', 'dot_w');
      type('param-min', '10');
      type('param-max', '400');
      click('param-create');
      expect(store.doc().params).toEqual([
        { name: 'dot_w', type: 'number', description: '', default: '60', min: 10, max: 400, target: { nodeId: 'dot', what: 'width' } },
      ]);
      expect(q('is-parameter')).not.toBeNull();
      select('title');
      expect(q('param-fontSize')).toBeNull();
    });

    it('aligns through the canvas: to the artboard for one node, to the selection’s box for several unless the box is ticked', () => {
      const { select, click, q, store } = setup('en', shapesDocument());
      const calls: Array<[string, boolean]> = [];
      store.canvasActions.set({ align: (mode, toArtboard) => calls.push([mode, toArtboard]), distribute: () => undefined });
      select('bar');
      click('align-centre');
      select('bar', 'dot');
      click('align-left');
      expect(q<HTMLInputElement>('align-artboard').disabled).toBe(false);
      q<HTMLInputElement>('align-artboard').click();
      click('align-top');
      expect(calls).toEqual([['centre', true], ['left', false], ['top', true]]);
    });

    it('distributes only with three or more nodes', () => {
      const { select, q } = setup('en', shapesDocument());
      select('bar', 'dot');
      expect(q<HTMLButtonElement>('distribute-horizontal').disabled).toBe(true);
      select('bar', 'dot', 'rule');
      expect(q<HTMLButtonElement>('distribute-horizontal').disabled).toBe(false);
    });

    it('speaks Spanish too', () => {
      const { select, q } = setup('es', shapesDocument());
      select('bar');
      expect(q('align-section').textContent).toContain('Alinear');
      expect(q('shape-section').textContent).toContain('Radio de esquina');
    });
  });

  describe('the Beat section', () => {
    it('says the beat is heard inside a piece when the host gives none, and still lets links be edited', () => {
      const { select, q, click, node } = setup('en', shapesDocument());
      select('bar');
      expect(q('beat-silent')!.textContent).toContain('heard inside a piece');
      expect(q('beat-none')).not.toBeNull();
      click('beat-add');
      expect(node('bar').beat).toBeDefined();
    });

    it('adds a pulse on the chosen property with a visible amount, and shows its fields', () => {
      const { select, pick, click, q, node, fixture } = setup('en', shapesDocument());
      fixture.componentRef.setInput('hasBeat', true);
      select('bar');
      pick('beat-add-property', 'scaleX');
      click('beat-add');
      expect(node('bar').beat).toEqual({ scaleX: { kind: 'pulse', amount: 0.2, decay: 3 } });
      expect(q('beat-silent')).toBeNull();
      expect(q<HTMLInputElement>('beat-amount-scaleX').value).toBe('0.2');
      expect(q<HTMLInputElement>('beat-decay-scaleX').value).toBe('3');
      expect(q('beat-add-form')!.querySelectorAll('option')).not.toHaveLength(0);
      expect([...q('beat-add-property').querySelectorAll('option')].map((o) => o.value)).not.toContain('scaleX');
    });

    it('changes the amount and the decay (kept between 1 and 8), one step for a burst of typing', () => {
      const { select, pick, click, type, node, store } = setup('en', shapesDocument());
      select('bar');
      pick('beat-add-property', 'rotate');
      click('beat-add');
      type('beat-amount-rotate', '25');
      type('beat-decay-rotate', '40');
      expect(node('bar').beat!.rotate).toEqual({ kind: 'pulse', amount: 25, decay: 8 });
      type('beat-decay-rotate', '0');
      expect(node('bar').beat!.rotate).toMatchObject({ decay: 1 });
      expect(store.canUndo()).toBe(true);
    });

    it('changes the kind: alternate takes two values, loudness an amount; a colour can only alternate', () => {
      const { select, pick, click, type, node } = setup('en', shapesDocument());
      select('bar');
      pick('beat-add-property', 'opacity');
      click('beat-add');
      pick('beat-kind-opacity', 'alternate');
      expect(node('bar').beat!.opacity).toMatchObject({ kind: 'alternate' });
      type('beat-value-opacity-1', '0.4');
      expect(node('bar').beat!.opacity).toMatchObject({ values: [expect.any(Number), 0.4] });
      pick('beat-kind-opacity', 'loudness');
      expect(node('bar').beat!.opacity).toMatchObject({ kind: 'loudness', amount: 0.3 });
      pick('beat-add-property', 'fill');
      click('beat-add');
      expect(node('bar').beat!.fill).toMatchObject({ kind: 'alternate', values: [expect.stringMatching(/^#/), '#ffffff'] });
    });

    it('edits the two colours of an alternating fill', () => {
      const { select, pick, click, type, node } = setup('en', shapesDocument());
      select('bar');
      pick('beat-add-property', 'fill');
      click('beat-add');
      type('beat-value-fill-1', '#00ff00');
      expect(node('bar').beat!.fill).toMatchObject({ kind: 'alternate', values: [expect.any(String), '#00ff00'] });
    });

    it('removes a link, and offers the property again', () => {
      const { select, pick, click, q, node } = setup('en', shapesDocument());
      select('bar');
      pick('beat-add-property', 'scaleX');
      click('beat-add');
      click('beat-remove-scaleX');
      expect('beat' in node('bar')).toBe(false);
      expect([...q('beat-add-property').querySelectorAll('option')].map((o) => o.value)).toContain('scaleX');
    });

    it('says a loudness link has no effect when the host has no curve', () => {
      const { select, pick, click, q, fixture } = setup('en', shapesDocument());
      fixture.componentRef.setInput('hasBeat', true);
      select('bar');
      pick('beat-add-property', 'scaleX');
      click('beat-add');
      pick('beat-kind-scaleX', 'loudness');
      expect(q('beat-no-curve')).not.toBeNull();
      fixture.componentRef.setInput('hasLoudness', true);
      fixture.detectChanges();
      expect(q('beat-no-curve')).toBeNull();
    });

    it('speaks Spanish too', () => {
      const { select, q } = setup('es', shapesDocument());
      select('bar');
      expect(q('beat-section').textContent).toContain('Compás');
      expect(q('beat-silent').textContent).toContain('dentro de una pieza');
    });
  });
});

