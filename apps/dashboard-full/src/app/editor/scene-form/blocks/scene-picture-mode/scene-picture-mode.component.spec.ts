import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScenePictureModeComponent } from './scene-picture-mode.component';

describe('ScenePictureModeComponent: the 3D scene way', () => {
  let fixture: ComponentFixture<ScenePictureModeComponent>;
  const toggle = () => (fixture.nativeElement as HTMLElement).querySelector('[data-testid=picture-mode-blender]');

  function open(blenderAllowed: boolean): void {
    TestBed.configureTestingModule({ imports: [ScenePictureModeComponent] });
    fixture = TestBed.createComponent(ScenePictureModeComponent);
    fixture.componentRef.setInput('mode', 'ai');
    fixture.componentRef.setInput('blenderAllowed', blenderAllowed);
    fixture.detectChanges();
  }

  it('is offered when it is allowed (video projects)', () => {
    open(true);
    expect(toggle()).toBeTruthy();
    expect(toggle()?.textContent).toContain('Escena 3D');
  });

  it('is not offered otherwise', () => {
    open(false);
    expect(toggle()).toBeNull();
  });

  it('choosing it says so', () => {
    open(true);
    const chosen: string[] = [];
    fixture.componentInstance.modeChange.subscribe((m) => chosen.push(m));
    (toggle()?.querySelector('button') as HTMLButtonElement).click();
    expect(chosen).toEqual(['blender']);
  });
});
