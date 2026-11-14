import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MusicTagCategory } from '../../core/api.models';
import { TagPickerComponent } from './tag-picker.component';

const VOCAB: MusicTagCategory[] = [
  { id: 'genre', tags: ['techno', 'rap', 'pop'] },
  { id: 'tempo', tags: ['fast', 'slow'] },
];

describe('TagPickerComponent', () => {
  let fixture: ComponentFixture<TagPickerComponent>;
  let emitted: string[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TagPickerComponent] }).compileComponents();
    fixture = TestBed.createComponent(TagPickerComponent);
    emitted = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));
    fixture.componentRef.setInput('categories', VOCAB);
    fixture.componentRef.setInput('value', 'techno,fast');
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('shows the tags in use as chips', () => {
    expect(el().querySelector('[data-testid=tag-techno]')).not.toBeNull();
    expect(el().querySelector('[data-testid=tag-fast]')).not.toBeNull();
    expect(el().querySelector('[data-testid=tag-rap]')).toBeNull();
  });

  it('removes a tag with its button', () => {
    (el().querySelector('[data-testid=tag-fast] button') as HTMLButtonElement).click();
    expect(emitted).toEqual(['techno']);
  });

  it('adds a tag of the vocabulary', () => {
    (el().querySelector('[data-testid=option-rap] button') as HTMLElement).click();
    fixture.detectChanges();
    expect(emitted.at(-1)).toBe('techno,fast,rap');
  });

  it('asks for a genre when there are no tags', () => {
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();
    expect(el().querySelector('.none')?.textContent).toContain('género');
  });
});
