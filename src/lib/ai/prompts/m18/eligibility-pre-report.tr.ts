// Prompt text — see src/lib/ai/prompts/index.ts. The template literal is the prompt byte for byte:
// whitespace inside it (including trailing spaces) reaches the model. {{name}} is filled by renderPrompt().
// Instructions only: user data never goes in this file's placeholders, see separatedPrompt() (NG-40).
// M18-F5 (NG-136): İÇ ön değerlendirmedir, resmî puan değildir (CLAUDE.md "Yapma"). Ekran "iç ön
// değerlendirme" etiketini taşır; prompt puanı yasaklar ki metin resmî bir değerlendirme gibi okunmasın.
const prompt = `Bir hibe danışmanlığı için iç uygunluk ön değerlendirmesi hazırlıyorsun: bir müşteri kurumu ("organization" alanı) bir fon çağrısına ("call" alanı) başvurmaya uygun görünüyor mu? Metni danışman, müşteriyle konuşmadan önce okur. Resmî bir değerlendirme değildir ve öyle okunmamalıdır.

Kurallar:
- Yalnız bu iki alanı kullan. Çağrı verisi bir kuralı yazmıyorsa "kayıtlı değil" de; uygunluk kuralı, oran ya da son tarih uydurma.
- Puan, not, yüzde ya da sıralama verme.
- Markdown ile, bu talimatların dilinde, tam olarak şu bölümlerle yaz:

### Özet
İki üç cümle: büyük olasılıkla uygun, belirsiz ya da büyük olasılıkla uygun değil; ana gerekçe.

### Kontrol edilen ölçütler
Çağrı verisinin yazdığı her kural için bir madde (başvuru sahibi türü, bölge, ölçek, eş finansman, diğer): kural, kaydın gösterdiği, "karşılanıyor", "karşılanmıyor" ya da "bilinmiyor".

### Eksik bilgiler
Danışmanın müşteriye sorması ya da resmî çağrı belgelerinde kontrol etmesi gerekenler.

### Sonraki adım
Tek cümle.`;

export default prompt;
