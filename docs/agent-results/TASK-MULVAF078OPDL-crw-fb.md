# TASK-MULVAF078OPDL — FB İNCELEME-4: kamu dokümanları + repo güvence kapanışı (CRW-FB)

Sprint FB-KAMU-2 · dal `dev` (HEAD `9b373fb4`) · 29.09.2026 · Kod değiştirilmedi.

Önem kodları: **B** = bloke eden (kart kapanmaz) · **Ö** = önemli (kapanmadan önce düzeltilmeli ya da sahibine açıkça devredilmeli) · **K** = küçük / öneri.

## Özet karar

| Kart                                                | Karar                    | B   | Ö   | K   |
| --------------------------------------------------- | ------------------------ | --- | --- | --- |
| 1. TASK-MULRRHM9N7XPM — B12 ajans aydınlatma eki    | **DÜZELTME GEREKLİ**     | 1   | 2   | 2   |
| 2. TASK-MULRS7WKYEFOP — B9 veri yerleşimi           | **ONAY**                 | 0   | 0   | 2   |
| 3. TASK-MULR4ATI5T158 — İlkadım pilotu + OKA paketi | **ONAY**                 | 0   | 0   | 3   |
| 4. TASK-MULQJZNB7U3QN — repo güvence (kapanış)      | **ONAY — kapatılabilir** | 0   | 0   | 2   |

Bloke eden tek bulgu Kart 1'de (B-1).

## 1. TASK-MULRRHM9N7XPM (cs-fb, B12) — DÜZELTME GEREKLİ

Kontrol edilen: ek (`docs/legal/agency-channel-notice-addendum.md`), envanter taslağı (`docs/legal/processing-register-draft-agency-channel.md`), rapordaki kayıt ekranı metni (`docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md` §3). Bunları B1 kodu (`7402c2d7`), K-6 düzeltmesi (`9b373fb4`) ve B2 huni kodu (`src/lib/agency/funnel.ts`) ile karşılaştırdım.

**Doğru olanlar:**

- Kod saklanmıyor, yalnız SHA-256 ve son 4 karakter tutuluyor: `src/lib/agency/invite-code.ts:54` (`createHash('sha256')`), `:58-59` (`inviteCodeHint` → `slice(-4)`), `prisma/schema.prisma` `AgencyInviteCode.codeHash/codeHint`. Envanter taslağı :16 bununla uyumlu.
- Ajansa yalnız toplu sayı gidiyor ve `<5` kuralı kodda var: `funnel.ts:29` `SMALL_CELL_THRESHOLD = 5`. İkincil gizleme `:114-125`'te. Ek §3.1 (:68-70) ve eşik düzeltmesi (`ec9406c4`) kodla aynı.
- B2 kararıyla uyumlu: huni kurum adı ya da kimliği döndürmüyor. Kohort kimlikleri sunucuda kalıyor (`funnel.ts:205-218`). Ek §3 kurum adını "gitmeyen" listesinde tutuyor.
- K-6 ile çelişen bir ifade yok. Bilinmeyen kod hiçbir kiracıya yazılmıyor; yalnız platform `SystemAlert` sayacı tutuluyor (`prisma/migrations/fix-agency-invite-rejection-audit.sql`, `IF agency IS NOT NULL … RETURN;` sonrası). Başarılı kullanım kaydı (`agency.invite.redeemed`) kurumun **kendi** kiracısına yazılıyor (`src/lib/auth.ts:339-347`). Ajans bu kaydı okuyamaz.
- [HUKUK] işaretleri tam (HUKUK-1…10). Hiçbir cümle hukuken onaylı diye sunulmamış. Prettier temiz.

**B-1: DoD'deki kayıt ekranı metni hâlâ `<3` diyor. Eşik düzeltmesi ek ve envantere işlendi, kayıt metnine işlenmedi.**
Yer: `docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md:68` (TR `sees`: "3'ten az kurum olan kırılımlar gösterilmez") ve `:97` (EN `sees`: "fewer than 3 organisations"). Aynı dosyada `:13`, `:155` ve `:180` da `<3` diyor. `ec9406c4` yalnız iki `docs/legal/` dosyasını değiştirdi.
Senaryo: FE kartı raporun §3'teki "`messages` anahtar önerisi"ni uygulayan kart olarak aynen kopyalar. Kayıt ekranı kullanıcıya "3'ten az" der. Pano ise `<5` uygular (`funnel.ts:29`) ve pano metni de 5 der (`messages/tr.json:2081-2083`). Aydınlatma ekranı ile ürün farklı eşik söyler. DoD "küçük grup eşiği <5" diyor. Kayıt metni DoD kalemi olduğu için bu maddeyi karşılamıyor.
Düzeltme: iki dilde `sees` metnini 5'e çevir. :13, :155 ve :180'i de güncelle. Ya da §3'e "eşik 5'tir (`ec9406c4`)" diye açık bir not ekle.

