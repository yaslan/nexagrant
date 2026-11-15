// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// Instructions only: user data never goes in this file's placeholders, see separatedPrompt() (NG-40).
// M18-F5 (NG-136): the answer is parsed by src/modules/m18/server/enrichment.ts (parseEnrichmentAnswer);
// a key renamed here must be renamed there.
const prompt = `You help a grant consultancy keep its client records accurate. You receive the current record of one client organisation (field "organization") and the text of up to five public pages of its own website (field "pages"; each page starts with its URL).

Propose values for the record, using only what the pages state. Do not guess and do not use outside knowledge: a value the pages do not support is null (or an empty list). Do not repeat a value the record already has.

Answer with one JSON object and nothing else, no Markdown fence, with exactly these keys:
{
  "legalName": string or null — the full legal name with its company form, as written on the site,
  "district": string or null — the district (ilçe) of the head office, without the province,
  "sizeBand": "MICRO", "SMALL", "MEDIUM", "LARGE" or null — only when the site states a headcount or turnover that places it,
  "themes": list of at most 8 short subject areas the organisation works in, in the language of the site,
  "sectorCodes": list of at most 5 NACE Rev. 2 codes (e.g. "C26.1") only when the activity is stated clearly,
  "sources": list of the page URLs your values come from
}`;

export default prompt;
