import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DynamicFormComponent } from '@core/dynamic-forms';

import connectionEn from './dynamic/connection-form.en.json';
import connectionEs from './dynamic/connection-form.es.json';
import { Lang } from './lang';
import { pickSchema } from './pick-schema';
import { provideLabForms } from './provide-lab-forms';

@Component({
  selector: 'lab-host',
  imports: [DynamicFormComponent],
  template: `<dynamic-form [schema]="schema" [(model)]="model" />`,
})
class HostComponent {
  lang: Lang = 'es';
  model = signal<Record<string, unknown>>({});
  get schema() {
    return pickSchema('connection-form', { en: connectionEn, es: connectionEs }, this.lang);
  }
}

function draw(lang: Lang): HTMLElement {
  TestBed.configureTestingModule({ providers: [provideLabForms({ lang })] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.lang = lang;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('a form drawn from its JSON schema', () => {
  it('shows the Spanish labels in Spanish', () => {
    const text = draw('es').textContent ?? '';
    expect(text).toContain('Conectar con el servidor');
    expect(text).toContain('Dirección del servidor');
    expect(text).not.toContain('Server address');
  });

  it('shows the English labels in English', () => {
    const text = draw('en').textContent ?? '';
    expect(text).toContain('Connect to the server');
    expect(text).toContain('Server address');
    expect(text).not.toContain('Dirección del servidor');
  });

  it('draws one input per field of the schema', () => {
    const el = draw('en');
    expect(el.querySelectorAll('input').length).toBe(connectionEn.fields.length);
  });
});
