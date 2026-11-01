import type { SediaAdapter, SediaSearchOptions, SediaSearchResult } from './sedia';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening circuit
  resetTimeoutMs?: number;   // Time to wait before attempting half-open recovery
}

export class SediaCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      this.successCount = 0;
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  public recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    } else if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    }
  }

  public async execute<T>(action: () => Promise<T>, fallback: T): Promise<T> {
    const currentState = this.getState();
    if (currentState === 'OPEN') {
      return fallback;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (_err) {
      this.recordFailure();
      return fallback;
    }
  }

  public async wrapSediaSearch(
    adapter: SediaAdapter,
    options: SediaSearchOptions
  ): Promise<SediaSearchResult> {
    const fallbackResult: SediaSearchResult = {
      totalResults: 0,
      pageNumber: 1,
      pageSize: options.pageSize ?? 10,
      topics: [],
      schemaDrift: [],
      errors: ['SEDIA Circuit Breaker is OPEN: Upstream API temporarily unavailable due to network failures'],
    };

    return this.execute(() => adapter.searchSedia(options), fallbackResult);
  }
}
