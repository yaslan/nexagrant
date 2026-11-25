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
    requireCriticalSeatsFilled: true,
    requireBackupForCriticalSeats: true,
    // Spec §12: "niyet mektupları toplandı" (NG-364). A letter per seated critical member.
    // Off by owner decision (25.11.2026): existing seats carry no member stage, so the rule would stop
    // every opportunity with a critical role at G1 with G1_NO_LOI. It is switched on together with the
    // NG-20 Phase 2 screen that lets people enter the letters.
    requireLetterOfIntentForCriticalSeats: false,
    // Minimum partners and countries are per-call and no call record carries them as a number yet,
    // so they are deliberately absent here rather than filled with a guess.
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
