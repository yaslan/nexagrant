/**
 * In-process typed event bus (CLAUDE.md "Mimari kurallar" 2). Modules talk through this and
 * through `src/core/contracts`; they never import each other. An event is a name plus a
 * payload type declared in a contract; the publisher does not know who listens.
 *
 * Delivery is synchronous-ish and best effort: a failing listener is reported through
 * `onListenerError` and never reaches the publisher (the write that caused the event has
 * already committed). No payload is logged here: payloads may reference people.
 */

export interface DomainEvent<Name extends string = string, Payload = unknown> {
  readonly name: Name;
  readonly payload: Payload;
  readonly occurredAt: Date;
}

export type EventListener<E extends DomainEvent> = (event: E) => void | Promise<void>;

export interface EventBus {
  publish<E extends DomainEvent>(event: E): Promise<void>;
  subscribe<E extends DomainEvent>(name: E['name'], listener: EventListener<E>): () => void;
}

export interface EventBusOptions {
  /** Called with the event name and the error's class name only (never the payload). */
  onListenerError?: (eventName: string, errorName: string) => void;
}

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const listeners = new Map<string, Set<EventListener<DomainEvent>>>();
  return {
    subscribe(name, listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener as EventListener<DomainEvent>);
      listeners.set(name, set);
      return () => {
        set.delete(listener as EventListener<DomainEvent>);
      };
    },
    async publish(event) {
      for (const listener of [...(listeners.get(event.name) ?? [])]) {
        try {
          await listener(event);
        } catch (error) {
          options.onListenerError?.(event.name, error instanceof Error ? error.name : 'unknown');
        }
      }
    },
  };
}

/** The process-wide bus. Tests that need isolation build their own with {@link createEventBus}. */
export const eventBus: EventBus = createEventBus();
