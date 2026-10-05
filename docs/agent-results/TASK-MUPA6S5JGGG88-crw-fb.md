---
sözleşme: 3
görev: TASK-MUPA6S5JGGG88
kod: TASK-MUPA6S5JGGG88
ajan: crw-fb
motor: claude
tip: karar
okur: ekip
hüküm: Bitti: DEĞİŞİKLİK İSTE — P-4 kod ve alıntı kanıtları ile saklama tespiti doğru; ama raporun hüküm satırı yazardan yok/geçersiz (Y-1) ve önerilen P-4 cümlesi yüklenen belgelerin OpenAI'a gittiğini söylemiyor (Y-2).
platform: mac (Darwin 27.0): git okumaları, kod satırı kontrolü, sağlayıcı sayfaları curl ile ham HTML (01.10.2026). Kod çalıştırılmadı; platforma bağlı yol yok (yalnız belge). Windows/Linux koşulmadı — gerek yok.
sürüm: 1
tarih: 2026-10-01T15:29:01.573Z
---

# FB REVIEW 3 — Pilot SSS gizlilik/uyum (TASK-MUPA6S5JGGG88, se-fb)

**İncelenen:**
- `/Users/macbook/alan/docs/agent-results/TASK-MUPA6S5JGGG88-se-fb.md` (tur 1, reddedilmiş)
- `…-se-fb-2.md` (tur 2, geçerli)
- SSS dalı `cs-fb/pilot-sss` @ `4566d1a8`. Rapor `75e27c1c`'ye göre yazılmış; arada yalnız G2 değişti (`git diff --stat` → SSS-PILOT.md 6+/6−).
- Kod: `dev` @ `08d1b066`.

## 1. İddia → kanıt (benim kontrolüm)

| İddia (tur 2) | Sonuç | Kanıt |
|---|---|---|
| Varsayılan Anthropic, `llm.ts:31`, `:287` | ✅ | `DEFAULT_PROVIDER: LlmProvider = 'anthropic'`; `fetch('https://api.anthropic.com/v1/messages'` |
| OpenAI chat üretimde çağrılmıyor | ✅ | `src` içinde `provider: 'openai'` geçen tek dosya `llm.ts` |
| Embedding her zaman OpenAI, `llm.ts:613`, `:692`, gövde `{model, input: text, dimensions}` | ✅ | `DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large'`; çağıran `rag.ts:233` |
| İstek gövdelerinde eğitimi açan bir parametre yok | ✅ | `llm.ts:334` `{ model, max_tokens, messages }`, `:699` |
| Anthropic: "may not train models on Customer Content from Services." | ✅ | Kendim çektim: `curl` commercial-terms, ham HTML'de birebir var |
| OpenAI: "As of March 1, 2023 … unless you explicitly opt in" | ✅ | Kendim çektim: `curl` developers.openai.com/api/docs/guides/your-data, birebir var |
| OpenAI `/v1/embeddings` saklaması 30 gün | ✅ | Aynı sayfa: "/v1/embeddings No 30 days None Yes No" |
| `SECURITY_COMPLIANCE.md:140` "saklama sıfır/minimum; sözleşme ekinde" kanıtla desteklenmiyor | ✅ | Satır yerinde duruyor; repoda imzalı ek yok |
| P-6: sayfa dosyanın birebir kopyası (`page.tsx:46-50`) | ✅ | 1.0 için doğru |
| Destek iç kaydı 21 alan (`DESTEK-SABLONLARI.md` §3) | ✅ | Tabloyu saydım: 21 satır |
| Destek kaydının saklama süresi yok | ✅ | `DESTEK-SABLONLARI.md` §3 sonu: **[DOĞRULANMADI]**, süre ve yer yazılmamış. `processing-register.md`'de "destek" yalnız "YZ destekli" (:81, :88) olarak geçiyor, destek kaydı satırı yok |
| Uygulama formu (`Feedback`) kalıcı, temizlik işi yok | ✅ | register :206 "Kalıcı — temizlik işi yok". `src` içinde `feedback.delete(Many)` yok. `api/feedback/route.ts:105` user-agent'ı topluyor, ekran görüntüsü ≤2 MB (`:18`) |
| P-6 / DPA iddiası (D7) | ✅ dev için | SSS D7 "taslak, pilot öncesi imzalanır" diyor. dev'deki DPA hâlâ 1.0 |

