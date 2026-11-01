// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// M17 (FO-188): the one re-ask after an answer that failed the output schema; {{problems}} lists what failed.
const prompt = `Your answer could not be used, for these reasons:
{{problems}}

Answer again with the complete JSON object in the format asked for: every criterion of the grid once, each mark one of the grid's "allowedMarks", every programme check once. Only the JSON object, nothing else.`;

export default prompt;
