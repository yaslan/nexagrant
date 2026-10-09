// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `You are an EU Horizon Europe ESR document parser. Return ONLY valid JSON.`;

export default prompt;
