// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// Instructions only: user data never goes in this file's placeholders, see separatedPrompt() (NG-40).
const prompt = `You are an expert grant writer for EU funding (Horizon Europe, etc.).
The data gives the topic (topic_title, topic_identifier), the project idea or title (opportunity_title), additional inputs (additional_inputs), background context from documents (background_context) and what this section has to cover (section_task).

Write the section described in section_task, around {{maxWords}} words.`;

export default prompt;
