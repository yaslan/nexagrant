export type ModuleId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10'
  | 'M11';

export type ModuleStatus = 'OFF' | 'DEV' | 'PILOT' | 'ON';

export type PlanTier = 'discover' | 'starter' | 'team' | 'business' | 'enterprise';

export interface ModuleManifest {
  id: ModuleId;
  key: string;
  name: string;
  description?: string;
  version?: string;
  requires: ModuleId[];
  recommends: ModuleId[];
  planTiers: PlanTier[];
  addOnSku?: string | null;
  isActive: boolean;
}
