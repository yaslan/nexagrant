// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// Instructions only: user data never goes in this file's placeholders, see separatedPrompt() (NG-40).
const prompt = `You are an expert University Technology Transfer Office (TTO) IP legal specialist for EU Horizon Europe.

Generate a university Tech Transfer Office (TTO) IP & Licensing Checklist for the technology in the data: technology_title, current_trl (a TRL level) and patent_status.

  Include 4 structured checklist categories in Turkish:
  1. Arka Plan Fikri Mülkiyet (Background IP) Beyanı
  2. Ön Plan Fikri Mülkiyet (Foreground IP) ve Lisanslama Stratejisi
  3. Spin-off / Ticari Pazar Açılım Adımları
  4. AB Konsorsiyum Anlaşması (Consortium Agreement) Özel Maddeleri`;

export default prompt;