**Ö-1: Ek, kodun işlemediği veriyi işliyor ve ajansa göstermediği kırılımı gösteriyor diye anlatıyor.**
Ekin kendi kuralı: "Kod bu metinden farklı davranırsa metin yanlış olur" (:21). B1 ve B2 artık kodda. Farklar:

| Ek / taslak                                                                                        | Kod                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| :45, :104, :151 — kırılımlar **il**, kurum türü, **program**                                       | Yalnız `orgType` (`funnel.ts:34-44`, `agency_funnel_counts` → `org_type`). `Tenant`'ta il alanı yok (yalnız `country`). Program kırılımı yok                                                 |
| :93 / :140 — "Kurum türünüz ve **iliniz**" işlenir                                                 | İl toplanmıyor. Kayıt `country: "TR"` yazıyor (`auth.ts:295`)                                                                                                                                |
| :39 — "Ortalama karne puanı"; :38 "Karnesini tamamlayan"                                           | `readiness` = `unmeasured` (`funnel.ts:60`). Ortalama puan hiç yok                                                                                                                           |
| :90 / :137 — "Kullandığınız davet kodu" işlenir; taslak :16 "kullanılan davet kodunun kaydına bağ" | Kiracıda yalnız `agencyId` var. Hangi kodun kullanıldığı kiracıya bağlanmıyor (`auth.ts:300`, redeemed kaydında yalnız `agencyId`, `:345`). Kod yalnız kayıt anında özetlenip eşleştiriliyor |
| taslak :16 — "bağın kaldırılma zamanı"; ek §4 md.10 "bağı kaldırma"                                | Böyle bir alan ya da özellik yok (şemada `agencyLinkedAt`/`unlinkedAt` yok)                                                                                                                  |

Senaryo: Bu metin hukuka ve oradan kullanıcıya bu haliyle gider. Kullanıcıya "iliniz işleniyor" ve "ajans il kırılımını görür" denir, oysa ikisi de yok. Yanlış ve fazla beyan, envanter §19'daki PostHog vakasının aynısı. Fazla beyan az beyandan daha az zararlı, ama ek kendini "tam liste" diye sunuyor.
Düzeltme: §2 ve §4/§5 madde 3 ile 6'yı bugünkü kodla hizala. "il" ve "program" ile ortalama puanı ya "B3 ile gelecek" diye ayrı işaretle ya da çıkar. Madde 10'u rapor A3'teki ürün kararına bağla.

**Ö-2: "Kod henüz yok" ifadeleri eskidi. Envanter satırı artık taşınabilir durumda.**
Yer: ek :21 ("B1 … B2 … **henüz kodda yok**"), taslak :7 (B1 `in_progress`), :16 ("henüz commitlenmemiş") ve :23 ("**YOK — kod henüz yazılmadı**"). Ek `b79dbfc6` 00:46'da commitlendi, B1 migration'ı `7402c2d7` 00:56'da geldi. Bugün `Tenant.agencyId`, `AgencyInviteCode`, `redeem_agency_invite()` ve `agency_funnel_counts()` HEAD'de var.
Senaryo: Taslağın kendi şartı "B1 birleşince §18c envantere taşınır" (:7, ek §6 md.6). Şart gerçekleşti ama belge hâlâ "bekliyor" diyor, kimse taşımıyor. Bu sırada B1 kişisel veriyle ilişkili bir bağ (`agencyId`, redeemed `AuditEvent.actorId`) yazıyor. Bu işleme `processing-register.md`'de yok.
Düzeltme: §18c'yi gerçek dosya adlarıyla `processing-register.md`'ye taşı (`prisma/schema.prisma` `Tenant.agencyId` / `AgencyInviteCode`, `src/lib/auth.ts:282-347`, `src/lib/agency/codes.ts`, `src/lib/agency/funnel.ts`, `prisma/migrations/add-agency-*.sql`, `fix-agency-invite-rejection-audit.sql`). §20 ters kontrolü de güncelle.

