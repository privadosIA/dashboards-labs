import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface Tab {
  path: string;
  icon: string;
  label: string;
}

/** Whether the element takes text from the keyboard (the on-screen keyboard is then open). */
function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(el.type);
}

/**
 * The bottom bar of the phone shell: the sections as tabs and a "More" tab that asks the shell to open its sheet. It
 * keeps clear of the notch and the home indicator, and steps aside while a text field has the keyboard open, so it
 * never covers what is being typed.
 */
@Component({
  selector: 'app-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './tab-bar.component.html',
  styleUrl: './tab-bar.component.scss',
})
export class TabBarComponent {
  readonly tabs = input.required<Tab[]>();
  readonly moreLabel = input.required<string>();
  readonly more = output<void>();

  protected readonly typing = signal(false);

  constructor() {
    const on = () => this.typing.set(isTextField(document.activeElement));
    const focusin = (e: Event) => this.typing.set(isTextField(e.target));
    const focusout = () => setTimeout(on); // the next field takes the focus after this event
    // Screens that stick things to the bottom (the composer, the buttons of a card) keep above the bar by this height.
    effect(() => {
      document.documentElement.style.setProperty('--app-tabbar-h', this.typing() ? '0px' : 'calc(56px + env(safe-area-inset-bottom, 0px))');
    });
    document.addEventListener('focusin', focusin);
    document.addEventListener('focusout', focusout);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('focusin', focusin);
      document.removeEventListener('focusout', focusout);
      document.documentElement.style.removeProperty('--app-tabbar-h');
    });
  }
}
