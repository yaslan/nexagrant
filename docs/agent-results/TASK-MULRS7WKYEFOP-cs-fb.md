# TASK-MULRS7WKYEFOP — FB KAMU B9: "Veriniz nerede" beyanı + YZ'siz / AB-sınırlı YZ spike'ı

> Ajan: CS-FB · Sprint: FB-KAMU-2 · Dal: `dev` · Tarih: 29.09.2026 · Push yok.

## 1. Ne yapıldı

1. **Ön iş (ayrı commit `ec9406c4`):** B12 eklerinde küçük grup eşiği `<3` → `<5`. `docs/legal/agency-channel-notice-addendum.md` (§3.1 üç madde, HUKUK-5 notu + leed-fb karar gerekçesi, TR ve EN kullanıcı metni, HUKUK-5 soru satırı) ve `docs/legal/processing-register-draft-agency-channel.md` (alıcı ve tedbir satırı).
2. **Veri akış envanteri** (aşağıda §2.1, K1–K10): her satırda bölge + dayanak (dosya:satır ya da sağlayıcı belgesi + erişim tarihi).
3. **Tek sayfa beyan:** `docs/kamu/VERI-YERLESIMI.md` (TR). Açık noktalar `[DOĞRULANMADI]`.
4. **Çelişki listesi** (§2.2): envanter ↔ `docs/legal/processing-register.md`, `docs/SECURITY_COMPLIANCE.md` ve kod. Bu belgeler düzeltilmedi (kapsam dışı; liste LEED-FB için).
5. **Spike (kod yok):** YZ'siz çalışma modu ve AB-sınırlı YZ seçenekleri, öneriyle (§2.3).

## 2. Kanıt

### 2.1 Veri akış envanteri

Sağlayıcı belgeleri erişim tarihi: **29.09.2026**. `.env.example` okundu; değerler kısaltılarak basıldı, sır değeri basılmadı.

