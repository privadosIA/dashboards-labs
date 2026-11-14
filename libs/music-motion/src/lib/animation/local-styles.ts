import { Injectable, inject, signal } from '@angular/core';

import { ANIM_CLIENT } from '../core/client';
import { MUSIC_MOTION_OPTIONS } from '../core/options';
import type { Design } from '@lab/animation-core';

/** The most styles the browser keeps for one dashboard. */
export const MAX_LOCAL_STYLES = 100;
const MAX_STARTED = 200;

/** A style kept in this browser: what the server cannot take (no reference to start from) or what was made with the builder. */
export interface LocalStyle {
  readonly id: string;
  readonly name: string;
  readonly design: Design;
  /** How long a piece of the script lasts, in seconds. */
  readonly rhythm: number;
  readonly parts: readonly string[];
  /** The YouTube address of the reference it came from, when it had one. */
  readonly reference?: string;
  readonly createdAt: number;
}

export type LocalStyleInput = Omit<LocalStyle, 'id' | 'createdAt'>;

const isStyle = (v: unknown): v is LocalStyle => {
  const s = v as Record<string, unknown> | null;
  return typeof s === 'object' && s !== null && typeof s['id'] === 'string' && typeof s['name'] === 'string' && typeof s['rhythm'] === 'number' && Array.isArray(s['parts']) && typeof s['design'] === 'object' && s['design'] !== null;
};

/**
 * The styles kept in the browser. It is the only reader and writer of the storage for them, under a key that includes the
 * dashboard's client name so that two dashboards on one origin do not share it by accident. If the storage cannot be used the
 * styles live until the page is closed and `durable` says so.
 */
@Injectable({ providedIn: 'root' })
export class LocalStyles {
  private readonly key = `music-motion.styles.${inject(MUSIC_MOTION_OPTIONS, { optional: true })?.client ?? ANIM_CLIENT}`;
  private counter = 0;
  /** False once the storage could not be read or written: what is in the list will not survive a reload. */
  readonly durable = signal(true);
  readonly styles = signal<readonly LocalStyle[]>(this.read());
  private readonly started = signal<Record<string, string>>(this.readStarted());

  /** Keeps a style; `null` when the browser already holds the most it keeps. */
  add(input: LocalStyleInput, now: number = Date.now()): LocalStyle | null {
    if (this.styles().length >= MAX_LOCAL_STYLES) return null;
    const style: LocalStyle = { ...input, id: `local-${now.toString(36)}-${(this.counter += 1)}`, createdAt: now };
    this.set([style, ...this.styles()]);
    return style;
  }

  /** Remembers that a piece started from an own style, so its screen can say so after a reload. */
  noteStart(pieceId: string, styleName: string): void {
    const next = { ...this.started(), [pieceId]: styleName };
    const keys = Object.keys(next);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_STARTED))) delete next[old];
    this.started.set(next);
    try {
      localStorage.setItem(`${this.key}.started`, JSON.stringify(next));
    } catch {
      this.durable.set(false);
    }
  }

  /** The name of the own style a piece started from, if it did. */
  startedFrom(pieceId: string): string | undefined {
    return this.started()[pieceId];
  }

  update(id: string, input: LocalStyleInput): void {
    this.set(this.styles().map((s) => (s.id === id ? { ...input, id, createdAt: s.createdAt } : s)));
  }

  remove(id: string): void {
    this.set(this.styles().filter((s) => s.id !== id));
  }

  private set(list: readonly LocalStyle[]): void {
    this.styles.set(list);
    try {
      localStorage.setItem(this.key, JSON.stringify(list));
    } catch {
      this.durable.set(false);
    }
  }

  private readStarted(): Record<string, string> {
    try {
      const found: unknown = JSON.parse(localStorage.getItem(`${this.key}.started`) ?? '{}');
      return found !== null && typeof found === 'object' && !Array.isArray(found) ? (found as Record<string, string>) : {};
    } catch {
      return {};
    }
  }

  private read(): readonly LocalStyle[] {
    try {
      const text = localStorage.getItem(this.key);
      const found: unknown = text ? JSON.parse(text) : [];
      return Array.isArray(found) ? found.filter(isStyle).slice(0, MAX_LOCAL_STYLES) : [];
    } catch {
      this.durable.set(false);
      return [];
    }
  }
}
