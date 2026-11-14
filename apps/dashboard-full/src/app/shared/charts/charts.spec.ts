import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { BarChartComponent } from './bar-chart/bar-chart.component';
import { ChartFrameComponent, ChartTable } from './chart-frame/chart-frame.component';
import { LineChartComponent } from './line-chart/line-chart.component';
import { RatioBarComponent } from './ratio-bar/ratio-bar.component';
import { StackedBarChartComponent } from './stacked-bar-chart/stacked-bar-chart.component';

function mount<T>(type: new () => T, inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const q = (el: HTMLElement, sel: string) => el.querySelector(sel) as HTMLElement | null;
const qa = (el: HTMLElement, sel: string) => Array.from(el.querySelectorAll(sel)) as HTMLElement[];
const num = (e: Element | null, a: string) => Number(e?.getAttribute(a));

describe('mo-bar-chart', () => {
  const data = [
    { label: 'render', value: 30, detail: '2 ejecuciones' },
    { label: 'tts', value: 10 },
    { label: 'clip', value: 0 },
  ];

  it('draws one labelled bar per category on a common scale from zero', () => {
    const { el } = mount(BarChartComponent, { data, ariaLabel: 'Tiempo por fase' });
    const bars = qa(el, '.bar');
    expect(bars.length).toBe(3);
    const [a, b, c] = bars.map((x) => num(x, 'width'));
    expect(a).toBeGreaterThan(b);
    expect(a / b).toBeCloseTo(3, 1); // 30 vs 10
    expect(c).toBe(0); // a zero is a zero-width bar, not a sliver
    expect(qa(el, '.label').map((t) => t.textContent)).toEqual(['render', 'tts', 'clip']);
    expect(q(el, 'svg')?.getAttribute('aria-label')).toBe('Tiempo por fase');
  });

  it('uses a fixed scale maximum when given, and never overflows it', () => {
    const { el } = mount(BarChartComponent, { data: [{ label: 'gpu', value: 50 }, { label: 'x', value: 150 }], max: 100, ariaLabel: 'a' });
    const [half, over] = qa(el, '.bar').map((x) => num(x, 'width'));
    expect(over).toBeCloseTo(half * 2, 1);
  });

  it('shows the value of a hovered or focused bar, and clears it on leave', () => {
    const { fixture, el } = mount(BarChartComponent, { data, ariaLabel: 'a' });
    const row = q(el, '[data-testid=bar-0]')!;
    expect(q(el, '[data-testid=chart-readout]')?.textContent?.trim()).toBe('');
    row.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent).toContain('render: 30,0 · 2 ejecuciones');
    row.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent?.trim()).toBe('');
    row.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent).toContain('render');
  });

  it('makes every bar keyboard-focusable with a text label', () => {
    const { el } = mount(BarChartComponent, { data, ariaLabel: 'a' });
    for (const r of qa(el, '.row')) {
      expect(r.getAttribute('tabindex')).toBe('0');
      expect(r.getAttribute('aria-label')).toBeTruthy();
    }
    expect(q(el, '[data-testid=bar-0]')?.getAttribute('aria-label')).toBe('render: 30,0, 2 ejecuciones');
  });

  it('leaves room for the longest value text so it is never clipped by the chart edge', () => {
    const { el } = mount(BarChartComponent, {
      data: [{ label: 'animate', value: 843 }, { label: 'tts', value: 5 }],
      format: (v: number) => (v >= 840 ? '14 min 03 s' : `${v} s`),
      ariaLabel: 'a',
    });
    const longest = qa(el, '.value')[0];
    const charWidth = 7.3; // 12px monospace
    const end = num(longest, 'x') + (longest.textContent ?? '').length * charWidth;
    expect(end).toBeLessThanOrEqual(420);
  });

  it('draws nothing for no data without failing', () => {
    const { el } = mount(BarChartComponent, { data: [], ariaLabel: 'a' });
    expect(qa(el, '.bar').length).toBe(0);
  });
});

