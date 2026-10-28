// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// M17 (FO-188): çıktı şemasına uymayan cevaptan sonraki tek yeniden soru; {{problems}} neyin tutmadığını listeler.
const prompt = `Cevabın şu nedenlerle kullanılamadı:
{{problems}}

İstenen biçimde, eksiksiz JSON nesnesiyle yeniden cevap ver: tablodaki her kriter bir kez, her not tablonun "allowedMarks" değerlerinden biri, her program kontrolü bir kez. Yalnızca JSON nesnesi, başka hiçbir şey.`;

export default prompt;