## 2. Bulgular

- **Y-1: Hüküm satırı eksik ya da geçersiz.**
  - Tur 1 raporunda (`TASK-MUPA6S5JGGG88-se-fb.md`) frontmatter ve hüküm satırı yok. Rapor kapıdan bu yüzden döndü.
  - Tur 2'de frontmatter'ı yazar değil, **leed-fb eklemiş** (`not:` satırı bunu söylüyor).
  - Değer "DÜZELTİLDİ — …". Kapı sözlüğü "Bitti:/Kısmen bitti:/Başarısız:" + ONAY/DEĞİŞİKLİK İSTE bekliyor; bu değer o sözlükte yok.
  - Yazar raporu `rapor_yaz` ile kendi hükmüyle yeniden yazmalı.
- **Y-2: Önerilen P-4 cümlesi (§3.1) OpenAI'a giden veriyi eksik anlatıyor.**
  - Cümle: "Yapay zekâ özelliklerine **yazdığınız** metinleri … arama için OpenAI'a" (EN "Text you type").
  - Kodda RAG yüklemesi, **yüklenen belgelerin parçalarını** gömme için OpenAI'a gönderiyor: `rag.ts:210-233` ("It used to `fetch` OpenAI … which sent the chunk text") → `llm.ts:699` `input: text`.
  - DPA 1.1 Ek-1 bunu doğru yazıyor: "arama için gömülen belge metni".
  - Kullanıcıya gidecek cümlede şu düzeltme yapılmalı: "yazdığınız metinler ve yüklediğiniz belgelerin metni".
- **Ö-1: Tur 2 raporu DPA 1.0'a göre yazılmış.**
  - Aynı yazarın `se-fb/p6-dpa-signable` dalı (1.1) F-1, F-2, F-3 ve F-7'yi kapatıyor. Model eğitimi cümlesi 1.1'de `dpa-tr.md:61`'de; SSS D3 hâlâ `:44` diyor.
  - DPA dalı dev'e alınınca SSS D3/D7 atıfları ve 1-3-1 §6.2 güncellenmeli.
  - DPA 1.1'in kendi açıkları için bkz. `TASK-MUPIQY1GFTRE2-crw-fb.md` Y-1..Y-3.
- **Ö-2: OpenAI kuruluş panelindeki veri paylaşımı ayarı doğrulanmadı** (yazar da söylüyor). "Biz izin vermedik" cümlesi bu doğrulanmadan kullanılmamalı. Doğrulama patronda.
- **Ö-3: `SECURITY_COMPLIANCE.md:140` düzeltilmeli.** Bunun için ayrı kart açılsın (yazarın R-5 bulgusu, katılıyorum).
- **Ö-4: Yazar raporları repo dışında.** İki dosya da `/Users/macbook/alan/docs/agent-results/` altında, FONBRIDGE git'inde değil. Entegrasyonda repoya kopyalanmalı.
- **Ö-5: Saklama 1-3-1 önerisi (C) makul.** Ama ekran görüntüsünü kapanışta silmek kod ister: `Feedback.screenshotKey` R2'de duruyor ve temizlik işi yok. Bu ayrı bir be-fb kartı olmalı.

## 3. Sonraki adım

1. se-fb, §3.1 TR/EN cümlesini Y-2'ye göre düzeltir ve raporu `rapor_yaz` ile, hüküm satırı kapı sözlüğüne uyacak şekilde yeniden yazar (Y-1).
2. Patron: OpenAI panel ayarı (Ö-2), P-4 seçimi (A/B/C), saklama kararı.
3. DPA 1.1 merge edildikten sonra cs-fb SSS D3/D7 atıflarını tazeler (Ö-1).

Platform: mac. Kod değiştirmedim.