describe('mo-stacked-bar-chart', () => {
  const categories = ['2026-10-05', '2026-10-06', '2026-10-07'];
  const series = [
    { name: 'correctos', kind: 'ok' as const, values: [3, 0, 2] },
    { name: 'fallidos', kind: 'bad' as const, values: [1, 4, 0] },
    { name: 'otros', kind: 'dim' as const, values: [0, 0, 1] },
  ];

  it('stacks the segments of each column and scales to the tallest column', () => {
    const { el } = mount(StackedBarChartComponent, { categories, series, ariaLabel: 'Runs por día' });
    const col1 = qa(q(el, '[data-testid=col-1]')!, '.seg');
    expect(col1.length).toBe(1); // only the failed ones have height that day
    const col0 = qa(q(el, '[data-testid=col-0]')!, '.seg');
    expect(col0.length).toBe(2);
    const okH = num(col0[0], 'height');
    const badH = num(col0[1], 'height');
    expect(okH / badH).toBeCloseTo(3, 1); // 3 vs 1
    expect(num(col1[0], 'height') / badH).toBeCloseTo(4, 1);
    // stacked: the failed segment sits right on top of the correct one
    expect(num(col0[1], 'y') + badH).toBeCloseTo(num(col0[0], 'y'), 1);
    // an empty middle series must not break the stack above it (day 3: 2 ok, 0 failed, 1 other)
    const col2 = qa(q(el, '[data-testid=col-2]')!, '.seg');
    expect(col2.length).toBe(2);
    expect(num(col2[1], 'y') + num(col2[1], 'height')).toBeCloseTo(num(col2[0], 'y'), 1);
    expect(num(col2[0], 'height') / num(col2[1], 'height')).toBeCloseTo(2, 1);
  });

  it('tells series apart by pattern as well as colour, and lists them in a legend', () => {
    const { el } = mount(StackedBarChartComponent, { categories, series, ariaLabel: 'a' });
    const kinds = qa(el, '.seg').map((s) => s.getAttribute('class'));
    expect(kinds.some((c) => c?.includes('seg--bad'))).toBe(true);
    expect(qa(el, '.seg--bad').every((s) => (s.getAttribute('fill') ?? '').startsWith('url(#'))).toBe(true);
    expect(qa(el, '.seg--dim').every((s) => (s.getAttribute('fill') ?? '').startsWith('url(#'))).toBe(true);
    expect(qa(el, '[data-testid=chart-legend] li').map((l) => l.textContent?.trim())).toEqual(['correctos', 'fallidos', 'otros']);
  });

  it('gives two charts different pattern ids', () => {
    const a = mount(StackedBarChartComponent, { categories, series, ariaLabel: 'a' }).el;
    const b = mount(StackedBarChartComponent, { categories, series, ariaLabel: 'b' }).el;
    const idOf = (e: HTMLElement) => q(e, 'pattern')?.getAttribute('id');
    expect(idOf(a)).not.toBe(idOf(b));
  });

  it('describes a column on hover and focus with every series', () => {
    const { fixture, el } = mount(StackedBarChartComponent, { categories, series, ariaLabel: 'a' });
    q(el, '[data-testid=col-0]')!.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent).toBe('2026-10-05: 3 correctos · 1 fallidos · 0 otros');
    expect(q(el, '[data-testid=col-2]')?.getAttribute('aria-label')).toContain('2 correctos');
  });

  it('thins the axis labels when there are many categories so they do not overlap', () => {
    const many = Array.from({ length: 60 }, (_, i) => `d${i}`);
    const { el } = mount(StackedBarChartComponent, {
      categories: many,
      series: [{ name: 'x', kind: 'ok', values: many.map(() => 1) }],
      ariaLabel: 'a',
    });
    const labels = qa(el, '.col text.tick');
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThan(20);
  });

  it('copes with no categories', () => {
    const { el } = mount(StackedBarChartComponent, { categories: [], series: [], ariaLabel: 'a' });
    expect(qa(el, '.seg').length).toBe(0);
  });
});

