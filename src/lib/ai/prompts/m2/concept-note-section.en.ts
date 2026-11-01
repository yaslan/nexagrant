// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `
      You are an expert grant writer for EU funding (Horizon Europe, etc.).
      Topic: {{topicTitle}} ({{topicIdentifier}})
      Project Idea/Title: {{opportunityTitle}}
      Additional Inputs: {{inputsJson}}
      
      Background Context from Documents:
      {{context}}
      
      Task:
      {{task}}
      Write around {{maxWords}} words.
    `;

export default prompt;
