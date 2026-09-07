// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import NotificationsClient from '@/app/[locale]/(app)/[workspace]/notifications/client';

/**
 * The notifications read/unread overlay after TASK-MTQVFP0LV3YV7.
 *
 * The overlay lives in `localStorage`. It used to be a second copy of the list held in state,
 * which an effect filled in on mount — the `react-hooks/set-state-in-effect` pattern, silenced
 * here and in `UserMenu` with an inline exception rather than removed. It is a subscription to
 * an external store now (`useReadNotificationIds`), and the rendered list is derived from the
 * snapshot during render.
 *
 * These tests pin the user-visible contract the refactor had to preserve: the server output,
 * the overlay on a client render, both write paths, the cross-tab update and a corrupt value.
 * They pass against the old effect-based version too, by design — they exist to prove the
 * behaviour did not move. What forbids the pattern coming back is the lint rule itself, which
 * reports this file again the moment the inline exception is reinstated.
 */

const GUEST_KEY = 'fonbridge_read_notifs_guest';

/**
 * jsdom is configured without a Storage implementation here (`typeof localStorage` is
 * `undefined` in this environment), so the tests install a real one rather than mocking the
 * hook. The component then goes through the same code path it uses in a browser.
 */
function installLocalStorage(): void {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}

const NOTIFICATIONS = [
  { id: 'n1', title: 'First alert', desc: 'body one', time: '1h', type: 'match', unread: true },
  { id: 'n2', title: 'Second alert', desc: 'body two', time: '2h', type: 'match', unread: true },
];

function renderPage() {
  return render(
    <NotificationsClient initialNotifications={NOTIFICATIONS} locale="en" workspace="acme" />
  );
}

function storedIds(): string[] {
  return JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]');
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('notifications read store', () => {
  it('renders every notification unread on the server, where the store does not exist', () => {
    // The server cannot read localStorage, so the server snapshot has to be the empty overlay.
    // Anything else would make the hydrated markup disagree with the server output.
    localStorage.setItem(GUEST_KEY, JSON.stringify(['n1', 'n2']));

    const html = renderToString(
      <NotificationsClient initialNotifications={NOTIFICATIONS} locale="en" workspace="acme" />
    );

    // React separates interpolated text with comment markers, so they come out before the match.
    expect(html.replace(/<!--.*?-->/g, '')).toContain('2 Unread Notifications');
  });

  it('applies the stored overlay to the rendered list', () => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(['n1']));

    renderPage();

    expect(screen.getByText('1 Unread Notifications')).toBeTruthy();
  });

  it('marks a single notification read when the user clicks it', () => {
    renderPage();
    expect(screen.getByText('2 Unread Notifications')).toBeTruthy();

    fireEvent.click(screen.getByText('First alert'));

    expect(screen.getByText('1 Unread Notifications')).toBeTruthy();
    expect(storedIds()).toEqual(['n1']);
  });

  it('marks every notification read from the header button', () => {
    renderPage();

    fireEvent.click(screen.getByText('Mark All as Read'));

    expect(screen.getByText('All Notifications Read')).toBeTruthy();
    expect(storedIds().sort()).toEqual(['n1', 'n2']);
  });

  it('picks up a write from another tab', () => {
    renderPage();
    expect(screen.getByText('2 Unread Notifications')).toBeTruthy();

    // Another tab marks one read: it writes the key and the browser delivers a storage event.
    localStorage.setItem(GUEST_KEY, JSON.stringify(['n2']));
    fireEvent(window, new StorageEvent('storage', { key: GUEST_KEY }));

    expect(screen.getByText('1 Unread Notifications')).toBeTruthy();
  });

  it('survives a corrupt stored value instead of blanking the feed', () => {
    localStorage.setItem(GUEST_KEY, '{not json');

    renderPage();

    expect(screen.getByText('2 Unread Notifications')).toBeTruthy();
  });
});