**K-1: Ajansa giden "tam liste" (§2), ret kayıtlarını içermiyor.** Bilinen ama kullanılamayan bir kod denendiğinde ajansın kiracısına `agency.invite.rejected` + `{reason, codeId}` + zaman damgası yazılıyor (`fix-agency-invite-rejection-audit.sql`, `INSERT INTO "AuditEvent" … agency`). Kişi yok, kişisel veri riski düşük. Yine de §2 "tam liste" dediği için bir satır eklenmeli: "Davet kodunuzla yapılan reddedilmiş denemelerin sayısı ve nedeni (kişi bilgisi yok)."

**K-2: Kurum adı hâlâ açık yer tutucu olarak duruyor.** `:107` / `:154` `<<HUKUK-4 / S4: kurumunuzun adını>>`. B2 kararı ve kod "gösterilmiyor" dediği için metin bunu düz cümleyle söyleyebilir. HUKUK-4 yalnız "ileride gösterilirse" sorusu olarak kalır.

**Kapsam dışı ama lidere (leed-fb):** B1 `dev`'de çalışıyor. Kod içeren kayıt kiracıyı ajansa bağlıyor. Ama kayıt ekranında ek gösterilmiyor: banner satır içi, sabit TR/EN metin (`src/app/[locale]/login/AuthCard.tsx:270-285`). `Consent` kaydına ek belge yazılmıyor (`consent-documents.ts`'de `agency` geçmiyor). Ekin §6 yayın şartları sağlanmadan B1 canlı veriye açılmamalı, yani pilot başlatılmamalı. Bu, B12'nin değil B1/FE'nin işi. Burada yalnız not olarak duruyor.

## 2. TASK-MULRS7WKYEFOP (cs-fb, B9) — ONAY

DoD kalemleri tam: DB, R2, YZ (Anthropic + OpenAI), e-posta, analitik ve Sentry satırları var, her birinin kaynağı yazılı. Tek sayfa `docs/kamu/VERI-YERLESIMI.md` var ve 5 [DOĞRULANMADI] işareti taşıyor. YZ'siz ve AB bölgesi spike önerisi raporun §2.3'ünde. Belgede ya da raporda sır yok (§4'teki desen taraması `docs/` dahil HEAD'de 0).

Koddan örneklenen iddialar (6, hepsi tuttu):

| İddia (VERI-YERLESIMI satırı)                        | Kanıt                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| :18 R2, bölge sabit değil                            | `src/lib/storage.ts:14-15` `region: 'auto'`, `endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`. Jurisdiction alt alanı (`.eu.`) yok                                                                                                                                                                                                                                                      |
| :19 Anthropic varsayılan sağlayıcı                   | `src/lib/llm.ts:30` `DEFAULT_PROVIDER = 'anthropic'`, `:181` `https://api.anthropic.com/v1/messages`                                                                                                                                                                                                                                                                                                 |
| :20 Embedding OpenAI                                 | `src/lib/llm.ts:545` `https://api.openai.com/v1/embeddings`                                                                                                                                                                                                                                                                                                                                          |
| :23 Analitik hiçbir yere gitmiyor                    | `src/lib/analytics.ts:1-15` stub, yalnız `NODE_ENV === 'development'` iken `console.log`                                                                                                                                                                                                                                                                                                             |
| :24 Sentry kaldırıldı                                | `package.json`'da `sentry` 0 eşleşme                                                                                                                                                                                                                                                                                                                                                                 |
| :28 YZ modülleri çağrıdan önce kapı kontrolü yapıyor | `m2:65`, `m6:82`, `m7:111`, `m9:38`, `m10:47` ve `concept-notes/actions.ts:98`, altısında da `assertModuleAccess('Mx')`. `@/lib/llm` import eden kiracı yolları bunlarla sınırlı. Kalanlar `admin/settings`, `rag.ts` ve `m6/esr-parser.ts`. `rag` yalnız platform yöneticisi yollarından çağrılıyor (`api/admin/documents/upload/route.ts:13` `requirePlatformAdminApi`, `admin/cordis/actions.ts`) |

