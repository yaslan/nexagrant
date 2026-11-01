# TASK-MUN3FWZWT11MX — se-fb — Model karşılaştırma spike'ı: claude-sonnet-5 vs claude-sonnet-5-5

**Tarih:** 29.09.2026 · **Dal/HEAD:** dev @ 208a9ed7 · **Tip:** spike (kod değişikliği YOK, varsayılan model DEĞİŞMEDİ)
**Platform beyanı:** macOS 27.0.1 (darwin), Node v26.5.0 üzerinde koşuldu. Windows / Linux **koşulamadı** (bu makinede yok). Ölçülen kod yolu platforma bağlı değil: `src/lib/llm.ts` → `fetch('https://api.anthropic.com/v1/messages')`. Süreç, dosya yolu, kabuk ya da ekran kullanmıyor. Gecikme rakamları bu makinenin ağından ölçüldü; başka bir ağda mutlak değerler değişir, iki model arasındaki fark değişmez.

## Karar özeti (1-3-1)

**Sorun:** Sonnet 5.5 aynı fiyatta ($2 / $10 per MTok) daha yeni model. Soru şu: FonBridge'in 7 Sonnet çağrı noktasında 5.5'e geçmek kaliteyi, maliyeti ve gecikmeyi nasıl etkiler?

**Seçenekler:**

