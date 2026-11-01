import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * The product wordmark, in one place.
 *
 * The artwork comes in two cuts: navy lettering for light surfaces and white lettering for dark
 * ones. The old single `/logo.png` was forced white on dark surfaces with `brightness-0 invert`,
 * which flattened the colours of the mark too; each cut now keeps its own colours.
 *
 * `tone="auto"` renders both cuts and lets the `dark:` variant (globals.css — `.dark` /
 * `data-theme="dark"` on <html>, set before the first paint) show one. That is pure CSS, so
 * the logo is right on the server render and never flashes on hydration. Surfaces that are
 * dark in both themes (the admin console header) pass `tone="dark"`.
 */

/** Width ÷ height of the cropped artwork in public/brand (981×324 and 951×315). */
const ASPECT = 3.03;

interface BrandLogoProps {
  /** Rendered height in CSS pixels; the width follows the artwork's aspect ratio. */
  height: number;
  tone?: 'auto' | 'dark';
  className?: string;
}

export default function BrandLogo({ height, tone = 'auto', className = '' }: BrandLogoProps) {
  const tCommon = useTranslations('Common');
  const alt = tCommon('logoAlt', { brand: PRODUCT_NAME });
  const width = Math.round(height * ASPECT);
  const common = { width, height, style: { width, height } } as const;

  if (tone === 'dark') {
    return <Image src="/brand/nexagrant-logo-dark.png" alt={alt} {...common} className={`object-contain ${className}`} />;
  }
  return (
    <>
      <Image src="/brand/nexagrant-logo-light.png" alt={alt} {...common} className={`object-contain dark:hidden ${className}`} />
      <Image src="/brand/nexagrant-logo-dark.png" alt={alt} {...common} className={`object-contain hidden dark:block ${className}`} />
    </>
  );
}