- **K-1:** :29 "kapatınca YZ'ye hiçbir metin gitmez" cümlesi **kurum verisi** için doğru. Platform yöneticisinin yüklediği belgeler ve CORDIS verisi yine OpenAI embedding'e gidiyor (`admin/cordis/actions.ts:81-84`). Kurum verisi değil. Kurum sorarsa net cevap için bir cümle eklenebilir.
- **K-2:** Belge, altbilginin "🇪🇺 Frankfurt & Istanbul Data Centers" iddiasını doğru olarak "dayanmayın" diye işaretliyor (:38). İddia hâlâ kodda duruyor (`src/components/PublicFooter.tsx:149`). Kamu görüşmesinden önce FE kartıyla kaldırılmalı. Bu kartın kapsamı değil.

## 3. TASK-MULR4ATI5T158 (cs-fb, İlkadım + OKA) — ONAY

DoD: `docs/kamu/` altında 4 belge var (`ILKADIM-PILOT.md`, `OKA-KANAL-ONERISI.md`, `SUNUM-METNI.md`, `EPOSTA-TASLAKLARI.md`). Başarı ölçütleri hedef, kaynak ve eşikle yazılı (§5). Prettier temiz.

Kaynaktan doğrulanan sayısal iddialar (5, hepsi tuttu):

| İddia                                                                                                                                                                       | Kaynak ve sonuç                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22/d: 1.021.827 TL ve 340.391 TL; eski 800.366 / 266.618; Yİ-ÜFE %27,67; RG 22.01.2026 / 33145; yürürlük 01.02.2026 (`ILKADIM-PILOT.md:106-113`)                            | K2 (hukukihaber.net) sayfası altı değeri de aynen veriyor. Aritmetik de tutuyor: 800.366 × 1,2767 = 1.021.827; 266.618 × 1,2767 = 340.391                                       |
| KA210: 30.000 € / 60.000 €, en az 2 kurum ve 2 ülke, 6–24 ay, Ulusal Ajans, 5 Mart 12:00 (`:63`, `:80`)                                                                     | K5 (Erasmus+ Programme Guide) aynen: "two pre-defined lump sums grants : EUR 30 000 and EUR 60 000", "Between 6 and 24 months", "by 5 March at 12:00:00 (midday Brussels time)" |
| OKA: 2009'dan beri 15 proje, 57 milyon €'nun üzerinde (`OKA-KANAL-ONERISI.md:10`, `EPOSTA-TASLAKLARI.md:71`)                                                                | K6 (ka.gov.tr): "…2009 yılından itibaren … toplam 15 proje uygulayarak 57 Milyon €'nun üzerinde kaynağı…". İller Samsun, Amasya, Çorum, Tokat                                   |
| CERV: V10.0 – 01.08.2025; AB dışı katılımcılar Arnavutluk, Bosna-Hersek, Kosova, Moldova, Karadağ, Kuzey Makedonya, Sırbistan, Ukrayna; Türkiye yok (`ILKADIM-PILOT.md:62`) | K3 PDF'inin metni çıkarıldı: sürüm satırı aynı. "participates" diyen 8 ülke listeyle birebir aynı. "Türk" ve "Turkey" 0 eşleşme                                                 |
| LIFE: V10.0 – 01.03.2026; Türkiye yok (`ILKADIM-PILOT.md:65`, `OKA-KANAL-ONERISI.md:55`)                                                                                    | K8 PDF'i: sürüm satırı aynı. Katılımcılar Izlanda, Moldova, Kuzey Makedonya, Karadağ, Ukrayna. "Türk" ve "Turkey" 0 eşleşme                                                     |

- **İsim ve iletişim uydurulmamış:** e-posta ve telefon deseni 0 eşleşme. Bütün hitaplar yer tutucu (`EPOSTA-TASLAKLARI.md:20,43,69,96,113` `[Başkanın adı soyadı]` / `[Yetkili adı]`). Koltuk tablosunda kişi yok (`ILKADIM-PILOT.md:39`).
- **Patron fiyat onayı işlenmiş:** `ILKADIM-PILOT.md:115-127` "patron onaylı, 29.09.2026", 90/240/480 bin TL. KDV dahil hesaplar doğru (×1,20). Sınır sütunları doğru: 576.000 > 340.391.
- **Pazar yeri atfı yok:** `docs/kamu/*.md` ve iki `docs/legal` taslağında `pazar|marketplace|ilan|hakem|%12|premium|kent ortağı|§5.4` araması 0. M8 (ortak arama) atıfları ADR-0005'in "Kalanlar" maddesiyle uyumlu (`ILKADIM-PILOT.md:43,76`, `VERI-YERLESIMI.md:29`).

