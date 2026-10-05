'use client';

import { useContext } from 'react';
import { SessionContext } from 'next-auth/react';
import type { Session } from 'next-auth';

/**
 * The session, or `null` when the tree has no `<SessionProvider>`.
 *
 * `useSession()` throws in that case, so components that render both inside and
 * outside the provider used to wrap it in `try/catch` — which puts a hook in a
 * conditional region and breaks the rules of hooks: on the render where the
 * call throws, React has one fewer hook than on the render where it does not,
 * and every later hook in the component shifts onto the wrong slot.
 *
 * Reading the context directly is unconditional. A missing provider yields
 * `undefined` instead of an exception, so the hook order never changes.
 */
export function useOptionalSession(): Session | null {
  return useContext(SessionContext)?.data ?? null;
}