describe('mo-line-chart', () => {
  const series = [
    { name: 'duración', kind: 'amber' as const, points: [{ x: 0, y: 10 }, { x: 1, y: 40 }, { x: 2, y: 20 }] },
  ];

  it('draws a line and a point per sample, with the y axis starting at zero', () => {
    const { el } = mount(LineChartComponent, { series, ariaLabel: 'Duración' });
    expect(qa(el, '.line').length).toBe(1);
    expect(q(el, '.line')?.getAttribute('d')).toMatch(/^M[\d.]+ [\d.]+ L/);
    expect(qa(el, 'circle').length).toBe(3);
    const ticks = qa(el, '.tick').map((t) => t.textContent?.trim());
    expect(ticks).toContain('0');
    expect(ticks).toContain('50'); // niceCeil(40) is the top of the axis
    const ys = qa(el, 'circle').map((c) => num(c, 'cy'));
    expect(ys[1]).toBeLessThan(ys[0]); // 40 is drawn above 10
  });

  it('ends the last x label at the right edge so it is not clipped, and centres the others', () => {
    const { el } = mount(LineChartComponent, { series, ariaLabel: 'a', xFormat: (v: number) => `día ${v}` });
    const labels = qa(el, 'text.tick').filter((t) => t.textContent?.startsWith('día'));
    expect(labels.length).toBe(5);
    expect(labels[labels.length - 1].getAttribute('text-anchor')).toBe('end');
    expect(labels[0].getAttribute('text-anchor')).toBe('middle');
  });

  it('honours a fixed maximum for percentages', () => {
    const { el } = mount(LineChartComponent, { series, yMax: 100, ariaLabel: 'a', yFormat: (v: number) => `${v} %` });
    expect(qa(el, '.tick').some((t) => t.textContent?.trim() === '100 %')).toBe(true);
  });

  it('draws the reference line (the median) at its own height with its label', () => {
    const { el } = mount(LineChartComponent, { series, reference: { y: 20, label: 'mediana' }, ariaLabel: 'a' });
    const ref = q(el, '[data-testid=chart-reference]')!;
    expect(ref).not.toBeNull();
    expect(q(el, '.ref-label')?.textContent).toBe('mediana');
    const y20 = num(qa(el, 'circle')[2], 'cy');
    expect(num(ref, 'y1')).toBeCloseTo(y20, 1);
  });

  it('describes a focused point and clears it on blur', () => {
    const { fixture, el } = mount(LineChartComponent, {
      series: [{ name: 'GPU 1', kind: 'green', points: [{ x: 0, y: 5, label: '5 % a los 0 s' }, { x: 2000, y: 80, label: '80 % a los 2 s' }] }],
      ariaLabel: 'a',
    });
    const pts = qa(el, 'circle');
    expect(pts[1].getAttribute('tabindex')).toBe('0');
    expect(pts[1].getAttribute('aria-label')).toBe('GPU 1: 80 % a los 2 s');
    pts[1].dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent).toBe('GPU 1: 80 % a los 2 s');
    pts[1].dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent?.trim()).toBe('');
  });

  it('follows the pointer to the nearest point', () => {
    const { fixture, el } = mount(LineChartComponent, {
      series: [{ name: 's', kind: 'amber', points: [{ x: 0, y: 1, label: 'first' }, { x: 10, y: 2, label: 'last' }] }],
      ariaLabel: 'a',
    });
    const svg = q(el, 'svg')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 420, top: 0, height: 200, right: 420, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 400 }));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent).toContain('last');
    svg.dispatchEvent(new PointerEvent('pointermove', { clientX: 20 }));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent).toContain('first');
    svg.dispatchEvent(new PointerEvent('pointerleave'));
    fixture.detectChanges();
    expect(q(el, '[data-testid=chart-readout]')?.textContent?.trim()).toBe('');
  });

  it('only makes points focusable when the series is short enough to tab through', () => {
    const long = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i }));
    const { el } = mount(LineChartComponent, { series: [{ name: 'long', kind: 'amber', points: long }], ariaLabel: 'a' });
    expect(qa(el, 'circle').every((c) => !c.hasAttribute('tabindex'))).toBe(true);
  });

  it('uses different dashes for different series and shows a legend only for several', () => {
    const two = [
      { name: 'a', kind: 'amber' as const, points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] },
      { name: 'b', kind: 'green' as const, points: [{ x: 0, y: 2 }, { x: 1, y: 1 }] },
    ];
    const { el } = mount(LineChartComponent, { series: two, ariaLabel: 'a' });
    const dashes = qa(el, '.line').map((l) => l.getAttribute('stroke-dasharray'));
    expect(dashes[0]).toBeNull();
    expect(dashes[1]).toBeTruthy();
    expect(qa(el, '[data-testid=chart-legend] li').length).toBe(2);
    const one = mount(LineChartComponent, { series: [two[0]], ariaLabel: 'a' }).el;
    expect(q(one, '[data-testid=chart-legend]')).toBeNull();
  });

  it('handles one point and no data without NaN', () => {
    const { el } = mount(LineChartComponent, { series: [{ name: 's', kind: 'amber', points: [{ x: 5, y: 3 }] }], ariaLabel: 'a' });
    expect(q(el, 'circle')?.getAttribute('cx')).not.toBe('NaN');
    const empty = mount(LineChartComponent, { series: [], ariaLabel: 'a' }).el;
    expect(qa(empty, 'circle').length).toBe(0);
    expect(empty.innerHTML).not.toContain('NaN');
  });
});

