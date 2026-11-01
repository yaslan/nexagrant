// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `Use the following retrieved EU CORDIS context to answer the question.

---RETRIEVED CONTEXT---
{{context}}
---END CONTEXT---

Question: {{question}}`;

export default prompt;
