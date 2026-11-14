import { ChangeDetectionStrategy, Component, OnInit, input, model } from '@angular/core';

/**
 * A heading that folds what is under it. The content is not drawn while it is folded, so a folded section costs nothing; the editor keeps its
 * state in the document, not in the fields. With a `key` it remembers, in this browser, whether it was left open or folded.
 */
@Component({
  selector: 'app-collapsible',
  templateUrl: './collapsible.html',
  styleUrl: './collapsible.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Collapsible implements OnInit {
  readonly title = input.required<string>();
  /** `section` is a small uppercase heading inside a panel; `panel` is a box of its own (a whole column). */
  readonly look = input<'section' | 'panel'>('section');
  readonly key = input('');
  readonly open = model(true);

  ngOnInit(): void {
    this.restore();
  }

  protected toggle(): void {
    const next = !this.open();
    this.open.set(next);
    const key = this.key();
    if (key) {
      try {
        localStorage.setItem(storageKey(key), next ? '1' : '0');
      } catch {
        // No storage (private window, blocked site data): it works the same, it just forgets.
      }
    }
  }

  /** Reads what was left the last time, when the heading is first drawn. */
  private restore(): void {
    const key = this.key();
    if (!key) return;
    try {
      const saved = localStorage.getItem(storageKey(key));
      if (saved !== null) this.open.set(saved === '1');
    } catch {
      // Same as above.
    }
  }
}

function storageKey(key: string): string {
  return `motion-edit.open.${key}`;
}
