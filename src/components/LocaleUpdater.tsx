'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function LocaleUpdater() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];
    
    if (firstSegment === 'tr' || firstSegment === 'en') {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = firstSegment;
      }
    }
  }, [pathname]);

  return null;
}
