import { makeAutoObservable, runInAction } from 'mobx';
import type {
  CreateNodeRequest,
  NodeConnectionTestResult,
  NodeMetadata,
  TestNodeConnectionRequest,
  UpdateNodeRequest,
} from '@wg-easy-plane/contracts';

type NodeFailure = 'load' | 'create' | 'update' | 'test' | 'delete' | null;
type Fetcher = typeof globalThis.fetch;

type NodeListResponse = {
  items: NodeMetadata[];
  page: { nextCursor: string | null };
};

export class NodeStore {
  items: NodeMetadata[] = [];
  nextCursor: string | null = null;
  lastTestResult: NodeConnectionTestResult | null = null;
  failure: NodeFailure = null;
  loading = false;
  submitting = false;
  testingNodeId: string | null = null;

  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {
    makeAutoObservable<NodeStore, 'fetcher'>(
      this,
      { fetcher: false },
      { autoBind: true },
    );
  }

  async load(reset = true): Promise<void> {
    this.loading = true;
    this.failure = null;
    const cursor = reset ? null : this.nextCursor;
    try {
      const search = new URLSearchParams({ limit: '50' });
      if (cursor) search.set('cursor', cursor);
      const response = await this.fetcher(`/api/v1/nodes?${search}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to list nodes');
      const body = (await response.json()) as NodeListResponse;
      runInAction(() => {
        this.items = reset ? body.items : [...this.items, ...body.items];
        this.nextCursor = body.page.nextCursor;
      });
    } catch {
      runInAction(() => {
        this.failure = 'load';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async create(input: CreateNodeRequest): Promise<boolean> {
    return this.#save('create', '/api/v1/nodes', 'POST', input);
  }

  async update(nodeId: string, input: UpdateNodeRequest): Promise<boolean> {
    return this.#save('update', `/api/v1/nodes/${nodeId}`, 'PATCH', input);
  }

  async testConnection(input: TestNodeConnectionRequest): Promise<boolean> {
    this.submitting = true;
    this.failure = null;
    this.lastTestResult = null;
    try {
      const response = await this.fetcher('/api/v1/nodes/test', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('Unable to test node');
      const result = (await response.json()) as NodeConnectionTestResult;
      runInAction(() => {
        this.lastTestResult = result;
      });
      return true;
    } catch {
      runInAction(() => {
        this.failure = 'test';
      });
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  async retest(nodeId: string): Promise<boolean> {
    this.testingNodeId = nodeId;
    this.failure = null;
    try {
      const response = await this.fetcher(`/api/v1/nodes/${nodeId}/test`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to retest node');
      const node = (await response.json()) as NodeMetadata;
      runInAction(() => {
        this.#replace(node);
      });
      return true;
    } catch {
      runInAction(() => {
        this.failure = 'test';
      });
      return false;
    } finally {
      runInAction(() => {
        this.testingNodeId = null;
      });
    }
  }

  async delete(nodeId: string): Promise<boolean> {
    this.submitting = true;
    this.failure = null;
    try {
      const response = await this.fetcher(`/api/v1/nodes/${nodeId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to delete node');
      runInAction(() => {
        this.items = this.items.filter((node) => node.id !== nodeId);
      });
      return true;
    } catch {
      runInAction(() => {
        this.failure = 'delete';
      });
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  clearFailure(): void {
    this.failure = null;
  }

  clearTestResult(): void {
    this.lastTestResult = null;
  }

  async #save(
    failure: 'create' | 'update',
    url: string,
    method: 'POST' | 'PATCH',
    input: CreateNodeRequest | UpdateNodeRequest,
  ): Promise<boolean> {
    this.submitting = true;
    this.failure = null;
    try {
      const response = await this.fetcher(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error('Unable to save node');
      const node = (await response.json()) as NodeMetadata;
      runInAction(() => {
        this.#replace(node, failure === 'create');
      });
      return true;
    } catch {
      runInAction(() => {
        this.failure = failure;
      });
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  #replace(node: NodeMetadata, prepend = false): void {
    const existing = this.items.findIndex((item) => item.id === node.id);
    if (existing >= 0) {
      this.items = this.items.map((item) =>
        item.id === node.id ? node : item,
      );
    } else if (prepend) {
      this.items = [node, ...this.items];
    } else {
      this.items = [...this.items, node];
    }
  }
}
