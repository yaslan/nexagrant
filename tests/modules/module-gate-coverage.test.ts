import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllManifests } from '@/lib/modules/registry';

const ROOT = join(process.cwd(), 'src/app/[locale]/(app)/[workspace]');

describe('Module Gate Coverage', () => {
  it('every manifest-owned route is protected by moduleGate', async () => {
    const manifests = getAllManifests();
    const unprotected: string[] = [];

    for (const manifest of manifests) {
      for (const route of manifest.routes) {
        const pagePath = join(ROOT, route.path, 'page.tsx');

        try {
          const content = readFileSync(pagePath, 'utf-8');

          // moduleGate() must be called (import + usage)
          const hasImport = content.includes("import { moduleGate }") ||
                           content.includes("from '@/lib/modules/guard'");
          const hasUsage = content.includes(`moduleGate('${manifest.id}'`) ||
                          content.includes('moduleGate(');

          // Both must be present for a valid gate
          if (!hasImport || !hasUsage) {
            unprotected.push(`${route.path} (${manifest.id}): ${!hasImport ? 'missing import' : 'missing call'}`);
          }
        } catch (e) {
          // File not found — unusual but not a failure here (manifest might be out of sync)
          unprotected.push(`${route.path} (${manifest.id}): page file not found`);
        }
      }
    }

    expect(unprotected, `Unprotected routes:\n${unprotected.join('\n')}`).toEqual([]);
  });
});
