import { type AutoStep, AUTO_STEPS, MAX_FLOWS, STEP_ORDER, type Flow } from './model';

/** The part of `Storage` the flows use, so a host (or a spec) can give any store. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface SaveResult {
  /** The flows dropped to stay within the cap, oldest first. */
  dropped: Flow[];
  /** The browser refused to keep it (storage full or blocked): the flow stays in memory only. */
  failed: boolean;
}

const isFlow = (value: unknown): value is Flow => {
  const f = value as Partial<Flow> | null;
  return (
    typeof f === 'object' && f !== null && typeof f.id === 'string' && typeof f.prompt === 'string' && typeof f.createdAt === 'number' && typeof f.updatedAt === 'number' &&
    typeof f.plan === 'object' && f.plan !== null && typeof f.steps === 'object' && f.steps !== null && STEP_ORDER.every((s) => typeof f.steps?.[s]?.status === 'string') &&
    typeof f.current === 'string' && (STEP_ORDER as readonly string[]).includes(f.current) && typeof f.refs === 'object' && f.refs !== null && Array.isArray(f.attempts)
  );
};

/** The flows of one dashboard, kept in the browser under `<client>.flows`, newest first, at most `MAX_FLOWS`. */
export class FlowStorage {
  private readonly key: string;
  private readonly defaultsKey: string;

  constructor(
    client: string,
    private readonly store: KeyValueStore | undefined,
    private readonly max = MAX_FLOWS,
  ) {
    this.key = `${client}.flows`;
    this.defaultsKey = `${client}.flow-defaults`;
  }

  /** The "do not stop here" switches new flows start with. Only the steps that may run on are read. */
  defaults(): Partial<Record<AutoStep, boolean>> {
    try {
      const raw = JSON.parse(this.store?.getItem(this.defaultsKey) ?? '{}') as Record<string, unknown>;
      return Object.fromEntries(AUTO_STEPS.filter((s) => raw[s] === true).map((s) => [s, true]));
    } catch {
      return {};
    }
  }

  saveDefaults(defaults: Partial<Record<AutoStep, boolean>>): void {
    try {
      this.store?.setItem(this.defaultsKey, JSON.stringify(defaults));
    } catch {
      // blocked: the switches stay for this tab only
    }
  }

  list(): Flow[] {
    try {
      const raw = JSON.parse(this.store?.getItem(this.key) ?? '[]') as unknown;
      return (Array.isArray(raw) ? raw.filter(isFlow) : []).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  get(id: string): Flow | undefined {
    return this.list().find((f) => f.id === id);
  }

  /** Keeps the flow (replacing the one with its id); past the cap the least recently updated ones are dropped and returned. */
  save(flow: Flow): SaveResult {
    const all = [flow, ...this.list().filter((f) => f.id !== flow.id)].sort((a, b) => b.updatedAt - a.updatedAt);
    const kept = all.slice(0, this.max);
    const dropped = all.slice(this.max).reverse();
    try {
      this.store?.setItem(this.key, JSON.stringify(kept));
      return { dropped, failed: false };
    } catch {
      return { dropped: [], failed: true };
    }
  }

  remove(id: string): void {
    try {
      this.store?.setItem(this.key, JSON.stringify(this.list().filter((f) => f.id !== id)));
    } catch {
      // blocked: nothing to remove from
    }
  }

  /** One flow as the text of a file. */
  export(flow: Flow): string {
    return JSON.stringify(flow, null, 2);
  }

  /** A flow from the text of a file; `undefined` when it is not one. It gets a new id when the same one is kept already, so importing never overwrites. */
  import(text: string, newId: () => string): Flow | undefined {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isFlow(parsed)) return undefined;
      const flow = this.get(parsed.id) ? { ...parsed, id: newId() } : parsed;
      this.save(flow);
      return flow;
    } catch {
      return undefined;
    }
  }
}
