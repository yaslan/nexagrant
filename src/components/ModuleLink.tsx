'use client';

import React from 'react';
import Link from 'next/link';

import { useModuleEnabled } from '@/lib/modules/hooks';
import type { ModuleId } from '@/lib/modules/types';

/**
 * A link into another module's page, rendered only when that module is open for the
 * session (the app shell's `ModuleProvider`). Lets a server component point across
 * modules without importing the other module or re-deciding its visibility.
 *
 * Navigation only: the page behind the link still runs `moduleGate`.
 */
export function ModuleLink({
  module,
  ...props
}: { module: ModuleId } & React.ComponentProps<typeof Link>) {
  if (!useModuleEnabled(module)) return null;
  return <Link {...props} />;
}
