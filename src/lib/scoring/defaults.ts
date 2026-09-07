export const DEFAULT_SCORING_WEIGHTS = {
  alignment: 30,
  baseRate: 15,
  coordinatorHistory: 15,
  researchAndEndUser: 12,
  networkCentrality: 10,
  budgetRoleEconomy: 10,
  lumpSumTwoStage: 8,
};

export const DEFAULT_GATE_RULES = {
  G0: {
    minScore: 70,
    minAlignment: 70,
    minBaseRate: 8,
    requireEligibleCountry: true,
  },
  G1: {
    requireCoordinatorHistoryIfCoordinator: true,
  },
  G2: {
    requireAllSeatsFilled: true,
    requireBudgetApproved: true,
    maxWeeksFromG0: 8,
  },
  G3: {
    minCriterionScore: 4.0,
    minTotalScore: 12.0,
  },
  G4: {
    minHoursBeforeDeadline: 24,
  }
};
