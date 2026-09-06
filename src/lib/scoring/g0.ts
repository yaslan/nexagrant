export interface G0Weights {
  strategicAlignment: number; // e.g. 0.4
  technicalCapability: number; // e.g. 0.3
  budgetMatch: number;        // e.g. 0.1
  partnershipPotential: number; // e.g. 0.2
}

export interface OpportunityInputs {
  strategicAlignmentScore: number; // 0-10
  technicalCapabilityScore: number; // 0-10
  budgetMatchScore: number;        // 0-10
  partnershipPotentialScore: number; // 0-10
}

export interface GateRule {
  gate: string;
  minScore: number;
  mandatoryCriteria: string[];
}

export function calculateG0Score(inputs: OpportunityInputs, weights: G0Weights): number {
  return (
    (inputs.strategicAlignmentScore * weights.strategicAlignment) +
    (inputs.technicalCapabilityScore * weights.technicalCapability) +
    (inputs.budgetMatchScore * weights.budgetMatch) +
    (inputs.partnershipPotentialScore * weights.partnershipPotential)
  );
}

export function evaluateGate(
  gate: string, 
  score: number, 
  rules: GateRule, 
  inputs: Record<string, boolean | number | string>
): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let passed = true;

  if (score < rules.minScore) {
    passed = false;
    reasons.push(`Score ${score.toFixed(1)} is below the minimum threshold of ${rules.minScore}`);
  }

  for (const criteria of rules.mandatoryCriteria) {
    if (!inputs[criteria]) {
      passed = false;
      reasons.push(`Mandatory criteria not met: ${criteria}`);
    }
  }

  return { passed, reasons };
}