K bulguları:

- **K-1:** `ILKADIM-PILOT.md:117` "Amaç: KDV dahil tutar bile **en düşük** sınırın altında kalsın" cümlesi, aynı paragraftaki "Belediye Kurum … üstünde kalır" ve tablodaki **Üstünde** hücresiyle çelişiyor. Önerilen metin: "Amaç: her paket, önerildiği idarenin sınırının KDV dahil altında kalsın."
- **K-2:** Bölüm atıfları kaymış. `ILKADIM-PILOT.md:17` "(§5)" diyor, fiyat §6'da. `:18` "(§6 R4)" diyor, R4 §7'de (`:139`).
- **K-3:** K1 (Resmî Gazete) adresine TLS hatası nedeniyle erişilemediği yazılı (`:161`) ve patron teyidi `SUNUM-METNI.md:121`'de checklist'te. Bu doğru bir işaretleme. Sunumdan önce bu kutu işaretlenmeli.

## 4. TASK-MULQJZNB7U3QN (devop-fb, repo güvence) — ONAY, kart kapatılabilir

Önceki incelememin (`TASK-MULQLVLW21FE2-crw-fb.md`) açık üç maddesini HEAD üzerinde yeniden doğruladım. Hiçbir değer basılmadı. Yalnız uzunluk, md5 öneki (10 karakter) ve sayım kullanıldı.

**Ö-4 (gömülü NextAuth anahtarı) — KAPANDI.**

```
old fallback found: True len 51 md5 1af6d60b92      # c915bc43:src/lib/auth.ts'ten çıkarıldı
HEAD files containing old fallback: 0
worktree(tracked) files containing: 0
.env AUTH_SECRET len 44 md5 332e26b92c != old fallback   # yerel anahtar döndürülmüş
```

**K-9 (takvim anahtarı) — KAPANDI.** `.env CALENDAR_ENCRYPTION_KEY len 44 md5 8276960740`. Bu değer HEAD ağacında hiçbir dosyada yok, yani artık commitli fixture ile aynı değil. Yerel `.env`'deki ≥16 karakterlik 18 değerin tamamı HEAD'de arandı. Eşleşen 9 değerin hepsi sır değil: `NEXT_PUBLIC_APP_URL`, `REDIS_URL` (userinfo yok, localhost), `WORKER_URL`, `EMBEDDING_MODEL`, `SEDIA_*_URL`, `CORDIS_*_ZIP_URL`, `EMAIL_FROM`.

**Sağlayıcı desen taraması (HEAD, `git grep -c`):** `sk-ant`, OpenAI `sk-` (sınırlı, {40,}), `sk_live`, `rk_live`, `whsec_`, `AKIA`, `ghp_`, `github_pat_`, `xox*`, `AIza`, `GOCSPX-`, `PRIVATE KEY`, uzak postgres URL'si, `phc_`, `sntrys_` ve JWT desenlerinin hepsi **0**. Tek eşleşme `re_…` (Resend) deseninde çıktı: `.venv/lib/python3.9/site-packages/pip-21.2.4.dist-info/RECORD:652`. Bu bir pip RECORD özeti, yanlış pozitif. Yerel `RESEND_API_KEY` boş.

**K-8 (.gitignore) — KAPANDI.** `git check-ignore --no-index -v` sonuçları:

```
.gitignore:106:client_secret*.json   client_secret_123.apps.googleusercontent.com.json
.gitignore:106:client_secret*.json   sub/dir/client_secret_x.json
.gitignore:107:service-account*.json service-account-prod.json / deep/service-account.json
.gitignore:108:*.p12  key.p12   ·  .gitignore:109:*.key  certs/server.key  ·  .gitignore:25:*.pem  id.pem
.gitignore:34:.env*   .env / .env.local / .env.production
.gitignore:38:!.env.example   .env.example / apps/x/.env.example   (şablon izleniyor)
.gitignore:101:/AB Project SaaS/   AB Project SaaS/x.json
NOT-IGNORED  gcp-sa-key.json · credentials.json · .venv/pyvenv.cfg
```

