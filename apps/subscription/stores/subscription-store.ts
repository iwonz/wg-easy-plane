import {
  SubscriptionExchangeResponseSchema,
  SubscriptionSummarySchema,
} from '@wg-easy-plane/contracts';
import type { SubscriptionSummary } from '@wg-easy-plane/contracts';
import { makeAutoObservable, runInAction } from 'mobx';

export type SubscriptionState =
  'idle' | 'exchanging' | 'loading' | 'ready' | 'unauthorized' | 'unavailable';

type Fetcher = typeof globalThis.fetch;

export type FragmentBrowser = {
  location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  history: Pick<History, 'replaceState'>;
};

const tokenPattern = /^wgep_sub_[A-Za-z0-9_-]{43}$/u;

export class SubscriptionStore {
  state: SubscriptionState = 'idle';
  summary: SubscriptionSummary | null = null;
  sessionExpiresAt: string | null = null;
  private initialized = false;

  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {
    makeAutoObservable<SubscriptionStore, 'fetcher' | 'initialized'>(
      this,
      { fetcher: false, initialized: false },
      { autoBind: true },
    );
  }

  async initialize(browser: FragmentBrowser): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    let fragment = browser.location.hash.slice(1);
    browser.history.replaceState(
      null,
      '',
      `${browser.location.pathname}${browser.location.search}` || '/',
    );

    if (fragment !== '') {
      if (!tokenPattern.test(fragment)) {
        fragment = '';
        this.state = 'unauthorized';
        return;
      }
      this.state = 'exchanging';
      try {
        const response = await this.fetcher('/api/session/exchange', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: fragment }),
        });
        fragment = '';
        if (!response.ok) {
          this.setFailure(response.status);
          return;
        }
        const exchange = SubscriptionExchangeResponseSchema.safeParse(
          await response.json(),
        );
        if (!exchange.success) {
          this.setFailure(502);
          return;
        }
        runInAction(() => {
          this.sessionExpiresAt = exchange.data.sessionExpiresAt;
        });
      } catch {
        fragment = '';
        this.setFailure(502);
        return;
      }
    }

    fragment = '';
    await this.load();
  }

  async load(): Promise<void> {
    this.state = 'loading';
    try {
      const response = await this.fetcher('/api/subscription', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        this.setFailure(response.status);
        return;
      }
      const summary = SubscriptionSummarySchema.safeParse(
        await response.json(),
      );
      if (!summary.success) {
        this.setFailure(502);
        return;
      }
      runInAction(() => {
        this.summary = summary.data;
        this.state = 'ready';
      });
    } catch {
      this.setFailure(502);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.fetcher('/api/session/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Browser state is cleared even if the BFF is unavailable.
    }
    runInAction(() => {
      this.summary = null;
      this.sessionExpiresAt = null;
      this.state = 'unauthorized';
    });
  }

  private setFailure(status: number): void {
    runInAction(() => {
      this.summary = null;
      this.sessionExpiresAt = null;
      this.state = status === 401 ? 'unauthorized' : 'unavailable';
    });
  }
}
