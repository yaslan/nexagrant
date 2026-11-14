import { describe, expect, test } from 'vitest';

import { createEventBus, type DomainEvent } from '@/core/events';

type Ping = DomainEvent<'test.ping', { id: string }>;
const ping = (id: string): Ping => ({ name: 'test.ping', payload: { id }, occurredAt: new Date(0) });

describe('event bus', () => {
  test('delivers to subscribers of that name only, and unsubscribe stops delivery', async () => {
    const bus = createEventBus();
    const seen: string[] = [];
    const off = bus.subscribe<Ping>('test.ping', (e) => void seen.push(e.payload.id));
    bus.subscribe('other', () => void seen.push('other'));
    await bus.publish(ping('a'));
    off();
    await bus.publish(ping('b'));
    expect(seen).toEqual(['a']);
  });

  test('a failing listener neither reaches the publisher nor blocks later listeners; only the error name is reported', async () => {
    const reported: Array<[string, string]> = [];
    const bus = createEventBus({ onListenerError: (n, e) => void reported.push([n, e]) });
    const seen: string[] = [];
    bus.subscribe<Ping>('test.ping', () => {
      throw new TypeError('secret payload text');
    });
    bus.subscribe<Ping>('test.ping', (e) => void seen.push(e.payload.id));
    await expect(bus.publish(ping('x'))).resolves.toBeUndefined();
    expect(seen).toEqual(['x']);
    expect(reported).toEqual([['test.ping', 'TypeError']]);
  });
});
