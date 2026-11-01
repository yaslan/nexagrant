## Ne değişti
TASK-MVC91DFJDQ2E1 (FO-49) + TASK-MVFLPJFYTJRNP (FO-102, FO-21 yayın engeli düzeltmesi). Patron kararları (2026-10-17): veri sorumlusu **Fonbridge Eğitim, Proje ve Danışmanlık Ltd. Şti.**, saklama **1 yıl**, veriler **yurt içinde**.

- `content/kvkk-uzman-v2.md` + `.en.md`: placeholder kalktı; §1 unvan; §5 yurt dışı aktarım yok, rehber görünürlüğü lansmana bağlı (kodla uyumlu); §6 1 yıl (formu ilk gönderdiğiniz tarih; doğrulanmamışlar için de).
- **FO-102 (FO-21 O2) — aydınlatma metni eksikleri, tr + en:**
  - §1: adres ve KEP adresi satırları — **yer tutucu** (`[ADRES — patron]`, `[KEP ADRESİ — patron]`).
  - §4 "Toplama yöntemi ve hukuki sebepler" (m.10/1-d): web formu, elektronik ortam, kısmen otomatik (form, doğrulama bağlantısı, IP özeti).
  - §7: KVKK m.11'in dokuz hakkının tamamı (önceden 5 tanesi özetleniyordu); rıza geri almanın geçmişe etkisizliği; info@ ile rıza geri alma korundu.
  - §8 yeni "Başvuru yöntemi": Başvuru Usul Tebliği kanalları (ıslak imzalı yazılı / noter, KEP + güvenli e-imza/mobil imza, sistemde kayıtlı e-posta), başvuruda bulunması gerekenler, 30 gün + ücret, Kurula şikâyet (m.14).
  - Test: iki dilde de 8 başlık ve 9 maddelik hak listesi sabitlendi (mutant: bir hak silinince test kırmızı).
- `consentTextVersion` / `EXPERT_PREREG_CONSENT_VERSION`: `kvkk-v1` → `kvkk-v2`. Eski satırlar `kvkk-v1` kalır; v1 dosyaları silinmedi. (v2 henüz yayında olmadığı için O2 eklemeleri yeni sürüm numarası almadı.)
- Yükleyici (`kvkk-text.server.ts`) ve testler v2'ye bağlandı.
- Unvan birliği: DPA tr/en, EFATURA_SETUP, EFATURA_INTEGRATOR_RFI, MALI_MUSAVIR_SORULARI, agency-channel addendum, privacy-notice-gap-analysis, HUKUK-SORULARI, `.env.example` yorumu.
- Güncel `dev`'e rebase edildi (2026-10-19). Tek çakışma `docs/DATA_MODEL.md`: dev'in FO-45/FO-26 metni alındı, yalnız `consentTextVersion` notu `kvkk-v2` yapıldı.

## ⛔ Yayın engeli — hukuk onayı gerekir
1. **Adres ve KEP adresi** metinde yer tutucu. Patron gerçek değerleri verene kadar bu metin yayına çıkmamalı (m.10/1-a: veri sorumlusunun kimliği; Başvuru Usul Tebliği m.5 kanalları). MERSİS no da istenirse §1'e eklenir.
2. **Metnin tamamı hukuk onayından geçmeli.** Metin teknik taslaktır; avukat görmedi.
3. **1 yıl silme işi #92'de** (be-fb). #94 ve #92 birlikte birleşmeli; yalnız #94 girerse metin "1 yıl sonra silinir" der ama silen iş yoktur.

## O3 — zorunlu "açık rıza" (ürün + hukuk kararı, bu PR'da kod/şema DEĞİŞMEDİ)
Bugün `visibilityConsent: z.literal(true)` (`src/lib/expert-prereg/schema.ts`) zorunlu; metin §4 bunu "Açık rıza (m.5/1)" sayıyor. Hizmete şart koşulan rıza "özgür irade" şartını karşılamaz. İki seçenek:
- **(a) Hukuki sebebi değiştir:** rehberde yayımlanma hizmetin özüyse m.5/2-c (sözleşmenin kurulması/ifası) yazılır; kutu "rıza" değil "bilgilendirme/kabul" olarak sunulur. Kod: yalnız etiket ve metin; şema aynı kalır.
- **(b) Rıza olarak bırak, isteğe bağlı yap:** kutu zorunlu olmaktan çıkar (`z.boolean()`), rıza vermeyen kişi kaydolur ama rehberde görünmez. Kod: şema + rehber sorgusu filtresi + form.

## Hukuka açık sorular
- SMTP ve barındırma sağlayıcısı **gerçekten yurt içinde mi?** Metin §5 "yurt dışına aktarılmaz" diyor; doğrulanmadı. Değilse m.9 (yurt dışı aktarım) metni gerekir.
- `kvkk-v1` metniyle (unvansız, saklama süresi belirsiz) alınmış kayıtlara **yeniden aydınlatma** gerekiyor mu?
- O3: (a) mı (b) mi?
- IP özeti (HMAC) kişisel veri sayılıyor mu, saklama süresi ayrıca yazılmalı mı?

## Doğrulama
- Birim: `tests/expert-prereg-form.test.tsx` + `src/lib/expert-prereg` 85/85 (rebase sonrası, worktree).
- Canlı (mac yerel, izole Postgres + Mailpit + `next dev :3122`, Playwright): `/tr/uzman` ve `/en/experts` modalında §4 başlığı, 9 hak, §8, yer tutucular ve m.14 görünüyor. Gerçek `POST /api/expert-preregistration` → 201; DB: `consentTextVersion = kvkk-v2` (tr ve en satırı), doğrulama e-postası Mailpit'te.
- Push kapısı: `pnpm gate` (aşağıdaki sonuç raporunda ham çıktı).
- Rapor: `docs/agent-results/TASK-MVFLPJFYTJRNP-se-fb.md`.

## Açık / dikkat
- **Üretim `INVOICE_SUPPLIER_NAME`** env değeri hâlâ eski unvan olabilir; e-fatura unvanı için ops/patron teyidi gerekli.
- DB default `kvkk-v1` (schema) değiştirilmedi; register her zaman sabiti yazar.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
