// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { useNow } from '@/lib/hooks/use-now';

/**
 * The two primitives that replaced the `useState` + `useEffect` mount/clock patterns in
 * TASK-MTQV1JYGMGU6V. Both exist to keep a render pure while still depending on something the
 * server cannot know, so the properties worth pinning are the ones a future "simplification"
 * would quietly break: no render loop, and a clock that actually advances.
 */
describe('useIsHydrated', () => {
  afterEach(cleanup);

  it('reports hydrated on the client without an extra state update', () => {
    let renders = 0;
    function Probe() {
      renders += 1;
      return <span>{useIsHydrated() ? 'client' : 'server'}</span>;
    }

    render(<Probe />);

    expect(screen.getByText('client')).toBeTruthy();
    // The old mount effect committed a second render on every mount. This must not.
    expect(renders).toBe(1);
  });
});

describe('useNow', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('floors the clock to the interval so repeated snapshots are stable', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:07.321Z'));

    function Probe() {
      return <span data-testid="now">{String(useNow(5000))}</span>;
    }
    render(<Probe />);

    // 10:00:07.321 floored to a 5s bucket is 10:00:05.000.
    expect(screen.getByTestId('now').textContent).toBe(
      String(new Date('2026-09-07T10:00:05.000Z').getTime())
    );
  });

  it('advances when the interval fires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-07T10:00:00.000Z'));

    function Probe() {
      return <span data-testid="now">{String(useNow(5000))}</span>;
    }
    render(<Probe />);
    const first = screen.getByTestId('now').textContent;

    // Advancing the fake timers moves the clock and fires the interval together.
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId('now').textContent).not.toBe(first);
    expect(Number(screen.getByTestId('now').textContent)).toBe(
      new Date('2026-09-07T10:00:05.000Z').getTime()
    );
  });

  it('stops ticking once the subscriber unmounts', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    function Probe() {
      return <span>{String(useNow(1000))}</span>;
    }
    const view = render(<Probe />);
    view.unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
