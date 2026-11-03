import type { Gate } from '@prisma/client';

/**
 * Which way a stage change goes, and so who is allowed to make it.
 *
 * A stage means "this gate was passed", so going forward is the gate's call and the gate writes
 * the stage (`evaluateGate`). This file only names the move; it holds no gate rule. Pure and free
 * of runtime imports, so the board and the detail screen read the same answer as the server.
 */
const STAGE_ORDER: readonly Gate[] = ['G0', 'G1', 'G2', 'G3', 'G4'];

export type StageMove = 'same' | 'next' | 'skip' | 'back';

export function isStage(value: unknown): value is Gate {
  return STAGE_ORDER.includes(value as Gate);
}

/** The gate that stands between `stage` and the stage after it; `null` on the last stage. */
export function nextStageOf(stage: Gate): Gate | null {
  return STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1] ?? null;
}

export function classifyStageMove(from: Gate, to: Gate): StageMove {
  const distance = STAGE_ORDER.indexOf(to) - STAGE_ORDER.indexOf(from);
  if (distance === 0) return 'same';
  if (distance === 1) return 'next';
  return distance > 1 ? 'skip' : 'back';
}
