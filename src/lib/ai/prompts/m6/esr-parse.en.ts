// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `Analyze the following EU Horizon Europe Evaluation Summary Report (ESR) text.
Extract the criteria marks and qualitative comments.

Return ONLY valid JSON with keys:
- excellence: number (0.0 to 5.0)
- impact: number (0.0 to 5.0)
- implementation: number (0.0 to 5.0)
- total: number (0.0 to 15.0)
- threshold: number (default 10.0)
- passed: boolean (true if total >= threshold and all subcriteria >= 3.0)
- strengths: string[]
- weaknesses: string[]

ESR Document Text:
"""
{{documentText}}
"""`;

export default prompt;
