import { ModuleId, ModuleManifest } from './types';
import { m1Manifest } from '../../modules/m1/manifest';
import { m2Manifest } from '../../modules/m2/manifest';
import { m3Manifest } from '../../modules/m3/manifest';
import { m4Manifest } from '../../modules/m4/manifest';
import { m5Manifest } from '../../modules/m5/manifest';
import { m6Manifest } from '../../modules/m6/manifest';
import { m7Manifest } from '../../modules/m7/manifest';
import { m8Manifest } from '../../modules/m8/manifest';
import { m9Manifest } from '../../modules/m9/manifest';
import { m10Manifest } from '../../modules/m10/manifest';
import { m11Manifest } from '../../modules/m11/manifest';

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