describe('mo-ratio-bar', () => {
  it('splits the bar by share and writes every share out', () => {
    const { el } = mount(RatioBarComponent, {
      parts: [{ label: 'reutilizadas', value: 4, kind: 'solid' }, { label: 'ejecutadas', value: 6, kind: 'hatch' }],
      ariaLabel: 'Caché',
    });
    const solid = q(el, '[data-testid=part-solid]')!;
    const hatch = q(el, '[data-testid=part-hatch]')!;
    expect(Number(solid.style.flexGrow)).toBeCloseTo(40, 3);
    expect(Number(hatch.style.flexGrow)).toBeCloseTo(60, 3);
    const legend = q(el, '[data-testid=ratio-legend]')!.textContent!.replace(/\s+/g, ' ');
    expect(legend).toContain('reutilizadas: 4 (40 %)');
    expect(legend).toContain('ejecutadas: 6 (60 %)');
    expect(q(el, '[data-testid=ratio-bar]')?.getAttribute('aria-label')).toContain('reutilizadas: 4 (40 %)');
  });

  it('draws no segment for a part with no weight and survives all zeros', () => {
    const one = mount(RatioBarComponent, { parts: [{ label: 'a', value: 5, kind: 'solid' }, { label: 'b', value: 0, kind: 'hatch' }], ariaLabel: 'x' }).el;
    expect(q(one, '[data-testid=part-hatch]')).toBeNull();
    const none = mount(RatioBarComponent, { parts: [{ label: 'a', value: 0, kind: 'solid' }], ariaLabel: 'x' }).el;
    expect(none.textContent).toContain('0 %');
    expect(none.innerHTML).not.toContain('NaN');
  });
});

@Component({
  imports: [ChartFrameComponent],
  template: `<mo-chart-frame [title]="'Mi gráfica'" [description]="'Describe la gráfica'" [table]="table"><svg data-testid="inner"></svg></mo-chart-frame>`,
})
class HostComponent {
  table: ChartTable = { columns: ['fase', 'segundos'], rows: [['render', 30], ['tts', 10]] };
}

describe('mo-chart-frame', () => {
  function host(table?: ChartTable) {
    const f = TestBed.createComponent(HostComponent);
    if (table) f.componentInstance.table = table;
    f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('is a figure named by its title and described by its description', () => {
    const { el } = host();
    const fig = q(el, 'figure')!;
    expect(q(el, `#${fig.getAttribute('aria-labelledby')}`)?.textContent).toBe('Mi gráfica');
    expect(q(el, `#${fig.getAttribute('aria-describedby')}`)?.textContent).toBe('Describe la gráfica');
  });

  it('switches to the same data as a table and back', () => {
    const { f, el } = host();
    expect(q(el, '[data-testid=inner]')).not.toBeNull();
    expect(q(el, '[data-testid=chart-table]')).toBeNull();
    (q(el, '[data-testid=chart-toggle]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(q(el, '[data-testid=inner]')).toBeNull();
    const cells = qa(el, '[data-testid=chart-table] td').map((c) => c.textContent);
    expect(cells).toEqual(['render', '30', 'tts', '10']);
    expect(qa(el, '[data-testid=chart-table] th').map((c) => c.textContent)).toEqual(['fase', 'segundos']);
    expect(q(el, '[data-testid=chart-toggle]')?.getAttribute('aria-pressed')).toBe('true');
    expect(q(el, '[data-testid=chart-toggle]')?.textContent).toContain('Ver gráfica');
    (q(el, '[data-testid=chart-toggle]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(q(el, '[data-testid=inner]')).not.toBeNull();
    expect(q(el, '[data-testid=chart-toggle]')?.textContent).toContain('Ver como tabla');
  });

  it('offers no table switch when there is no data', () => {
    const { el } = host({ columns: ['a'], rows: [] });
    expect(q(el, '[data-testid=chart-toggle]')).toBeNull();
  });

  it('keeps a wide table inside the frame instead of widening the page', () => {
    const { f, el } = host();
    (q(el, '[data-testid=chart-toggle]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(q(el, '.frame__table')).not.toBeNull();
  });
});
