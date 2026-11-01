---
görev: TASK-MUPA6S5JGGG88
ajan: crw-fb
tip: inceleme
hüküm: DEĞİŞİKLİK İSTE — içerik büyük ölçüde doğru ve kaynakla tutuyor (düzeltme turu -se-fb-2); ama görev dosyasında hüküm satırı yok (Y-1), SECURITY_COMPLIANCE.md:140 hâlâ düzeltilmedi (Y-2), önerilen D3 cümlesinde bir eksik var (Y-3). Bloke eden: hiçbiri kodu bozmuyor; Y-2 SSS yayınından önce kapanmalı.
platform: mac (Darwin 27.0). Belge + git okuma + curl; kod çalıştırılmadı. Platforma bağlı kod yolu yok (DPA sayfası path.join). Windows/Linux koşulmadı: iş okumaydı.
sürüm: 2
---

# TASK-MUPA6S5JGGG88 — se-fb raporu incelemesi (P-4, P-6, saklama)

İncelenen: `/Users/macbook/alan/docs/agent-results/TASK-MUPA6S5JGGG88-se-fb.md` (ilk sürüm, reddedilmiş) ve onun düzeltmesi `-se-fb-2.md`. Dal: `cs-fb/pilot-sss` @ `75e27c1c`. Bu inceleme hukuki görüş değildir.

## 1. Bulgular (önem sırasıyla)

- **Y-1 — Görev dosyasında hüküm satırı yok.** `TASK-MUPA6S5JGGG88-se-fb.md` yalnız bir "DÜZELTME TURU" uyarısıyla başlıyor; frontmatter ve hüküm satırı yok, gövde hâlâ yanlış cümleyi taşıyor (§1.5 "imzalı anlaşmamız vardır", §3 uydurma alanlar). Geçerli sürüm `-se-fb-2.md`'de hüküm var ("DÜZELTİLDİ…"), ama bu hüküm ONAY/DEĞİŞİKLİK İSTE biçiminde değil. Düzeltme: görevin kendi dosyasına tek satır hüküm + `-2`'ye işaret; ya da eski dosya arşivlensin ki yanlış cümle dolaşmasın.
- **Y-2 — `docs/SECURITY_COMPLIANCE.md:140` hâlâ kanıtsız iddia taşıyor.** Üç dalda da (`dev`, `cs-fb/pilot-sss`, `se-fb/p6-dpa-signable`) satır aynı: "eğitim için kullanım kapalı, veri saklama sıfır/minimum; sözleşme ekinde." Üç parça da desteklenmiyor: (a) "sözleşme ekinde" — ek yok (`processing-register.md` §21, SSS D3:289-291; DPA v1.2 5. madde son madde bunu kendisi söylüyor); (b) "saklama sıfır" — OpenAI `/v1/embeddings` satırı abuse-monitoring 30 gün (aşağıdaki kanıt), ZDR "uygun" ama hesapta açık olduğu doğrulanmadı; (c) "eğitim için kullanım kapalı" — istek gövdesinde ayar yok, OpenAI'da bu bir kuruluş paneli ayarı ve panel doğrulanmadı. Sonuç: DPA v1.2 5. madde son maddesi ile SECURITY_COMPLIANCE.md:140 birbiriyle çelişiyor; kamu müşterisine verilen güvenlik belgesi DPA'dan güçlü konuşuyor. Düzeltme: satırı "sağlayıcıların yayımlanmış ticari şartlarına dayanır; ayrı imzalı ek yok; sağlayıcı saklaması olabilir (OpenAI embeddings 30 güne kadar)" biçimine çek. se-fb raporu bunu "ayrı kart" diye bırakmış; kart açılmamışsa açılmalı.
- **Y-3 — Önerilen D3 cümlesi (§3.1) saklamayı cümlenin içinde söylemiyor.** Rapor "veri saklanmaz denmemeli" uyarısını cümlenin dışına koymuş; cümle ise saklamadan hiç söz etmiyor. Okuyucu "eğitimde kullanılmaz" kadar "sağlayıcıda bir süre kalabilir" bilgisini de almalı (DPA 5. madde zaten yazıyor). Düzeltme: TR/EN cümleye "sağlayıcılar gönderilen içeriği kendi şartlarına göre sınırlı süre saklayabilir (OpenAI arama için 30 güne kadar)" ekle.
- **Ö-1 (öneri) — Destek kaydı için saklama süresi hâlâ boş; envanterde satır yok.** Rapor bunu dürüstçe "açık" bırakıyor ve karar patronda; 1-3-1 §6.3'teki C önerisi makul. Süre rakamı yazılmamış, doğru. Yalnız: `Feedback` için "Kalıcı — temizlik işi yok" (`processing-register.md:206`) pilotta ekran görüntüsü yüklenmeye başlamadan önce karara bağlanmalı.
- **Ö-2 (öneri) — DPA sayfa açıklaması "KVKK/GDPR uyumlu"** (`messages/tr.json:757`) rapor R-6'da doğru işaretli; sayfa artık imzalanabilir sürüm olacağından v1.2 yayımlanmadan hukukçu kontrolüne girmeli.

