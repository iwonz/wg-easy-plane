import { makeAutoObservable, runInAction } from 'mobx';

type AuthState = 'loading' | 'setup' | 'login' | 'authenticated' | 'error';
type AuthFailure =
  'invalid-credentials' | 'rate-limited' | 'request-failed' | null;

export type AuthAdmin = {
  id: string;
  username: string;
};

type Fetcher = typeof globalThis.fetch;

export class AuthStore {
  state: AuthState = 'loading';
  admin: AuthAdmin | null = null;
  failure: AuthFailure = null;
  submitting = false;

  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {
    makeAutoObservable<AuthStore, 'fetcher'>(
      this,
      { fetcher: false },
      { autoBind: true },
    );
  }

  async initialize(): Promise<void> {
    this.state = 'loading';
    this.failure = null;
    try {
      const status = await this.fetchJson<{ setupRequired: boolean }>(
        '/api/v1/auth/setup/status',
      );
      if (status.setupRequired) {
        runInAction(() => {
          this.state = 'setup';
        });
        return;
      }
      await this.restoreSession();
    } catch {
      runInAction(() => {
        this.state = 'error';
        this.failure = 'request-failed';
      });
    }
  }

  async setup(username: string, password: string): Promise<void> {
    await this.submitCredentials('/api/v1/auth/setup', username, password);
  }

  async login(username: string, password: string): Promise<void> {
    await this.submitCredentials('/api/v1/auth/login', username, password);
  }

  async logout(): Promise<void> {
    this.submitting = true;
    try {
      await this.fetcher('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Local authentication state is cleared even if the server is unreachable.
    } finally {
      runInAction(() => {
        this.admin = null;
        this.failure = null;
        this.submitting = false;
        this.state = 'login';
      });
    }
  }

  clearFailure(): void {
    this.failure = null;
  }

  private async restoreSession(): Promise<void> {
    let response = await this.fetcher('/api/v1/auth/me', {
      credentials: 'same-origin',
    });
    if (response.status === 401) {
      const refresh = await this.fetcher('/api/v1/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (refresh.ok) {
        response = await this.fetcher('/api/v1/auth/me', {
          credentials: 'same-origin',
        });
      }
    }

    if (response.status === 401) {
      runInAction(() => {
        this.admin = null;
        this.state = 'login';
      });
      return;
    }
    if (!response.ok) throw new Error('Unable to restore authentication');
    const body = (await response.json()) as { admin: AuthAdmin };
    runInAction(() => {
      this.admin = body.admin;
      this.state = 'authenticated';
    });
  }

  private async submitCredentials(
    endpoint: string,
    username: string,
    password: string,
  ): Promise<void> {
    this.submitting = true;
    this.failure = null;
    try {
      const response = await this.fetcher(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        runInAction(() => {
          this.failure =
            response.status === 401
              ? 'invalid-credentials'
              : response.status === 429
                ? 'rate-limited'
                : 'request-failed';
        });
        return;
      }

      const body = (await response.json()) as { admin: AuthAdmin };
      runInAction(() => {
        this.admin = body.admin;
        this.state = 'authenticated';
      });
    } catch {
      runInAction(() => {
        this.failure = 'request-failed';
      });
    } finally {
      runInAction(() => {
        this.submitting = false;
      });
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await this.fetcher(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Request failed');
    return (await response.json()) as T;
  }
}
