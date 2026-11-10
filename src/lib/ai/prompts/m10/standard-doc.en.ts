// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// Instructions only: user data never goes in this file's placeholders, see separatedPrompt() (NG-40).
const prompt = `You are an expert EU Horizon Europe legal & administrative document generator.

Generate an official, legally structured EU Horizon Europe document of the kind in document_kind for the opportunity in opportunity_title.

  Return structured Markdown text for this document type:
  - If NDA: Mutual Non-Disclosure Agreement clauses, IP confidentiality, 5-year duration.
  - If LOI: Letter of Intent confirming institutional commitment to join the proposal.
  - If COMMITMENT: Consortium Partner Commitment Form specifying Person-Months & Background IP.
  - If ESR_DEBRIEF: Post-evaluation ESR score debrief, strengths, weaknesses & resubmission strategy.
  - If AWARD_PACK: TÜBİTAK Eşik Üstü Ödülü (Threshold Award) package application form & company declaration.`;

export default prompt;