| #   | Akış                              | Veri                                                                         | Bölge                                                                                                                                                                                                                                                                                                                                                                              | Dayanak                                                                                                                                                                         |
| --- | --------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Postgres (+ uygulama sunucusu)    | Tüm kiracı verisi                                                            | **[DOĞRULANMADI]** Repoda barındırma bölgesi yok. `.env.example:7` yalnız `DATABASE_URL` (yerel). `docker-compose.yml:24` yerel pgvector. Planlar: `docs/ARCHITECTURE.md:7,88` (Vercel, Neon), `PROJECT.md:92,101` ("Neon veya Supabase"), `docs/ROADMAP.md:120` (karar açık)                                                                                                      | Kod + doküman                                                                                                                                                                   |
| K2  | Cloudflare R2                     | Yüklenen dosyalar, ekran görüntüleri                                         | **AB garantisi yok.** Kod `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` uç noktasını kullanıyor (`src/lib/storage.ts:14-15`), `.eu.` değil. Cloudflare: AB yargı yetkili kovaya S3 API ile `<account_id>.eu.r2.cloudflarestorage.com` üzerinden erişilir; kovanın yargı yetkisi sonradan **değiştirilemez**. Yani bugünkü kovada en fazla "konum ipucu" (garanti değil) olabilir | `src/lib/storage.ts:14-15,31`; `.env.example:59-62`; https://developers.cloudflare.com/r2/reference/data-location/                                                              |
| K3  | Anthropic (tamamlama)             | M2/M6/M7/M9/M10 istem metni                                                  | Saklama (workspace geo): yalnız **"us"** mevcut. İşlem (inference geo): yalnız "global" ve "us"; **AB yok**. Kod `inference_geo` göndermiyor → çalışma alanı varsayılanı geçerli (**[DOĞRULANMADI]**, Console'dan bakılmalı); varsayılan "global" = herhangi bir coğrafya                                                                                                          | `src/lib/llm.ts:30` (varsayılan sağlayıcı), `:181` (uç nokta), `inference_geo` yok (`grep` sonucu boş); https://platform.claude.com/docs/en/manage-claude/data-residency        |
| K4  | OpenAI (embedding)                | RAG arama sorgusu; yüklenen belge parçaları                                  | **ABD** (`api.openai.com`). AB veri yerleşimi mümkün ama satış onayı + ZDR/abuse-monitoring şartı var; kodda yok                                                                                                                                                                                                                                                                   | `src/lib/llm.ts:545`; tamamlama yolu `:214` (bugün üretimde çağrılmıyor); https://developers.openai.com/api/docs/guides/your-data                                               |
| K5  | Resend (e-posta)                  | Alıcı e-postası, silme bildirimi, kayıtlı arama uyarısı, geri bildirim özeti | Gönderim bölgesi alan adı başına (us-east-1, **eu-west-1**, sa-east-1, ap-northeast-1). **Hesap verisi, meta veri ve loglar her durumda ABD'de.** Alan adının bölgesi **[DOĞRULANMADI]**                                                                                                                                                                                           | `src/actions/user/request-deletion.ts:222`, `src/lib/inngest/jobs/alerts-daily.ts:206`, `src/lib/feedback/digest-run.ts:103`; https://resend.com/docs/dashboard/domains/regions |
| K6  | PostHog (analitik)                | —                                                                            | **Akış yok.** Stub; yalnız `NODE_ENV === 'development'` iken `console.log`. SDK paketi yok (`package.json`'da yok)                                                                                                                                                                                                                                                                 | `src/lib/analytics.ts:5,11`; `src/lib/env.ts:16-17` (yalnız şema)                                                                                                               |
| K7  | Sentry (hata izleme)              | —                                                                            | **Akış yok.** `src/`, `package.json`, `next.config.ts` içinde "sentry" geçmiyor; bilinçli karar (2026-09-07)                                                                                                                                                                                                                                                                       | `grep -rli sentry src package.json next.config.ts` → boş; `docs/legal/processing-register.md` §19                                                                               |
| K8  | Google / Microsoft OAuth          | Giriş kimliği (isteğe bağlı yol)                                             | ABD merkezli; bölge Fabrika'nın kontrolünde değil                                                                                                                                                                                                                                                                                                                                  | `src/lib/auth.ts:2-3`; register §21                                                                                                                                             |
| K9  | Inngest Cloud (zamanlanmış işler) | `step.run` çıktıları Inngest'e yazılır (içerik iş başına değişir)            | **[DOĞRULANMADI]** Bölge ve içerik. Kodda `inngest.send` yok (yalnız cron); 18 `step.run` var. `INNGEST_API_KEY` bulut modunu gösterir                                                                                                                                                                                                                                             | `src/lib/inngest/client.ts:4-8`; `docs/INNGEST_SETUP.md:27,67`                                                                                                                  |
| K10 | Stripe / iyzico (ödeme)           | Ödeyen kişi, fatura                                                          | Stripe ABD; iyzico Türkiye (register §21). Kamu pilotunda ödeme akışı kullanılmayabilir                                                                                                                                                                                                                                                                                            | `docs/legal/processing-register.md` §3, §4, §21                                                                                                                                 |

Kapsam dışı (gelen veri, kişisel veri göndermez): SEDIA/CORDIS açık verisi (`.env.example:40-44`), Python worker (`workers/cordis`, kamuya açık CORDIS verisi). Upstash: `.env.example`'da var, `src/`'de kullanımı yok.

### 2.2 Çelişkiler (düzeltilmedi — LEED-FB'ye)

| #   | Nerede                                                                 | Ne diyor                                                                                    | Gerçek                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ç1  | `src/components/PublicFooter.tsx:149` (herkese açık site)              | "🇪🇺 Frankfurt & Istanbul Data Centers"                                                      | Hiçbir akış için doğrulanmadı; İstanbul'da hiçbir sağlayıcı yok. `docs/legal/privacy-notice-gap-analysis.md:190` bunu zaten bulmuş, kod hâlâ aynı. **Kamu görüşmesinde en riskli iddia** |
| Ç2  | `docs/SECURITY_COMPLIANCE.md:103`                                      | "Veri yeri: AB bölgesi (Frankfurt) varsayılan"                                              | Repoda dayanak yok; R2 uç noktası AB yargı yetkili kova için değil (K2)                                                                                                                  |
| Ç3  | `docs/SECURITY_COMPLIANCE.md:103`                                      | "kurumsal müşteriye 'AB bölgesi model' seçeneği"                                            | `src/lib/llm.ts` yalnız `api.anthropic.com` ve `api.openai.com` çağırıyor; Anthropic birinci taraf API'de AB seçeneği yok (K3)                                                           |
| Ç4  | `.env.example` (`AI_PROVIDER`, `EMBEDDING_PROVIDER`)                   | Sağlayıcı ortam değişkeniyle seçilir izlenimi                                               | `src/` içinde hiçbiri okunmuyor (`grep` boş). Sağlayıcı `src/lib/llm.ts:30`'da sabit                                                                                                     |
| Ç5  | `docs/legal/processing-register.md` §6, §7, §21                        | Anthropic "ABD"; satır 233, 507-535; `src/lib/ai/rag.ts`                                    | Varsayılan inference "global" olabilir (K3); satırlar kaydı (OpenAI tamamlama 214, embed 534-545); `src/lib/ai/` yok (birleştirildi)                                                     |
| Ç6  | `docs/legal/processing-register.md` §22 madde 7                        | "PostHog ve Sentry DPA listesinde ama kodda yok"                                            | Aynı belgenin §19'u bunun düzeltildiğini söylüyor; madde eskimiş                                                                                                                         |
| Ç7  | `docs/legal/processing-register.md` §21 ↔ `SECURITY_COMPLIANCE.md:102` | §21'de barındırma (Vercel/Neon/Fly) ve Inngest yok; SECURITY_COMPLIANCE alt işleyen sayıyor | Barındırma ve Inngest yurt dışı aktarım tablosuna girmeli (bölge doğrulanınca)                                                                                                           |
| Ç8  | `docs/SECURITY_COMPLIANCE.md:146`                                      | "Neon PITR 7 gün"                                                                           | Neon kullanımı repoda doğrulanamadı (K1)                                                                                                                                                 |

### 2.3 Spike — YZ'siz çalışma ve AB-sınırlı YZ

**Soru 1: Modül kapatarak YZ'siz çalışma mümkün mü? → Evet, bugün.**

Kiracı verisiyle YZ çağıran her yol, çağrıdan **önce** modül kapısından geçiyor (aynı fonksiyon içinde, doğrulandı):

| Modül | Kapı                                                             | YZ çağrısı                     |
| ----- | ---------------------------------------------------------------- | ------------------------------ |
| M2    | `src/modules/m2/server/actions.ts:65`                            | `:100` embed, `:121` tamamlama |
| M2    | `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:98` | `:103` embed, `:128` tamamlama |
| M6    | `src/modules/m6/server/actions.ts:82`                            | `:85`                          |
| M7    | `src/modules/m7/server/actions.ts:111`                           | `:127`                         |
| M9    | `src/modules/m9/server/actions.ts:38`                            | `:66`                          |
| M10   | `src/modules/m10/server/actions.ts:47`                           | `:92`                          |

- `src/modules/m6/server/esr-parser.ts:75` çağırıcısız (import eden yok).
- M3 kanıt: `extractEvidenceMetadata` YZ çağırmaz (`src/lib/evidence-ai.ts:105-120`, yalnız PII maskeleme).
- Platform yolları (`src/app/api/admin/documents/upload/route.ts`, `src/app/[locale]/admin/cordis/actions.ts`, `src/lib/cordis-sync.ts`) kamuya açık belge/CORDIS verisini embed eder; kiracı verisi değil, platform yöneticisi tetikler.
- Kapı mantığı: `ModuleState` yoksa `OFF` (`src/lib/modules/access.ts:79-121`).
- Kimler açıp kapatır: kiracı sahibi (`manage_modules`, `src/lib/rbac.ts:17-19`; `src/app/[locale]/(app)/[workspace]/settings/modules/actions.ts:32`) ve platform yöneticisi (`src/app/[locale]/admin/modules/actions.ts:23`).

Sınırlar:

1. **Kalıcı kilit yok.** Kiracı sahibi planı izin verdiği sürece M2'yi yeniden açabilir. "Bu kurumda YZ kapalı" sözleşmeyle verilecekse platform düzeyinde kiracı bayrağı gerekir (kod işi → yeni kart).
2. **Kredi sıfırlamak kilit değil.** Kredi kontrolü yalnız `generateCompletion` içinde (`src/lib/llm.ts:365-368`); `embedText` kontrol etmez (`:534-545`). M2'de embed tamamlamadan önce çalışır (`m2/server/actions.ts:100` < `:121`), yani kredi 0'ken bile sorgu metni OpenAI'a gider, sonra tamamlama reddedilir.
3. **Pilot değeri düşer.** İlkadım pilot planının 5.–8. haftası M2 konsept nota dayanıyor (`docs/kamu/ILKADIM-PILOT.md:75-76`). YZ'siz modda radar, karne, M4, M5, M3, M8 çalışır; M2 taslak üretimi çalışmaz.

**Soru 2: AB-sınırlı YZ uç noktası seçenekleri**

| Seçenek   | Ne                                                                                                        | Artı                                                                  | Eksi                                                                                                                                                      | Kaynak (29.09.2026)                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A         | Anthropic birinci taraf API + `inference_geo`                                                             | Kod değişikliği küçük                                                 | **AB yok** (yalnız "global"/"us"); saklama yalnız "us". Kamu sorusunu çözmez                                                                              | https://platform.claude.com/docs/en/manage-claude/data-residency                                                                                                                   |
| B         | Claude, **Amazon Bedrock AB çapraz bölge profili** (hedef bölgeler AB içinde: Frankfurt, İrlanda, Paris…) | Aynı model ailesi; istek AB dışına yönlendirilmez                     | `callProvider`'a yeni adaptör (AWS imzalı istek); `claude-sonnet-5` / `claude-opus-5`'in AB profilinde olup olmadığı **[DOĞRULANMADI]**; AWS hesabı + DPA | https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html ; https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html |
| C         | Claude, **Google Vertex AI AB** (bölgesel: europe-west1/4 ya da AB çoklu bölge)                           | Bölgesel uç nokta istemi ve yanıtı bölgede tutar                      | B ile aynı ölçüde adaptör işi; model/bölge eşleşmesi **[DOĞRULANMADI]**                                                                                   | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency ; https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations                       |
| D (embed) | **OpenAI AB veri yerleşimi** (`eu.api.openai.com`, `/v1/embeddings` destekli)                             | Aynı model → mevcut 1536 boyutlu vektörler geçerli, yeniden embed yok | Satış onayı + ZDR / değiştirilmiş abuse monitoring şartı                                                                                                  | https://developers.openai.com/api/docs/guides/your-data                                                                                                                            |

Hiçbir seçenek veriyi **Türkiye'de** tutmaz. "Veri Türkiye'de kalsın" şartı çıkarsa bu ayrı bir ürün boşluğudur (yurt içi barındırılan model), bu spike'ta değerlendirilmedi.

**Öneri**

1. **Pilot için (kod yok, bugün):** Kamu kiracısını M6/M7/M9/M10 **kapalı** açın. M2'yi kurum yazılı onay verdikten sonra açın. Görüşmede `docs/kamu/VERI-YERLESIMI.md` verilir; altbilgi iddiasına (Ç1) dayanılmaz.
2. **Kısa vade (yeni kart, kod):** (a) Platform düzeyinde "kiracıda YZ kapalı" kilidi; (b) `embedText`'e kredi/modül kontrolü ya da embed'i tamamlama kontrolünden sonraya almak (sınır 2); (c) Ç1 altbilgi metnini kanıtlanana kadar kaldırmak.
3. **Orta vade (AB-sınırlı YZ):** **B + D.** Tamamlama Bedrock AB profiline, embedding OpenAI AB'ye. Gerekçe: D mevcut vektörleri korur; B aynı Claude ailesini AB'de tutar. Önce model-bölge tablosu doğrulanmalı (B'nin [DOĞRULANMADI] maddesi). B yoksa C.
4. **Altyapı doğrulaması (patron / DevOps):** K1, K2, K5, K9 bölgeleri panelden ekran görüntüsüyle. R2 AB değilse **yeni** AB yargı yetkili kova + uç noktayı `.eu.` yapmak gerekir (mevcut kova taşınamaz).

### Komut kanıtı (özet)

```
$ grep -rli sentry src package.json next.config.ts        → (boş)
$ grep -rn "AI_PROVIDER\|EMBEDDING_PROVIDER" src         → (boş)
$ grep -n "inference_geo" src/lib/llm.ts                 → (boş)
$ grep -n "api.anthropic.com\|api.openai.com" src/lib/llm.ts
181: fetch('https://api.anthropic.com/v1/messages'
214: fetch('https://api.openai.com/v1/chat/completions'
545: fetch('https://api.openai.com/v1/embeddings'
$ grep -rn "Frankfurt" src messages
src/components/PublicFooter.tsx:149: <span>🇪🇺 Frankfurt & Istanbul Data Centers</span>
$ git show --name-only --oneline ec9406c4
ec9406c4 docs(legal): raise agency small-group threshold from <3 to <5 (TASK-MULRS7WKYEFOP)
docs/legal/agency-channel-notice-addendum.md
docs/legal/processing-register-draft-agency-channel.md
```

## 3. Değişen dosyalar

- `docs/legal/agency-channel-notice-addendum.md`, `docs/legal/processing-register-draft-agency-channel.md` (commit `ec9406c4`)
- `docs/kamu/VERI-YERLESIMI.md` (yeni)
- `docs/agent-results/TASK-MULRS7WKYEFOP-cs-fb.md` (bu rapor)

Kod ve `messages/` dosyalarına dokunulmadı. Çalışma ağacındaki başkalarına ait değişiklikler (`prisma/*`, `src/instrumentation.ts`, `src/lib/agency/` …) commit'e alınmadı.

## 4. Riskler

- Ç1 altbilgi iddiası herkese açık sitede duruyor; belediye siteyi görürse beyanla çelişir.
- K1/K2 bölgeleri doğrulanmadan beyan "bilmiyoruz" der; görüşme öncesi kapanmazsa güven kaybı.
- Anthropic varsayılan "global" ise istem metni ABD dışı başka ülkelerde de işlenebilir; register §21 bunu "ABD" diye daraltıyor.
- Sağlayıcı belgeleri değişir; tarihler 29.09.2026.

## 5. Açık sorular

1. Üretim Postgres ve uygulama sunucusu hangi firma ve bölgede? (patron/DevOps)
2. R2 kovası AB yargı yetkili mi? Kod uç noktası "hayır" diyor; panelden teyit.
3. Anthropic Console çalışma alanında `default_inference_geo` nedir?
4. Resend alan adı hangi gönderim bölgesinde?
5. Kamu için YZ kilidi sözleşme maddesi mi olacak? (kalıcı kilit kartının önceliğini belirler)

## 6. Sonraki adım

- LEED-FB: §2.3 öneri 2 (a, b, c) ve 3 için kart; Ç2–Ç8 için register/SECURITY_COMPLIANCE düzeltme kartı.
- Patron/DevOps: §5 soru 1–4 cevaplanınca `docs/kamu/VERI-YERLESIMI.md` [DOĞRULANMADI] satırları güncellenir.

**Platform beyanı:** Yalnız doküman işi; macOS (darwin) üzerinde `grep`/`git` ile doğrulandı. Kod yolu değişmediği için Windows/Linux etkisi yok; dokümanlar platformdan bağımsız.