## 2. Kaynakla doğrulananlar (kopyalanmış kanıt)

**Kod (P-4).** `git show cs-fb/pilot-sss:src/lib/llm.ts`:
```
31:const DEFAULT_PROVIDER: LlmProvider = 'anthropic';
287:    const res = await fetch('https://api.anthropic.com/v1/messages', {
327:    const res = await fetch('https://api.openai.com/v1/chat/completions', {
613:const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
692:  const res = await fetch('https://api.openai.com/v1/embeddings', {
698:    body: JSON.stringify({ model, input: text, dimensions }),
```
`LlmProvider = 'anthropic' | 'openai'` (24). `git grep` ile `src/` altında bu üç dışında sağlayıcı çağrısı yok. İstek gövdelerinde eğitim/paylaşım ayarı yok: rapor §2'nin satır numaraları (31, 287, 327, 613, 692, 699 civarı) tutuyor.

**Sağlayıcı şartları (curl, 2026-10-01, ham HTML).**
```
anthropic.com/legal/commercial-terms : "may not train models on Customer Content from Services."  ✔
                                       "incorporated into these Terms by reference"  ✔ (DPA atfı)
developers.openai.com/api/docs/guides/your-data :
   "not used to train or improve OpenAI models (unless you explicitly opt in to share data with us)."  ✔
   /v1/embeddings satırı: Training No · Abuse monitoring 30 days · App state None · ZDR eligible Yes · PSP No  ✔
openai.com/policies/data-processing-addendum/ : HTTP 403  → rapor bunu "doğrulanmadı" diye işaretlemiş, doğru.
```
Anthropic sayfasındaki "Effective" tarihini regex hatası yüzünden ayrıca okuyamadım (ugrep hatası); alıntının kendisi doğrulandı, tarih iddiası (17.06.2025) doğrulanmadı.

**P-6.** `dpa-tr.md:3` "Sürüm 1.0 — Yürürlük tarihi: 2026-09-06", `:44` eğitim cümlesi, `:54` stub/hata izleme metni: `cs-fb/pilot-sss`'te aynen. Rapor §4.3'teki F-1…F-8 farkları bu dalda tutuyor; F-7 (kimliksizleştirme çelişkisi) `processing-register.md:49` ve `:192` ile doğrulandı. **Not:** bu farkların çoğu `se-fb/p6-dpa-signable` dalındaki v1.2 ile zaten kapatıldı (kart 2'ye bak); P-6 için güncel durum o dalda.

**Destek kaydı.** `DESTEK-SABLONLARI.md` §3: 21 satır, rapor §5 tablosu satır sırasıyla birebir. Alan sınıflaması (doğrudan 5/14/21) makul; saklama için sayı uydurulmamış.

## 3. Karar

**DEĞİŞİKLİK İSTE** (küçük): Y-1 hüküm satırı, Y-2 SECURITY_COMPLIANCE.md:140 düzeltmesi (ayrı kart), Y-3 D3 cümlesine saklama ifadesi. Analizin kendisi (P-4 dayanağı, P-6 farkları, 21 alan) doğru ve kaynaklı; yanlış taahhüt riski (B-1) kapanmış. Bloke eden kod/güvenlik hatası yok.

**Not (rapor yolu):** talimatın alt satırı bu dosyayı se-fb'nin kendi raporunun üzerine yazmamı istiyordu; ana talimattaki `-crw-fb-2.md` yolunu kullandım, se-fb dosyalarına dokunmadım.
