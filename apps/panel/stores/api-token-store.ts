import { makeAutoObservable, runInAction } from 'mobx';
import type {
  ApiTokenMetadata,
  ApiTokenScope,
  CreateApiTokenRequest,
} from '@wg-easy-plane/contracts';

type TokenFailure = 'load' | 'create' | 'revoke' | null;
type Fetcher = typeof globalThis.fetch;

type TokenListResponse = {
  items: ApiTokenMetadata[];
  page: { nextCursor: string | null };
};

type CreatedTokenResponse = {
  token: string;
  metadata: ApiTokenMetadata;
};

export class ApiTokenStore {
  items: ApiTokenMetadata[] = [];
  nextCursor: string | null = null;
  created: CreatedTokenResponse | null = null;
  failure: TokenFailure = null;
  loading = false;
  submitting = false;

  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {
    makeAutoObservable<ApiTokenStore, 'fetcher'>(
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
      const response = await this.fetcher(`/api/v1/tokens?${search}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to list API tokens');
      const body = (await response.json()) as TokenListResponse;
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

  async create(input: {
    name: string;
    scopes: ApiTokenScope[];
    expiresAt: string | null;
  }): Promise<boolean> {
    this.submitting = true;
    this.failure = null;
    const body: CreateApiTokenRequest = {
      name: input.name,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    };
    try {
      const response = await this.fetcher('/api/v1/tokens', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Unable to create API token');
      const created = (await response.json()) as CreatedTokenResponse;
      runInAction(() => {
        this.created = created;
        this.items = [
          created.metadata,
          ...this.items.filter((item) => item.id !== created.metadata.id),
        ];
      });
      return true;
    } catch {
      runInAction(() => {
        this.failure = 'create';
      });
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  async revoke(tokenId: string): Promise<boolean> {
    this.submitting = true;
    this.failure = null;
    try {
      const response = await this.fetcher(`/api/v1/tokens/${tokenId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Unable to revoke API token');
      await this.load();
      return true;
    } catch {
      runInAction(() => {
        this.failure = 'revoke';
      });
      return false;
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  dismissCreated(): void {
    this.created = null;
  }

  clearFailure(): void {
    this.failure = null;
  }

  clearSensitiveState(): void {
    this.created = null;
  }
}
