import { describe, test, expect, vi } from 'vitest';
import { SediaCircuitBreaker } from '../../src/lib/adapters/sedia-circuit-breaker';
import type { SediaAdapter } from '../../src/lib/adapters/sedia';

describe('SEDIA Circuit Breaker', () => {
  test('initial state is CLOSED', () => {
    const cb = new SediaCircuitBreaker({ failureThreshold: 3 });
    expect(cb.getState()).toBe('CLOSED');
  });

  test('transitions to OPEN after hitting failureThreshold', () => {
    const cb = new SediaCircuitBreaker({ failureThreshold: 3 });

    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');

    cb.recordFailure(); // 3rd failure
    expect(cb.getState()).toBe('OPEN');
  });

  test('returns fallback immediately when circuit is OPEN without invoking action', async () => {
    const cb = new SediaCircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    const action = vi.fn().mockResolvedValue('success-data');
    const result = await cb.execute(action, 'fallback-data');

    expect(result).toBe('fallback-data');
    expect(action).not.toHaveBeenCalled();
  });

  test('resets to CLOSED on successful execution during HALF_OPEN state', async () => {
    const cb = new SediaCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 });
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    // Wait for resetTimeout
    await new Promise((r) => setTimeout(r, 20));

    expect(cb.getState()).toBe('HALF_OPEN');

    const action = vi.fn().mockResolvedValue('recovered-data');
    const result = await cb.execute(action, 'fallback');

    expect(result).toBe('recovered-data');
    expect(cb.getState()).toBe('CLOSED');
  });

  test('wrapSediaSearch returns empty fallback response with error message when OPEN', async () => {
    const cb = new SediaCircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure();

    const mockAdapter = {
      searchSedia: vi.fn(),
    } as unknown as SediaAdapter;

    const result = await cb.wrapSediaSearch(mockAdapter, { pageSize: 5 });

    expect(result.topics.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/Circuit Breaker is OPEN/i);
    expect(mockAdapter.searchSedia).not.toHaveBeenCalled();
  });
});
