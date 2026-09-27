import { makeAutoObservable, runInAction } from 'mobx';
import type { DiscoveredClient } from '@wg-easy-plane/contracts';

type Fetcher = typeof globalThis.fetch;

type DiscoveredListResponse = {
  items: DiscoveredClient[];
  page: { nextCursor: string | null };
};

export class InventoryStore {
  items: DiscoveredClient[] = [];
  nextCursor: string | null = null;
  loading = false;
  failure = false;

  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {
    makeAutoObservable<InventoryStore, 'fetcher'>(
      this,
      { fetcher: false },
      { autoBind: true },
    );
  }

  async load(reset = true): Promise<void> {
    this.loading = true;
    this.failure = false;
    const cursor = reset ? null : this.nextCursor;
    try {
      const search = new URLSearchParams({ limit: '50' });
      if (cursor) search.set('cursor', cursor);
      const response = await this.fetcher(
        `/api/v1/clients/discovered?${search}`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) throw new Error('Unable to load discovered clients');
      const body = (await response.json()) as DiscoveredListResponse;
      runInAction(() => {
        this.items = reset ? body.items : [...this.items, ...body.items];
        this.nextCursor = body.page.nextCursor;
      });
    } catch {
      runInAction(() => {
        this.failure = true;
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  clearFailure(): void {
    this.failure = false;
  }
}
