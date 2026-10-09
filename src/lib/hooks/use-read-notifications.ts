'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * The read/unread overlay for notifications lives in `localStorage`, which is a browser-only
 * external store: the server cannot see it, so the value legitimately differs between the
 * server render and the client.
 *
 * The obvious spelling — `useState(serverValue)` plus an effect that reads storage and calls
 * `setState` — is what `react-hooks/set-state-in-effect` forbids, and for a real reason: it
 * commits one render, then schedules a second one from the effect body on every mount, and the
 * subscription has to be hand-rolled on top of it.
 *
 * `useSyncExternalStore` is the API for exactly this shape. React reads `getServerSnapshot`
 * while rendering on the server and while hydrating, then switches to the client snapshot, and
 * it owns the subscribe/unsubscribe lifecycle. The rendered list becomes a plain derivation of
 * the snapshot instead of a second copy of state that an effect has to keep in sync.
 */

const UPDATE_EVENT = 'fonbridge_notifications_updated';
const GUEST_STORAGE_KEY = 'fonbridge_read_notifs_guest';

/** The storage key holding the ids this user has already read. */
export function notificationStorageKey(userEmail: string | null | undefined): string {
  return `fonbridge_read_notifs_${userEmail || 'guest'}`;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(UPDATE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(UPDATE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/**
 * A snapshot must be referentially stable while the store is unchanged or React re-renders
 * forever, so this returns the two raw stored strings encoded as one string rather than a
 * freshly built object.
 */
function readSnapshot(storageKey: string): string {
  try {
    return JSON.stringify([
      localStorage.getItem(storageKey) ?? '',
      localStorage.getItem(GUEST_STORAGE_KEY) ?? '',
    ]);
  } catch {
    // Storage can be disabled outright (private mode, blocked site data).
    return EMPTY_SNAPSHOT;
  }
}

const EMPTY_SNAPSHOT = '["",""]';

function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT;
}

function parseIdList(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** The notification ids this browser has marked read, under its own key and as a guest. */
export function useReadNotificationIds(storageKey: string): ReadonlySet<string> {
  const getSnapshot = useCallback(() => readSnapshot(storageKey), [storageKey]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    const [own = '', guest = ''] = parseIdList(snapshot);
    return new Set([...parseIdList(own), ...parseIdList(guest)]);
  }, [snapshot]);
}

/** Apply the read overlay to a server-rendered list without copying it into state. */
export function applyReadState<T extends { id: string; unread: boolean }>(
  items: readonly T[],
  readIds: ReadonlySet<string>
): T[] {
  return items.map((item) => (readIds.has(item.id) ? { ...item, unread: false } : item));
}

/** Record ids as read and tell every subscriber in this tab; other tabs get the storage event. */
export function markNotificationsRead(storageKey: string, ids: readonly string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  try {
    const existing = parseIdList(localStorage.getItem(storageKey) ?? '');
    localStorage.setItem(storageKey, JSON.stringify(Array.from(new Set([...existing, ...ids]))));
    window.dispatchEvent(new Event(UPDATE_EVENT));
  } catch {
    // Storage unavailable; the list simply stays unread.
  }
}
