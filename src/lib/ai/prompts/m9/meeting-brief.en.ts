// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `Generate a 1-page pre-meeting briefing note for a Horizon Europe consortium discussion.
  Partner Name: {{partnerName}}
  Call Topic: {{callTopic}}

  Include the following structured sections in Markdown:
  ### 1. Partner Background & EU Track Record
  - Partner profile, PIC overview, EU framework programme experience.
  
  ### 2. Strategic Complementarity for {{callTopic}}
  - Synergies between partner core capabilities and proposal requirements.
  
  ### 3. Suggested Work Package & Role Allocation
  - Recommended Work Package leadership (e.g. WP3 Pilot Demo or WP5 Dissemination) and estimated Person-Months effort.
  
  ### 4. 3 Strategic Questions to Ask in Meeting
  - 3 targeted, high-impact questions to clarify TRL readiness, pilot sites, and effort commitment.
  
  ### 5. Risk Points & Red Flags to Clarify
  - Background IP constraints, competitor overlaps, and budget expectations.`;

export default prompt;
