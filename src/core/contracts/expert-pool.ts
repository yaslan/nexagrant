/**
 * Expert pool contract (NG-52, TASK-MW2SU1H9BLCGV).
 *
 * The plain data M8 candidate matching reads about the free expert
 * pre-registrations (K-579696 = A: in S1 an expert only pre-registers, free of
 * charge; no fee, payment or commission field exists here). The rows come from
 * src/lib/expert-prereg/server/directory.ts; M8 never imports that code, the
 * page hands these shapes over.
 *
 * No name, e-mail, ORCID, LinkedIn or organisation: the candidate list shows a
 * pseudonymous card. Contact between a tenant and an expert is S2 (marketplace).
 */

/** One verified, visibility-consented expert pre-registration. */
export interface ExpertPoolEntry {
  /** ExpertPreRegistration.id. */
  id: string;
  /** Kurucu Uzman number, when the expert is one of the first 100. */
  founderNumber: number | null;
  /** Plate code "01".."81": every pre-registered expert is in Türkiye. */
  province: string;
  /** ISO country of the expert. The form only accepts Turkish provinces, so "TR". */
  country: string;
  isFreelancer: boolean;
  /** Slugs from src/lib/expert-prereg/options.ts. */
  roles: readonly string[];
  programmes: readonly string[];
  expertiseAreas: readonly string[];
  languages: readonly string[];
}

/** One expert matched to one seat, with the slugs that made it match. */
export interface ExpertSeatMatch {
  expert: ExpertPoolEntry;
  matchedProgramme: string;
  matchedRoles: readonly string[];
}
