/**
 * Live partner demand contract (FO-63 / PS-K5, TASK-MVCH33UGSHK1).
 *
 * The plain data M8 consortium scoring reads about open partner-search
 * requests on one topic. The rows come from the partner-search ingestion
 * (M1); M8 never imports that module, it only sees these shapes.
 */

/** One active EXPERTISE_REQUEST on the topic, from the portal's partner search. */
export interface LiveDemandRequest {
  /** CORDIS PIC of the announcing organisation; null when the portal row is unmatched. */
  organizationPic: string | null;
  /** Portal publication instant; null when the portal did not send one. */
  publishedAt: Date | null;
}

/** Everything the live-demand signal needs for one topic. */
export interface LiveDemandInput {
  topicIdentifier: string;
  /** Non-withdrawn EXPERTISE_REQUEST announcements on that topic. */
  requests: readonly LiveDemandRequest[];
}
