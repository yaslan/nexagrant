#!/bin/bash
cat << 'INNER' > src/modules/m1/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m1Manifest: ModuleManifest = { id: 'M1', key: 'partner-intel', name: 'Partner Intelligence Database', requires: [], recommends: [], planTiers: ['team', 'business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m2/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m2Manifest: ModuleManifest = { id: 'M2', key: 'concept-note', name: 'Concept Note Architectures', requires: [], recommends: ['M3'], planTiers: ['starter', 'team', 'business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m3/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m3Manifest: ModuleManifest = { id: 'M3', key: 'evidence', name: 'Evidence Pack', requires: [], recommends: [], planTiers: ['starter', 'team', 'business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m4/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m4Manifest: ModuleManifest = { id: 'M4', key: 'focal-point', name: 'Focal Point', requires: ['M1'], recommends: [], planTiers: ['team', 'business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m5/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m5Manifest: ModuleManifest = { id: 'M5', key: 'workflows', name: 'Proposal Production Workflows', requires: [], recommends: [], planTiers: ['starter', 'team', 'business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m6/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m6Manifest: ModuleManifest = { id: 'M6', key: 'evaluator', name: 'Evaluator Lens', requires: [], recommends: [], planTiers: ['business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m7/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m7Manifest: ModuleManifest = { id: 'M7', key: 'tto', name: 'TTO Accelerator', requires: ['M1', 'M4'], recommends: [], planTiers: ['enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m8/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m8Manifest: ModuleManifest = { id: 'M8', key: 'consortium-matching', name: 'Consortium Matching', requires: ['M1'], recommends: ['M4'], planTiers: ['team', 'business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m9/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m9Manifest: ModuleManifest = { id: 'M9', key: 'briefs', name: 'Meeting Briefs', requires: ['M1', 'M4'], recommends: [], planTiers: ['business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m10/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m10Manifest: ModuleManifest = { id: 'M10', key: 'followups', name: 'Follow-up Documents', requires: ['M4'], recommends: ['M9'], planTiers: ['business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/modules/m11/manifest.ts
import { ModuleManifest } from '@/lib/modules/types';
export const m11Manifest: ModuleManifest = { id: 'M11', key: 'application', name: 'Full Application Production', requires: ['M2', 'M3', 'M5', 'M8'], recommends: [], planTiers: ['business', 'enterprise'], isActive: true };
INNER

cat << 'INNER' > src/lib/modules/registry.ts
import { ModuleId, ModuleManifest } from './types';
import { m1Manifest } from '@/modules/m1/manifest';
import { m2Manifest } from '@/modules/m2/manifest';
import { m3Manifest } from '@/modules/m3/manifest';
import { m4Manifest } from '@/modules/m4/manifest';
import { m5Manifest } from '@/modules/m5/manifest';
import { m6Manifest } from '@/modules/m6/manifest';
import { m7Manifest } from '@/modules/m7/manifest';
import { m8Manifest } from '@/modules/m8/manifest';
import { m9Manifest } from '@/modules/m9/manifest';
import { m10Manifest } from '@/modules/m10/manifest';
import { m11Manifest } from '@/modules/m11/manifest';

export const moduleRegistry: Record<ModuleId, ModuleManifest> = {
  M1: m1Manifest,
  M2: m2Manifest,
  M3: m3Manifest,
  M4: m4Manifest,
  M5: m5Manifest,
  M6: m6Manifest,
  M7: m7Manifest,
  M8: m8Manifest,
  M9: m9Manifest,
  M10: m10Manifest,
  M11: m11Manifest,
};

export const getManifest = (id: ModuleId): ModuleManifest => moduleRegistry[id];
export const getAllManifests = (): ModuleManifest[] => Object.values(moduleRegistry);
INNER
