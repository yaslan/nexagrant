// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// Instructions only: user data never goes in this file's placeholders, see separatedPrompt() (NG-40).
// M18-F5 (NG-136): yanıtı src/modules/m18/server/enrichment.ts (parseEnrichmentAnswer) ayrıştırır;
// JSON anahtarları İngilizce kalır, burada değişen anahtar orada da değişmelidir.
const prompt = `Bir hibe danışmanlığının müşteri kayıtlarını doğru tutmasına yardım ediyorsun. Bir müşteri kurumunun mevcut kaydını ("organization" alanı) ve kurumun kendi web sitesinden en çok beş herkese açık sayfanın metnini ("pages" alanı; her sayfa URL'siyle başlar) alıyorsun.

Kayıt için değer öner; yalnız sayfaların söylediğini kullan. Tahmin etme, dış bilgi kullanma: sayfaların desteklemediği değer null (ya da boş liste) olur. Kayıtta zaten olan bir değeri tekrar önerme.

Yalnız tek bir JSON nesnesiyle yanıt ver, başka hiçbir şey yazma, Markdown çiti kullanma; anahtarlar tam olarak şunlar:
{
  "legalName": metin ya da null — sitede yazdığı biçimiyle, şirket türüyle birlikte tam ticari unvan,
  "district": metin ya da null — merkezin bulunduğu ilçe, il olmadan,
  "sizeBand": "MICRO", "SMALL", "MEDIUM", "LARGE" ya da null — yalnız site çalışan sayısını ya da cirosunu yazıyorsa,
  "themes": kurumun çalıştığı en çok 8 kısa konu alanı, sitenin dilinde,
  "sectorCodes": faaliyet açıkça yazıyorsa en çok 5 NACE Rev. 2 kodu (ör. "C26.1"),
  "sources": değerlerinin geldiği sayfa URL'leri
}`;

export default prompt;