| | Seçenek | Kazanç | Bedel |
|---|---|---|---|
| 1 | **Sonnet 5'te kal** (bugünkü `src/lib/llm.ts:42`) | Kör puanda önde (147/160 ve 133/160). Uzun belgelerde kesilme 2/24 (5.5'te 9/24). | 5.5'in kısa işlerdeki daha dürüst yer tutucu davranışı ve daha hızlı JSON ayrıştırması kullanılmıyor. |
| 2 | **Tümüyle 5.5'e geç** (tek satır) | Kısa işlerde daha az uydurma (doğruluk 32 ve 29). ESR ayrıştırmada %35 daha hızlı, %35 daha ucuz. | Bu satır **tek başına değişirse gerileme olur**. 5.5 çıktı tokenlarının tahminen ~%28'ini düşünmeye harcıyor. 4096'lık `max_tokens` ile M7 ve M10 belgeleri **her tekrarda** cümle ortasında kesiliyor (9/9). Uygulama `stop_reason`'a bakmıyor, kesik belge sessizce kaydediliyor. |
| 3 | **Yalnız belirli purpose'lar 5.5** (`MODEL_OVERRIDES['M6:esr-parser']`, istenirse M2) | ESR ayrıştırma 6/6 doğru, medyan 2,7 sn (Sonnet 5'te 4,3 sn), çağrı başı $0,0037 (Sonnet 5'te $0,0057). | Kazanç küçük (1.000 çağrıda ~2 USD). İki model iki ayrı davranış demek, izlemesi daha zor. |

**Öneri: Seçenek 1 — şimdilik Sonnet 5'te kal.** Geçiş kararını, aşağıdaki "Sonraki adım" bölümündeki `stop_reason` + `max_tokens` düzeltmesi bittikten sonra, 5.5'i açık `effort` ve daha büyük `max_tokens` ile yeniden ölçerek ver. Bu düzeltme modelden bağımsız olarak **bugün de gerekli**: Sonnet 5 de AWARD_PACK'te 3 tekrarın 2'sinde `max_tokens`'a takıldı.

## 1. Ne yapıldı

1. **Önceki oturumun kurtarılması.** `e3d0021f…/scratchpad` incelendi. Koşu 48 çağrının 14'ünde kesilmiş, `results.json` yazılmamış, çıktı metinleri kaybolmuş, yalnız `run.log` kalmış. O 14 çağrının maliyeti log'dan hesaplandı: 6.620 girdi + 23.034 çıktı token = **0,2436 USD**. Metinler olmadan kör puanlama yapılamayacağı için koşu baştan yapıldı. Önceki harcama bütçe sayacına eklendi.
2. **Koşucu dayanıklı hale getirildi.** Her çağrı döner dönmez `results.jsonl`'e ekleniyor. Tamamlanmış `(case, model, rep)` satırları atlanıyor. Koşu ön planda, tekrar başına bir komut olarak (3 × 16 çağrı) yürütüldü. Bütçe tavanı önceki harcama dahil 4 USD'de kesiyor.
3. **İstek birebir uygulamanın isteği.** Aynı uç nokta ve başlıklar kullanıldı. Gövde: `model, max_tokens=4096, system, messages`; **temperature, thinking ve effort gönderilmiyor**. Metin, `textFromAnthropicContent` gibi blok tipine göre okunuyor. Promptlar, `src/lib/ai/prompts/*.en.ts` şablonlarından uygulamanın kullandığı `{{var}}` doldurmasıyla üretildi.
4. **Girdiler tamamen sentetik.** Kurgusal proje SYNTH-BAT-01, kurgusal kurum "Anadolu Örnek Enerji Lab.", kurgusal ortak "Örnek Teknoloji Ortağı X", uydurma ESR metinleri (SYNTH-001/002). Gerçek kişi ya da kurum verisi yok. DB'den içerik okunmadı; yalnız `AiUsageLog` sayımı salt-okunur (`BEGIN READ ONLY`) yapıldı.
5. **Kör puanlama.** Rubrik koşudan önce yazıldı (`RUBRIC.md`). Rep 0 çıktıları rastgele A/B etiketlendi. Önce puanlar `scores-blind.json`'a yazıldı, anahtar (`blind-key.json`) ondan sonra açıldı.
6. **Fiyatlar** claude-api skill'inden alındı (model tablosu, önbellek tarihi 2026-09-25): Sonnet 5 ve Sonnet 5.5 ikisi de girdi $2, çıktı $10 / MTok. Skill'in Sonnet 5.5 geçiş bölümü de "same prices, same tokenizer" diyor.

### Kullanım envanteri (generateCompletion / generateText)

| Çağrı noktası | module:purpose | Model (bugün) | max_tokens | Senaryo |
|---|---|---|---|---|
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:120` | M2:concept_note_draft | sonnet-5 | 4096 (varsayılan) | M2-concept_note_draft |
| `src/modules/m2/server/actions.ts:127` | M2:`Drafting section: ${key}` | sonnet-5 | 4096 | M2-drafting_section |
| `src/modules/m6/server/esr-parser.ts:60` | M6:esr-parser | sonnet-5 | 4096 | M6-esr-parser-pass / -fail |
| `src/modules/m6/server/actions.ts:80` | M6:evaluation | **claude-opus-5** (`MODEL_OVERRIDES`) | 4096 | kapsam dışı: Sonnet değişikliğinden etkilenmez |
| `src/modules/m7/server/actions.ts:121` | M7:tto_ip_checklist | sonnet-5 | 4096 | M7-tto_ip_checklist |
| `src/modules/m9/server/actions.ts:68` | M9:meeting_brief | sonnet-5 | 4096 | M9-meeting_brief |
| `src/modules/m10/server/actions.ts:87` | M10:`document_generation_${kind}` | sonnet-5 | 4096 | NDA + AWARD_PACK (5 türden 2'si) |

Hiçbir çağrı noktası `maxTokens` ya da `model` geçmiyor (`grep -rn maxTokens src`, llm.ts dışında boş).

## 2. Kanıt

**Koşu:** 48 çağrı (8 senaryo × 2 model × 3 tekrar). Hata 0/48. Sıra her senaryo ve tekrarda dönüşümlü (ısınmış bağlantı yanlılığına karşı).

| Senaryo | Model | stop (3 tekrar) | bloklar | çıktı tok. (medyan) | kelime (medyan) | gecikme medyan / en yüksek | $/çağrı | otomatik kontrol |
|---|---|---|---|---|---|---|---|---|
| M2 concept_note_draft | s5 | end_turn ×3 | text | 681 | 242 | 8,9 / 9,7 sn | 0,0080 | ≤250 kelime 3/3 |
| | s5-5 | end_turn ×3 | thinking+text | 1018 | 244 | 9,6 / 11,7 sn | 0,0122 | 3/3 |
| M2 drafting_section | s5 | end_turn ×3 | text | 591 | 202 | 6,7 / 7,0 sn | 0,0068 | ≤200(+%20) 3/3 |
| | s5-5 | end_turn ×3 | thinking+text | 764 | 213 | 7,3 / 8,8 sn | 0,0094 | 3/3 |
| M6 esr-parser (geçen) | s5 | end_turn ×3 | thinking+text | 504 | 79 | 4,3 / 4,9 sn | 0,0057 | JSON+alan 3/3 |
| | s5-5 | end_turn ×3 | text | 280 | 84 | **2,7 / 2,9 sn** | **0,0037** | 3/3 |
| M6 esr-parser (kalan) | s5 | end_turn ×3 | text / thinking+text | 331 | 55 | 3,1 / 3,1 sn | 0,0039 | 3/3 |
| | s5-5 | end_turn ×3 | text | 185 | 43 | **1,9 / 2,0 sn** | **0,0029** | 3/3 |
| M7 tto_ip_checklist | s5 | end_turn ×3 | text | 3343 | 812 | 39,5 / 45,9 sn | 0,0343 | — |
| | s5-5 | **max_tokens ×3** | thinking+text | 4096 | 581 | 34,0 / 34,6 sn | 0,0416 | **kesik 3/3** |
| M9 meeting_brief | s5 | end_turn ×3 | text | 1607 | 602 | 18,0 / 20,3 sn | 0,0176 | — |
| | s5-5 | end_turn ×3 | thinking+text | 2213 | 664 | 21,2 / 23,3 sn | 0,0238 | — |
| M10 NDA | s5 | end_turn ×3 | text / thinking+text | 3755 | 1457 | 32,7 / 37,4 sn | 0,0387 | — |
| | s5-5 | **max_tokens ×3** | thinking+text | 4096 | 1233 | 30,7 / 31,0 sn | 0,0417 | **kesik 3/3** |
| M10 AWARD_PACK | s5 | end_turn ×1, **max_tokens ×2** | thinking+text | 4096 | 1238 | 45,5 / 45,9 sn | 0,0415 | **kesik 2/3** |
| | s5-5 | **max_tokens ×3** | thinking+text | 4096 | 1254 | 29,1 / 29,3 sn | 0,0417 | **kesik 3/3** |

**Toplamlar (24'er çağrı):**

| | girdi tok. | çıktı tok. | tahmini düşünme payı* | max_tokens | $/çağrı | 1.000 çağrı | gecikme p50 / p95 |
|---|---|---|---|---|---|---|---|
| claude-sonnet-5 | 11.013 | 44.710 | ~%3 | 2/24 | 0,01955 | 19,55 USD | 17,7 / 45,9 sn |
| claude-sonnet-5-5 | 11.055 | 50.842 | ~%28 | **9/24** | 0,02211 | 22,11 USD | 20,3 / 34,0 sn |

\* Düşünme payı tahmindir. Yalnız `text` bloğu dönen `end_turn` çağrılarından 2,33 karakter/token oranı ölçüldü; görünür metin bu oranla tokena çevrildi ve çıktı tokenından çıkarıldı. Düşünme metni `display: omitted` nedeniyle boş geliyor ama faturalanıyor.
5.5'in p95 gecikmesinin daha düşük görünmesi yanıltıcı: uzun işlerde 4096 tokende kesildiği için erken bitiyor.

**Kesilme örnekleri (rep 0, çıktının son karakterleri):**
- M7 / 5.5: `"…Lisans verme prosedürü ve **ortak sahiplerin önceden bilgilendirilmesi**\n  - [ ] Ortak sahiplerin tazminat/"`. İstenen 4 kategoriden yalnız 1,5'i üretildi.
- M10 NDA / 5.5: `"…governed exclusively by the Grant Agreement and the Consortium Agreement, if concluded. Each"`. Madde 7'de kesik, imza bölümü yok.
- M10 AWARD_PACK / 5.5: `"…and will notify TÜB"`. Beyan 7. maddede kesik, imza bölümü yok.

**Kör puanlama (rep 0, her eksen 1–5, 8 senaryo; en fazla 40/eksen, 160 toplam):**

| Eksen | claude-sonnet-5 | claude-sonnet-5-5 |
|---|---|---|
| Doğruluk (uydurma ve yanlış olgu cezalı) | 29 | **32** |
| Dil (Türkçe akıcılık / istenen dilde kalma) | 40 | 40 |
| Talimata uyum | **39** | 31 |
| Biçim | **39** | 30 |
| **Toplam** | **147** | 133 |

Senaryo bazında (s5 / s5-5): M2-concept 18/19 · M2-drafting 17/19 · M6-pass 19/20 · M6-fail 20/20 · **M7 19/9** · M9 18/18 · **NDA 19/13** · AWARD_PACK 17/15.
- 5.5'in önde olduğu yer: M2'de uydurma hedefleri "proposed / teyit edilmeli" diye işaretliyor. Sonnet 5 "≥800 çevrim, ≥%25 LCOS" gibi sayıları olgu gibi yazıyor. AWARD_PACK'te 5.5 yer tutucu bırakıyor; Sonnet 5 çağrı kimliği, ESR 13,5/15 ve teklif no uyduruyor.
- 5.5'in olgu hatası: 3 çıktıda (M7 rep0, M9 rep0, M9 rep1) **"Türkiye Horizon Europe'a ilişkili ülke değildir / non-associated third country"** yazıyor. Bu yanlış: Türkiye 2021'den beri Horizon Europe'a ilişkili ülke. Sonnet 5'in 24 çıktısında bu iddia hiç yok. FonBridge'in hedef kitlesi Türk kurumları olduğu için bu hata kullanıcıyı başvurudan vazgeçirebilecek türden. (Olgunun kaynağı model bilgim; yayına dayanak yapılacaksa AB ilişkilendirme anlaşması metniyle teyit edilmeli.)
- 5.5'in M6 çıktısı çıplak JSON. Sonnet 5 bir kez ```json çitiyle döndü; ayrıştırıcı (`esr-parser.ts:71`) çiti sıyırdığı için kırılma yok.

**Aylık tahmini fark (senaryo bazlı).** Gerçek hacim yok: yerel DB'de `AiUsageLog` toplam 9 satır, hepsi OpenAI embedding, son 30 günde 0 Anthropic çağrısı (salt-okunur sorgu çıktısı: `[{"n":9,"n30":9}]`, Anthropic filtresiyle `[]`). Tahmin, 1 kredi ≈ 1 çağrı ve bu 7 purpose'un eşit ağırlıklı karışımıyla yapıldı:

| Aylık çağrı | sonnet-5 | sonnet-5-5 | fark |
|---|---|---|---|
| 500 (pilot: 5 kiracı × 100 kredi) | 9,77 USD | 11,05 USD | +1,28 USD (+%13) |
| 5.000 | 97,73 USD | 110,53 USD | +12,80 USD |
| 25.000 (50 kiracı × 500 kredi) | 488,67 USD | 552,64 USD | +63,97 USD |

Bu bir **alt sınır**: 5.5'in maliyeti 4096'lık tavanla kırpılmış durumda. Kesilmesin diye `max_tokens` büyütülürse uzun belgelerde çağrı başı maliyet daha da artar.

**API harcaması (beyan):** önceki oturum 0,2436 USD (14 çağrı, log'dan hesap) + bu oturum 0,9997 USD (48 çağrı, `usage`'dan) = **toplam 1,2433 USD ≤ 5 USD**.

## Uyumluluk (değişecek tek satır ve etkileri)

- **Değişecek satır:** `src/lib/llm.ts:42` `anthropic: 'claude-sonnet-5',` → `'claude-sonnet-5-5'`. **Bu kartta değiştirilmedi.**
- **temperature:** gönderilmiyor (`llm.ts` 178–180. satırlardaki yorum). 5.5'te varsayılan dışı örnekleme değeri 400 verir; uygulama etkilenmez.
- **thinking / effort:** gönderilmiyor. İki model de uyarlanabilir düşünmeyle, varsayılan `high` effort ile koşuyor. 5.5'te seviyeler yeniden kalibre edildi ve belgelerde daha çok düşünüyor. Ölçüldü: çıktı tokenlarının ~%28'i düşünme. `thinking: {type:"disabled"}` 5.5'te 400 döner; uygulama bunu göndermiyor.
- **Yanıt biçimi:** 5.5, 24 çağrının 18'inde `thinking+text` döndü. `textFromAnthropicContent` blok tipine göre okuduğu için metin doğru çıkıyor; boş çıktı 0/48. Yeni bir `stop_reason` değeri (`refusal`, 5 kategori) mümkün. Uygulama `stop_reason`'ı **hiç okumuyor** (`llm.ts:201-208`): `max_tokens` da `refusal` da sessizce "başarılı" kaydediliyor ve kredi düşülüyor.
- **Etkilenecek testler:**
  - `src/lib/llm.generate.test.ts:476`: `expect(modelFromPrompt).toBe('claude-sonnet-5')` kırılır, beklenen değer güncellenmeli.
  - `src/app/[locale]/admin/settings/page.tsx:71` `DEFAULT_MODELS.anthropic` değerini ekranda gösteriyor. Test değil, ama ekran metni değişir.
  - `tests/` altında başka `claude-sonnet-5` sabiti yok (`grep -rln "claude-sonnet-5\|DEFAULT_MODELS" tests src e2e` → yalnız yukarıdaki iki dosya + llm.ts). Modül testleri (m6/m7/m9/m10, esr-parser) fetch'i taklit ediyor; model adına bağlı değiller.

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MUN3FWZWT11MX-se-fb.md` (bu rapor, commit'lenen tek dosya).
- Kod değişikliği yok. Spike dosyaları repoya girmedi. Oturum scratchpad'inde duruyorlar ve geçici: `/private/tmp/claude-501/-Users-macbook-alan/fa3aff79-dc4b-411e-b880-fd4fa43c4a79/scratchpad/spike/`
  - `spike.mjs` (koşucu), `summarize.mjs` (özet ve kör paket), `RUBRIC.md` (koşu öncesi rubrik)
  - `results.jsonl` (48 satır, ham metin + usage), `run.log`
  - `blind.md` ve `blind-key.json` (kör paket ve anahtar), `scores-blind.json` (anahtardan önce yazılan puanlar)

## 4. Riskler

- **Örneklem küçük:** 8 senaryo, 3 tekrar. Kör puanlama yalnız rep 0 üzerinde yapıldı ve tek puanlayıcı vardı (se-fb). Kesilme ve gecikme 3 tekrarın hepsinde tutarlı; kalite puanı yön gösterir, kesin sonuç değildir.
- **Puanlayıcı yanlılığı:** Kesilmeyi fark etmek kolay olduğu için kör etiket "hangisi 5.5" sorusunu kısmen ele verir. Doğruluk ekseni bundan etkilenmez; uyum ve biçim eksenleri etkilenebilir.
- **Kapsanmayan purpose'lar:** M10'un LOI, COMMITMENT ve ESR_DEBRIEF türleri koşulmadı. M2'nin diğer bölüm anahtarları da koşulmadı.
- **Güncel hata (modelden bağımsız):** Sonnet 5 de AWARD_PACK'te 2/3 kesildi. Bugün üretimde kesik belge kaydedilip kredi düşülebilir. Bu bir güvenilirlik ve faturalama sorunu.

## 5. Açık sorular

- Hedef aylık çağrı hacmi nedir? Tahmin tablosu varsayımsal. Pilot hacmi netleşince yeniden hesaplanmalı.
- M10 belgeleri için makul uzunluk nedir? `max_tokens` artırılmalı mı (maliyet artar), yoksa prompt kısaltılmalı mı ("en fazla N kelime")? Bu bir ürün kararı.

## 6. Sonraki adım

1. **Ayrı kart (öneriliyor, bu kartta yapılmadı):** `callProvider` `stop_reason`'ı okusun. `max_tokens` → kesildiği işaretlensin ya da hata dönsün; `refusal` → anlamlı hata dönsün, kredi düşülmesin. Uzun belge purpose'ları (M7, M10) için `maxTokens` yeniden boyutlandırılsın.
2. Bu düzeltmeden sonra spike yeniden koşulsun: 5.5, `max_tokens` 8192–16000 ve açık `output_config.effort` (`medium` / `low`) ile. Aynı `spike.mjs`'e `effort` alanı eklemek yeter; tahmini maliyet < 1 USD. Geçiş kararı bu ölçümle verilsin.
3. O zamana kadar varsayılan model **claude-sonnet-5** kalıyor.
