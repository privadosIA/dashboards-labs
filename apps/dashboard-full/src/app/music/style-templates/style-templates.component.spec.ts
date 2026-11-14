import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEMPLATE_GROUPS } from '../style-templates';
import { StyleTemplatesComponent } from './style-templates.component';

const rock = TEMPLATE_GROUPS.flatMap((g) => g.templates).find((t) => t.id === 'rock')!;

describe('StyleTemplatesComponent', () => {
  let fixture: ComponentFixture<StyleTemplatesComponent>;
  const emitted: string[] = [];

  beforeEach(async () => {
    emitted.length = 0;
    await TestBed.configureTestingModule({ imports: [StyleTemplatesComponent] }).compileComponents();
    fixture = TestBed.createComponent(StyleTemplatesComponent);
    fixture.componentInstance.changed.subscribe((v) => emitted.push(v));
    fixture.componentRef.setInput('testId', 't');
    fixture.componentRef.setInput('text', 'slow guitar');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('mat-expansion-panel-header') as HTMLElement).click();
    fixture.detectChanges();
  });

  const chip = (id: string) => fixture.nativeElement.querySelector(`[data-testid=t-${id}]`) as HTMLButtonElement;

  it('lists every template, none pressed for an unrelated style', () => {
    const chips = fixture.nativeElement.querySelectorAll('button.chip') as NodeListOf<HTMLButtonElement>;
    expect(chips.length).toBe(TEMPLATE_GROUPS.flatMap((g) => g.templates).length);
    expect(Array.from(chips).every((c) => c.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('choosing one reports the style with its text added', () => {
    chip('rock').click();
    expect(emitted).toEqual([`slow guitar, ${rock.text}`]);
  });

  it('shows a template as pressed while its text is in the style, and choosing it removes it', () => {
    fixture.componentRef.setInput('text', `slow guitar, ${rock.text}`);
    fixture.detectChanges();
    expect(chip('rock').getAttribute('aria-pressed')).toBe('true');
    expect(chip('jazz').getAttribute('aria-pressed')).toBe('false');
    chip('rock').click();
    expect(emitted).toEqual(['slow guitar']);
  });

  it('carries its text in the tooltip', () => {
    expect(chip('rock').getAttribute('title')).toBe(rock.text);
  });
});
