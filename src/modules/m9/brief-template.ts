/**
 * The brief M9 falls back to when the model cannot be reached.
 *
 * What used to stand here asserted things about the partner nobody had measured
 * — "Recognized participant in EU Framework Programmes with strong technical
 * capacity", "High synergy between partner core capabilities and topic
 * requirements", "Effort Recommendation: 12 - 18 Person-Months" — and it was
 * saved, shown, printed and pushed to the calendar under the same heading as a
 * generated brief, with an AI credit debited for it. On this machine the model
 * answers 401, so that fallback *was* the brief every user saw. CLAUDE.md rule 7
 * (every figure a user sees is backed by a record) and tests/fabricated-fallbacks
 * forbid exactly that shape.
 *
 * The replacement is a blank working document: the same five sections, so the
 * page a user knows still has its structure, but every line is a question to
 * answer rather than a claim to trust. It carries a marker on the first line so
 * the screen can label it as a draft after a reload, an export or a print — the
 * marker is machine text, never shown; the sentence the user reads comes from
 * the message catalogue (CLAUDE.md rule 8).
 */
export const TEMPLATE_BRIEF_MARKER = '<!-- fabrika:template-draft -->';

/** True when `content` was written by `templateBrief`, not by the model. */
export function isTemplateDraft(content: string): boolean {
  return content.startsWith(TEMPLATE_BRIEF_MARKER);
}

/** The brief body without its marker line — what a reader, a print or an .ics gets. */
export function stripTemplateMarker(content: string): string {
  return isTemplateDraft(content)
    ? content.slice(TEMPLATE_BRIEF_MARKER.length).replace(/^\r?\n/, '')
    : content;
}

export function templateBrief({
  partnerName,
  callTopic,
}: {
  partnerName: string;
  callTopic: string;
}): string {
  return `${TEMPLATE_BRIEF_MARKER}
### 1. Partner Background & EU Track Record
- **Partner:** ${partnerName}
- EU framework programme participation to check before the meeting (CORDIS, PIC):
-

### 2. Strategic Complementarity for ${callTopic}
- Capability we need from this partner:
- What we bring that they do not have:

### 3. Suggested Work Package & Role Allocation
- Work package to discuss:
- Person-months to agree (theirs / ours):

### 4. 3 Strategic Questions to Ask in Meeting
1. **TRL readiness:** what is the validated TRL of the component they would bring?
2. **Infrastructure:** do they have pilot sites or test facilities available for this call?
3. **Effort & budget:** what person-month commitment can they confirm?

### 5. Risk Points & Red Flags to Clarify
- Background IP ownership and licensing terms, before the consortium agreement:
- Participation in a competing proposal under the same call:
- Budget expectations:`;
}
