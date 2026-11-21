import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { EmptyStateComponent } from './empty-state/empty-state.component';
import { PageHeaderComponent } from './page-header/page-header.component';
import { PanelComponent } from './panel/panel.component';

@Component({
  imports: [PageHeaderComponent, PanelComponent, EmptyStateComponent],
  template: `
    <mo-page-header title="Proyectos" [description]="desc()">
      <button moActions data-testid="primary">Crear proyecto</button>
    </mo-page-header>
    <mo-page-header title="Sin acciones" />
    <mo-panel heading="Salida" [description]="panelDesc()">
      <button moPanelActions data-testid="panel-action">Editar</button>
      <p data-testid="panel-body">contenido</p>
    </mo-panel>
    <mo-panel heading="Sin descripción"><span>x</span></mo-panel>
    <mo-empty-state icon="folder_open" message="No hay proyectos" [hint]="hint()">
      <button data-testid="empty-action">Crear</button>
    </mo-empty-state>
    <mo-empty-state message="Vacío" />
  `,
})
class HostComponent {
  desc = signal<string | undefined>('Cada proyecto es una colección de escenas.');
  panelDesc = signal<string | undefined>('Dónde se guarda el resultado.');
  hint = signal<string | undefined>('Crea uno o importa un dataset.');
}

function host() {
  const f = TestBed.createComponent(HostComponent);
  f.detectChanges();
  return { f, el: f.nativeElement as HTMLElement };
}
const all = (el: HTMLElement, sel: string) => Array.from(el.querySelectorAll(sel)) as HTMLElement[];

describe('mo-page-header', () => {
  it('is the page h1, followed by a one-line description and the primary action on the right', () => {
    const { el } = host();
    const first = all(el, 'mo-page-header')[0];
    expect(first.querySelector('h1')?.textContent).toBe('Proyectos');
    expect(first.querySelector('[data-testid=page-desc]')?.textContent).toContain('colección de escenas');
    expect(first.querySelector('[data-testid=page-actions] [data-testid=primary]')?.textContent).toBe('Crear proyecto');
  });

  it('omits the description and hides the empty actions area when there is none', () => {
    const { el } = host();
    const second = all(el, 'mo-page-header')[1];
    expect(second.querySelector('[data-testid=page-desc]')).toBeNull();
    expect(second.querySelector('[data-testid=page-actions]')?.childElementCount).toBe(0);
    expect(second.querySelector('h1')?.textContent).toBe('Sin acciones');
  });

  it('drops the description when it becomes empty', () => {
    const { f, el } = host();
    f.componentInstance.desc.set(undefined);
    f.detectChanges();
    expect(all(el, 'mo-page-header')[0].querySelector('[data-testid=page-desc]')).toBeNull();
  });
});

describe('mo-panel', () => {
  it('shows its heading, description, header action and body', () => {
    const { el } = host();
    const p = all(el, 'mo-panel')[0];
    expect(p.querySelector('h2')?.textContent).toBe('Salida');
    expect(p.querySelector('[data-testid=panel-desc]')?.textContent).toContain('resultado');
    expect(p.querySelector('.panel__actions [data-testid=panel-action]')).not.toBeNull();
    expect(p.querySelector('.panel__body [data-testid=panel-body]')?.textContent).toBe('contenido');
  });

  it('is a labelled section, and omits the description when absent', () => {
    const { el } = host();
    const p = all(el, 'mo-panel')[1];
    expect(p.querySelector('section')?.getAttribute('aria-label')).toBe('Sin descripción');
    expect(p.querySelector('[data-testid=panel-desc]')).toBeNull();
  });
});

describe('mo-empty-state', () => {
  it('says why it is empty, with an icon, a hint and the action that fills it', () => {
    const { el } = host();
    const e = all(el, 'mo-empty-state')[0];
    expect(e.querySelector('[role=status]')).not.toBeNull();
    expect(e.querySelector('mat-icon')?.textContent?.trim()).toBe('folder_open');
    expect(e.querySelector('[data-testid=empty-message]')?.textContent).toBe('No hay proyectos');
    expect(e.querySelector('[data-testid=empty-hint]')?.textContent).toContain('importa un dataset');
    expect(e.querySelector('[data-testid=empty-actions] [data-testid=empty-action]')).not.toBeNull();
  });

  it('works with only a message: default icon, no hint, no actions area', () => {
    const { el } = host();
    const e = all(el, 'mo-empty-state')[1];
    expect(e.querySelector('mat-icon')?.textContent?.trim()).toBe('inbox');
    expect(e.querySelector('[data-testid=empty-hint]')).toBeNull();
    expect(e.querySelector('[data-testid=empty-actions]')?.childElementCount).toBe(0);
  });
});
