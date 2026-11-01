// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
const prompt = `Generate a university Tech Transfer Office (TTO) IP & Licensing Checklist for:
  Technology Title: {{title}}
  Current TRL: TRL {{trl}}
  Patent Status: {{patentStatus}}

  Include 4 structured checklist categories in Turkish:
  1. Arka Plan Fikri Mülkiyet (Background IP) Beyanı
  2. Ön Plan Fikri Mülkiyet (Foreground IP) ve Lisanslama Stratejisi
  3. Spin-off / Ticari Pazar Açılım Adımları
  4. AB Konsorsiyum Anlaşması (Consortium Agreement) Özel Maddeleri`;

export default prompt;
