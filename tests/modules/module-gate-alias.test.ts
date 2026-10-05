import { describe, it, expect } from 'vitest';
import { canonicalWorkspaceRoute, WORKSPACE_ROUTE_ALIASES } from '@/lib/modules/route-catalog';
import { getRouteOwner } from '@/lib/modules/registry';

describe('Module Gate with TR Aliases', () => {
  it('Turkish alias routes with module ownership resolve to the same module owner', () => {
    const aliasesToTest = Object.entries(WORKSPACE_ROUTE_ALIASES);

    for (const [aliasPath, canonicalPath] of aliasesToTest) {
      const canonicalOwner = getRouteOwner(canonicalPath);

      // Skip aliases that point to non-module-owned routes (e.g., settings/*)
      if (!canonicalOwner) {
        continue;
      }

      const resolvedOwner = getRouteOwner(canonicalWorkspaceRoute(aliasPath));

      expect(
        resolvedOwner,
        `Alias ${aliasPath} should resolve to same owner as ${canonicalPath} (${canonicalOwner.moduleId})`
      ).toEqual(canonicalOwner);
    }
  });

  it('firsatlar alias points to pipeline (M5) module', () => {
    const aliasOwner = getRouteOwner(canonicalWorkspaceRoute('firsatlar'));
    const pipelineOwner = getRouteOwner('pipeline');

    expect(aliasOwner).toEqual(pipelineOwner);
    expect(aliasOwner?.moduleId).toBe('M5');
  });

  it('firsatlar/[id] alias points to pipeline/[id] (M5) module', () => {
    const aliasOwner = getRouteOwner(canonicalWorkspaceRoute('firsatlar/[id]'));
    const pipelineOwner = getRouteOwner('pipeline/[id]');

    expect(aliasOwner).toEqual(pipelineOwner);
    expect(aliasOwner?.moduleId).toBe('M5');
  });
});
