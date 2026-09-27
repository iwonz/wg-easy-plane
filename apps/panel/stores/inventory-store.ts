import { makeAutoObservable, runInAction } from 'mobx';
import type {
  AmbiguousCreateCandidate,
  DiscoveredClient,
  ManagedClient,
  ManagedClientMutationResult,
  NodeMetadata,
} from '@wg-easy-plane/contracts';

type Fetcher = typeof globalThis.fetch;

type DiscoveredListResponse = {
  items: DiscoveredClient[];
  page: { nextCursor: string | null };
};

type ManagedListResponse = {
  items: ManagedClient[];
  page: { nextCursor: string | null };
};

type NodeListResponse = {
  items: NodeMetadata[];
  page: { nextCursor: string | null };
};

export class InventoryStore {
  items: DiscoveredClient[] = [];
  managedItems: ManagedClient[] = [];
  nodes: NodeMetadata[] = [];
  nextCursor: string | null = null;
  managedNextCursor: string | null = null;
  loading = false;
  managedLoading = false;
  mutating = false;
  failure = false;
  managedFailure = false;

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
    await this.loadDiscovered(reset);
  }

  async loadAll(): Promise<void> {
    await Promise.all([
      this.loadDiscovered(),
      this.loadManaged(),
      this.loadNodes(),
    ]);
  }

  async loadDiscovered(reset = true): Promise<void> {
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

  async loadManaged(reset = true): Promise<void> {
    this.managedLoading = true;
    this.managedFailure = false;
    const cursor = reset ? null : this.managedNextCursor;
    try {
      const search = new URLSearchParams({ limit: '50' });
      if (cursor) search.set('cursor', cursor);
      const response = await this.fetcher(`/api/v1/clients/managed?${search}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to load managed clients');
      const body = (await response.json()) as ManagedListResponse;
      runInAction(() => {
        this.managedItems = reset
          ? body.items
          : [...this.managedItems, ...body.items];
        this.managedNextCursor = body.page.nextCursor;
      });
    } catch {
      runInAction(() => {
        this.managedFailure = true;
      });
    } finally {
      runInAction(() => {
        this.managedLoading = false;
      });
    }
  }

  async loadNodes(): Promise<void> {
    try {
      const response = await this.fetcher('/api/v1/nodes?limit=200', {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to load nodes');
      const body = (await response.json()) as NodeListResponse;
      runInAction(() => {
        this.nodes = body.items;
      });
    } catch {
      runInAction(() => {
        this.managedFailure = true;
      });
    }
  }

  async createManaged(input: {
    name: string;
    expiresAt?: string | null;
    nodeIds: string[];
  }): Promise<boolean> {
    return this.#mutate('/api/v1/clients/managed', 'POST', input);
  }

  async updateManaged(
    clientId: string,
    input: { name?: string; expiresAt?: string | null },
  ): Promise<boolean> {
    return this.#mutate(`/api/v1/clients/managed/${clientId}`, 'PATCH', input);
  }

  async setManagedEnabled(
    client: ManagedClient,
    enabled: boolean,
  ): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${client.id}/${enabled ? 'enable' : 'disable'}`,
      'POST',
    );
  }

  async deleteManaged(clientId: string): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${clientId}`,
      'DELETE',
      undefined,
      true,
    );
  }

  async addPlacement(clientId: string, nodeId: string): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${clientId}/placements`,
      'POST',
      { nodeId },
    );
  }

  async removePlacement(
    clientId: string,
    placementId: string,
  ): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${clientId}/placements/${placementId}`,
      'DELETE',
      undefined,
      true,
    );
  }

  async retryPlacement(
    clientId: string,
    placementId: string,
  ): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${clientId}/placements/${placementId}/retry`,
      'POST',
      undefined,
      true,
    );
  }

  async listCandidates(
    clientId: string,
    placementId: string,
  ): Promise<AmbiguousCreateCandidate[]> {
    const response = await this.fetcher(
      `/api/v1/clients/managed/${clientId}/placements/${placementId}/candidates`,
      { credentials: 'same-origin' },
    );
    if (!response.ok) throw new Error('Unable to load candidates');
    return ((await response.json()) as { items: AmbiguousCreateCandidate[] })
      .items;
  }

  async linkCandidate(
    clientId: string,
    placementId: string,
    remoteClientId: number,
  ): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${clientId}/placements/${placementId}/link`,
      'POST',
      { remoteClientId },
    );
  }

  async cancelAmbiguous(
    clientId: string,
    placementId: string,
  ): Promise<boolean> {
    return this.#mutate(
      `/api/v1/clients/managed/${clientId}/placements/${placementId}/cancel`,
      'POST',
      undefined,
      true,
    );
  }

  async #mutate(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body?: unknown,
    resultEnvelope = false,
  ): Promise<boolean> {
    this.mutating = true;
    this.managedFailure = false;
    try {
      const response = await this.fetcher(url, {
        method,
        credentials: 'same-origin',
        headers:
          body === undefined
            ? undefined
            : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Managed client mutation failed');
      const raw = (await response.json()) as
        ManagedClient | ManagedClientMutationResult;
      const result = resultEnvelope
        ? (raw as ManagedClientMutationResult)
        : { deleted: false, client: raw as ManagedClient };
      runInAction(() => {
        if (result.deleted || !result.client) {
          const clientId = url.split('/')[5];
          this.managedItems = this.managedItems.filter(
            (item) => item.id !== clientId,
          );
        } else {
          const index = this.managedItems.findIndex(
            (item) => item.id === result.client?.id,
          );
          if (index < 0)
            this.managedItems = [result.client, ...this.managedItems];
          else this.managedItems[index] = result.client;
        }
      });
      await this.loadDiscovered(true);
      return true;
    } catch {
      runInAction(() => {
        this.managedFailure = true;
      });
      return false;
    } finally {
      runInAction(() => {
        this.mutating = false;
      });
    }
  }

  clearFailure(): void {
    this.failure = false;
    this.managedFailure = false;
  }
}
