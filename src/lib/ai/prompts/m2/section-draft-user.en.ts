// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `Write the "{{sectionLabel}}" section for a concept note targeting: "{{opportunityTitle}}".

{{ragPrompt}}

Requirements:
- Maximum {{maxWords}} words
- Use formal academic/proposal writing style
- Include specific, measurable objectives where appropriate
- Reference relevant prior work and capabilities from the context provided`;

export default prompt;
