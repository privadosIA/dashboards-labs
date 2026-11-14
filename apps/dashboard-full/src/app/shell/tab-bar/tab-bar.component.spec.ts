import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Tab, TabBarComponent } from './tab-bar.component';

@Component({
  imports: [TabBarComponent],
  template: `<app-tab-bar [tabs]="tabs" moreLabel="Más" (more)="opened = opened + 1" /><input id="f" type="text" /><input id="c" type="checkbox" />`,
})
class Host {
  tabs: Tab[] = [
    { path: '/create', icon: 'mic', label: 'Crear' },
    { path: '/gallery', icon: 'photo_library', label: 'Galería' },
  ];
  opened = 0;
}

describe('TabBarComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.autoDetectChanges();
    return fixture;
  }
  const bar = () => document.querySelector('[data-testid="tab-bar"]') as HTMLElement;

  it('has a tab per section and a More tab', () => {
    const f = render();
    const labels = Array.from(bar().querySelectorAll('.tabs__label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Crear', 'Galería', 'Más']);
    f.nativeElement.remove();
  });

  it('does not underline its tabs: they are links that say so with .lab-plain-link', () => {
    const f = render();
    const links = Array.from(bar().querySelectorAll('a.tabs__tab'));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.classList.contains('lab-plain-link')).toBe(true);
    f.nativeElement.remove();
  });

  it('asks the shell to open More', () => {
    const f = render();
    (document.querySelector('[data-testid="tab-more"]') as HTMLElement).click();
    expect(f.componentInstance.opened).toBe(1);
    f.nativeElement.remove();
  });

  it('steps aside while a text field has the keyboard open, and comes back after', async () => {
    const f = render();
    const field = document.getElementById('f') as HTMLInputElement;
    field.focus();
    f.detectChanges();
    expect(bar().classList.contains('tabs--hidden')).toBe(true);
    field.blur();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    expect(bar().classList.contains('tabs--hidden')).toBe(false);
    f.nativeElement.remove();
  });

  it('tells the screens how tall it is, and 0 while it is out of the way', async () => {
    const f = render();
    const height = () => document.documentElement.style.getPropertyValue('--app-tabbar-h');
    expect(height()).toContain('56px');
    (document.getElementById('f') as HTMLInputElement).focus();
    f.detectChanges();
    expect(height()).toBe('0px');
    f.destroy();
    expect(height()).toBe('');
    f.nativeElement.remove();
  });

  it('stays when a checkbox is focused: no keyboard opens', () => {
    const f = render();
    (document.getElementById('c') as HTMLInputElement).focus();
    f.detectChanges();
    expect(bar().classList.contains('tabs--hidden')).toBe(false);
    f.nativeElement.remove();
  });
});