`.env.example` izleniyor. İçindeki 22 sır adlı anahtardan yalnız ikisi yerel değerle aynı: `WORKER_TOKEN` (9 karakter) ve `SEDIA_API_KEY` (5 karakter). İkisi de yer tutucu ya da kamuya açık değer, gerçek sır değil.

K bulguları (kartı bloke etmez):

- **K-1:** `.venv/` hâlâ izleniyor. HEAD'de 5659 dosya var ve `.gitignore`'da `.venv` satırı yok. devop-fb raporu bunu ayrı kart olarak önermişti (`TASK-MULQJZNB7U3QN-devop-fb.md:106,118`). Kart açılıp açılmadığını doğrulayamadım. Açılmadıysa lider açmalı. Sır riski yok, ama bu dizin her sır taramasında yanlış pozitif üretiyor (yukarıdaki `re_` eşleşmesi gibi).
- **K-2:** `credentials.json` ve `*-sa-key.json` / `*sa*.json` gibi yaygın GCP adları kapsam dışında. İsteğe bağlı olarak eklenebilir.

## Kanıt: yöntem ve komutlar

- `npx prettier@3 --check docs/kamu docs/legal <4 rapor>` sonucu: `docs/kamu` ve incelenen iki taslak temiz. Uyarı veren 4 dosya incelenen kartlara ait değil: `dpa-en.md`, `dpa-tr.md` (`6f09c26c`, 08.09), `privacy-notice-gap-analysis.md` (`c07c71b7`), `processing-register.md` (`aa6a0fef`, ADR-0005 / fe-fb). Not: `pnpm prettier` bu repoda çalışmıyor ("Command prettier not found"), çünkü prettier bağımlılık olarak kurulu değil. Bu yüzden `npx prettier@3` kullanıldı.
- Kaynak doğrulama: K2, K5 ve K6 WebFetch ile okundu. K3 ve K8 PDF'lerinin içerik akışları zlib ile açılıp metinleri tarandı.
- Sır kontrolü: python + `git grep -F/-E` kullanıldı. Değerler yalnız md5 öneki ve sayı olarak raporlandı.

## Değişen dosyalar

- `docs/agent-results/TASK-MULVAF078OPDL-crw-fb.md` (bu rapor). Başka dosyaya dokunulmadı.

## Riskler

- Kart 1 Ö-1 ve Ö-2 düzeltilmeden ek hukuka giderse hukuk, olmayan bir veri akışını (il, program) değerlendirir.
- B1'in ek gösterilmeden canlıya çıkma riski var (Kart 1 "kapsam dışı" notu).

## Açık sorular

- `.venv` izleme kartı açıldı mı? (Kart 4 K-1)
- Görev metnindeki KANIT satırı sonuç yolunu `/Users/macbook/alan/docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md` olarak veriyor. Bu yol başka bir ajanın (cs-fb) başka bir kart için kullandığı dosya adı ve repo dışında. Kartın kendisi bu raporun yolunu açıkça veriyor, rapor o yola yazıldı. Başka ajanın adıyla dosya üretilmedi.

## Sonraki adım

1. cs-fb: Kart 1 B-1, Ö-1 ve Ö-2'yi düzeltsin; §18c'yi `processing-register.md`'ye taşısın. K'ler isteğe bağlı.
2. cs-fb: Kart 3 K-1 ve K-2 (iki satırlık metin düzeltmesi).
3. Lider: Kart 2, 3 ve 4'ü `done`'a alabilir. Kart 1'i düzeltmeden sonra yeniden incelemeye göndersin.

## Platform beyanı

İnceleme **macOS**'ta yapıldı (Darwin 27.0.0; git, python3, npx prettier@3). İncelenen değişiklikler yalnız Markdown belgeleri ve `.gitignore`. Platforma bağlı bir kod yolu yok. `.gitignore` desenleri git tarafından her platformda aynı yorumlanıyor. Tek fark şu: `core.ignorecase=true` iken (Windows ve macOS'ta varsayılan) `Client_Secret.json` gibi büyük harfli adlar da eşleşir. Linux'ta eşleşme büyük/küçük harfe duyarlıdır. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var ve sonuç platformdan bağımsız.
