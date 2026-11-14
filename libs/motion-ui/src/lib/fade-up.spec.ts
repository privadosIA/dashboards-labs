import { fadeUp } from './fade-up';

const elements = (n: number) =>
  Array.from({ length: n }, () => {
    const el = document.createElement('div');
    el.style.opacity = '0';
    document.body.appendChild(el);
    return el;
  });

describe('fadeUp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('returns without error when there is nothing to animate', async () => {
    await expect(fadeUp([])).resolves.toBeUndefined();
    await expect(fadeUp(document.querySelectorAll('.nothing'))).resolves.toBeUndefined();
  });

  it('leaves the elements visible in their place at once under reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const list = elements(3);
    await fadeUp(list);
    for (const el of list) {
      expect(el.style.opacity).toBe('1');
      expect(el.style.transform).toBe('none');
    }
  });

  it('resolves when the entrance is over and the elements have arrived', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const list = elements(2);
    await fadeUp(list, { duration: 0.02, gap: 0.01 });
    for (const el of list) expect(Number(el.style.opacity)).toBe(1);
  });

  it('accepts a spring and a live list of elements', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    elements(2);
    await fadeUp(document.body.children, { spring: true, duration: 0.05, gap: 0 });
    expect(document.body.children.length).toBe(2);
  });
});
