# TASK-MTPZF8X1W8WCU — E10.3 KVKK/GDPR uyumu (2. tur)

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tarih:** 2026-09-08 · **Branch:** dev · **Commit:** `39dd472`

## Karar: KART KAPANAMAZ — 4 madde eksik

Bu turda iki gerçek kusur bulundu ve **kapatıldı**. Geriye kalan dördü kod kusuru değil:
üçü **hukuk metni kararı** (uydurulamaz), biri **şema migration'ı + saklama kararı** gerektiriyor.
Kanıtsız kapatmıyorum; eksikleri adıyla aşağıda listeliyorum.

Önceki tur (`TASK-MTPZF8X1W8WCU-ex-en.md`, 2026-09-07) çekirdek veri sahibi akışını ölçmüş ve
sağlam bulmuştu. **O bulgu bu turda da doğrulandı** (aşağıda 2.1). Bu tur, kartın adını andığı ama
geçen turda ölçülmemiş iki ekseni ele aldı: **imha gerçekten her yeri temizliyor mu** ve
**kişisel veri LLM'e gidiyor mu**.

---

## 1. Ne yapıldı

### G1 (P0 — KAPATILDI) · Tamamlanmış imhadan sonra silinen kişinin kimliği ve OAuth jetonu DB'de kalıyordu

Bu şemada **10 kolon** `User.id` taşıyor ama **foreign key'i yok**. `DELETE FROM "User"` hiçbirine
ulaşamaz. Purge işi bunlardan yalnız **ikisini** adıyla ele alıyordu (`Effort`, `AiUsageLog`);
kalan sekizi her tamamlanmış imhadan sağ çıkıyordu.

Canlı veritabanına karşı ölçüldü: purge `purgedCount: 1` ile **başarı raporladıktan sonra** özneye ait
`CalendarConnection`, `SavedSearch`, `Feedback`, `AuditEvent.actorId` ve `Opportunity.ownerId`
satırları hâlâ yerindeydi (2.2).

En ağırı `CalendarConnection`: Google/Outlook `accessToken` **ve** `refreshToken`'ı **açık metin**
tutuyor (şemanın kendi yorumu şifrelemeyi "TODO" diye işaretliyor, `prisma/schema.prisma:1140`).
Yani "unutulma hakkı"nı kullanmış bir kişinin **çalışır durumdaki üçüncü taraf takvim kimlik
bilgisi** veritabanında kalıyordu. Bu artık bir "kalıntı tanımlayıcı" meselesi değil, canlı bir
kimlik bilgisi sızıntısıdır.

Uygulanan ayrım — **öznenin kendi verisi silinir, kiracının verisi kalır, yalnız kişi bağı kopar**
(`AiUsageLog` için zaten verilmiş olan kararın aynısı):

| Kolon | FK | İşlem | Gerekçe |
|---|---|---|---|
| `CalendarConnection.userId` | yok | **DELETE** | öznenin kendi OAuth jetonları |
| `SavedSearch.userId` | yok | **DELETE** | öznenin kendi arama/bildirim tercihleri |
| `AuditEvent.actorId` | yok | **NULL** | iz kalsın, kimlik kalmasın |
| `Opportunity.ownerId` | yok | **NULL** | fırsat kiracınındır, silinmemeli |
| `Feedback.userId` | yok | **NULL** | hata kaydı kiracınındır |
| `ProposalUsage.usedByUserId` | yok | **NULL** | kullanım kaydı kiracınındır |
| `Effort.userId` | yok | DELETE | *(önceden vardı)* |
| `AiUsageLog.userId` | yok | NULL | *(önceden vardı)* |
| `Relationship.ownerUserId` | yok | **YAPILMADI** | `NOT NULL` — migration gerekir (madde A4) |
| `DualApprovalStep.actorUserId` | yok | **YAPILMADI** | `NOT NULL` + hukuki saklama kararı (madde A4) |

Bu, **önceki turun 1 numaralı açık maddesini de kapatıyor** (`actorId` imhadan sağ kalıyor).

### G2 (P1 — KAPATILDI) · Herkese açık DPA bağlantısı, var olmayan bir şirketi veri işleyen gösteren eski nüshayı sunuyordu

Depoda **iki** DPA vardı:

- `src/app/[locale]/dpa/page.tsx` — copy koda gömülü (CLAUDE.md §8 ihlali), veri işleyeni
  **"FonBridge"** olarak adlandırıyor (sayfada 6 kez). Bu ürünün artık taşımadığı bir ad.
- `src/app/[locale]/compliance/dpa/page.tsx` — `docs/legal/dpa-{tr,en}.md` dosyasını render ediyor;
  hukuki dayanak tablosu, alt işleyen kategorileri, 72 saatlik ihlal bildirimi, saklama/imha içeriyor.

**Herkese açık footer birincisine bağlanıyordu** (`PublicFooter.tsx:127` → `getPublicRoute('dpa')`
→ `/en/dpa`, TR'de `next.config.ts` rewrite'ı ile `/tr/dpa`). Bakımı yapılan nüsha yalnız
uygulama içinden (`settings/privacy/client.tsx:235`) erişilebiliyordu — yani sözleşmeyi imzalayacak
tarafın gördüğü metin, bakımı yapılmayan olandı.

Eski nüsha silindi; her iki eski URL de bakımı yapılan belgeye rewrite ediliyor (eski bağlantılar
kırılmadı).

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Çekirdek veri sahibi akışı hâlâ sağlam — ve testler gerçekten DB'ye vuruyor

Testlerin sessizce atlanmadığını kanıtlamak için ölü porta yönlendirdim (kontrol):

```
$ npx vitest run tests/gdpr-data-subject.live.test.ts          # gerçek Postgres
 Test Files  1 passed (1)
      Tests  14 passed (14)

$ DATABASE_URL="postgresql://fabrika:fabrika@localhost:59999/fabrika" npx vitest run ...
 Test Files  1 skipped (1)
      Tests  14 skipped (14)
```

Ölü DB'de **skip**, canlı DB'de **pass** → 14 test gerçekten üretim kod yolunu canlı Postgres'e
karşı koşuyor. Kapsam: dışa aktarma özneye kapsanmış, OAuth sırları sızmıyor, kiracı izolasyonu,
soft-delete geri alınabilir, purge gerçekten siliyor.

### 2.2 G1 — RED: purge "başarılı" dedikten sonra kalan satırlar (gerçek veri)

```
 × leaves no row still carrying the erased id in a column the database does not cascade
AssertionError: expected { calendarConnection: 1, …(4) } to deeply equal { calendarConnection: +0, …(4) }
- Expected                     + Received
-   "auditActor": 0,           +   "auditActor": 1,
-   "calendarConnection": 0,   +   "calendarConnection": 1,
-   "feedback": 0,             +   "feedback": 1,
-   "opportunityOwner": 0,     +   "opportunityOwner": 1,
-   "savedSearch": 0,          +   "savedSearch": 1,

 × no OAuth calendar credential of the erased subject survives
AssertionError: expected '[{"userId":"u-subj-b155339e","accessT…' not to contain 'SECRET_CALENDAR_ACCESS_TOKEN'
Received: "[{"userId":"u-subj-b155339e","accessToken":"SECRET_CALENDAR_ACCESS_TOKEN",
            "refreshToken":"SECRET_CALENDAR_REFRESH_TOKEN"}, …]"

 Test Files  1 failed (1)
      Tests  3 failed | 15 passed (18)
```

### 2.3 G1 — GREEN: düzeltmeden sonra

```
$ npx vitest run tests/gdpr-data-subject.live.test.ts
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

### 2.4 Yıkıcı bir işte güvenlik ağı gerçekten ısırıyor mu (mutasyon denemesi)

Purge tüm veritabanını tarar; kapsamı kaçırılmış bir `deleteMany` tabloyu **tüm platform için**
boşaltır. Bunu kasıtlı olarak yaptım:

```
# MUTASYON: userId kapsamını sil
-  await prisma.calendarConnection.deleteMany({ where: { userId } });
+  await prisma.calendarConnection.deleteMany({});

 × the neighbour keeps every row of the same kind
      Tests  1 failed | 17 passed (18)

--- geri alındı ---
65:      await prisma.calendarConnection.deleteMany({ where: { userId } });
```

Yani "komşu el değmemiş" testi gerçek bir aşırı-silmeyi yakalıyor; yeşil koşu tesadüf değil.

### 2.5 FK haritası — iddianın kaynağı (canlı `information_schema` sorgusu)

```
=== FKs referencing "User" ===
CASCADE    Account.userId          CASCADE    Membership.userId
CASCADE    ApprovalRequest.requesterId   CASCADE    Reviewer.userId
CASCADE    Session.userId
SET NULL   ApprovalRequest.approverId    SET NULL   Evaluation.userId

=== user-ish columns with NO foreign key (survive erasure silently) ===
AiUsageLog.userId          AuditEvent.actorId         CalendarConnection.userId
DualApprovalStep.actorUserId   Effort.userId          Feedback.userId
Opportunity.ownerId        ProposalUsage.usedByUserId Relationship.ownerUserId
SavedSearch.userId
```

### 2.6 G2 — DPA yönlendirmesi, öncesi ve sonrası (canlı HTTP)

```
# ÖNCE — herkese açık rota eski nüshayı sunuyor
/en/dpa                    -> 200 | h1='Data Processing Agreement (DPA)'   | FonBridge=1  (sayfa gövdesinde 6)
/tr/veri-isleme-sozlesmesi -> 200 | h1='Veri İşleme Sözleşmesi (DPA Şablonu)'
/tr/compliance/dpa         -> 200 | h1='Veri İşleme Sözleşmesi (DPA)'      <- bakımı yapılan

# SONRA — üçü de bakımı yapılan belgeye çözülüyor
/tr/veri-isleme-sozlesmesi -> 200 | h1='Veri İşleme Sözleşmesi (DPA)'
/tr/dpa                    -> 200 | h1='Veri İşleme Sözleşmesi (DPA)'
/en/dpa                    -> 200 | h1='Data Processing Agreement (DPA)'

# /en/dpa gerçekten yeni belge mi (içerik imzası):
docs/legal/dpa-en.md işaretleri:  "72 hours"=1  "Legal basis"=1  "Sub-processor"=1  "Version 1.0"=1
SİLİNEN sayfanın işaretleri:      "TLS 1.3"=0   "AES-256"=0      "Article 3"=0
```

Ekran görüntüsü: `docs/agent-results/TASK-MTPZF8X1W8WCU-screenshots/01-public-dpa-now-maintained-tr.png`
— herkese açık TR URL'i artık "Sürüm 1.0 — Yürürlük tarihi: 2026-09-06" ve veri işleyen olarak
**Fabrika** yazıyor.

### 2.7 Kişisel veri LLM'e gidiyor mu (kartın sorusu, CLAUDE.md §5)

Ölçüm — **evet gidiyor, ve bir yol tamamen kayıtsız**:

| Yol | Ne gidiyor | Sağlayıcı | `AiUsageLog` |
|---|---|---|---|
| `src/modules/m9/server/actions.ts:40` | `partnerName` (kullanıcının yazdığı gerçek kişi/kurum adı) | Anthropic | ✅ yazılıyor |
| `src/modules/m2/m6/m7/m10` | fırsat/konu başlıkları — kişisel veri değil | Anthropic | ✅ yazılıyor |
| `src/lib/ai/rag.ts:42` | **yüklenen belgenin tam metni**, 1000'lik parçalar hâlinde | OpenAI embeddings | ❌ **0 satır** |
| `src/lib/rag.ts` | sorgu + parça metni | OpenAI | ❌ **0 satır** |

```
$ for f in src/lib/ai/rag.ts src/lib/rag.ts; do echo "$f aiUsageLog=$(grep -c 'aiUsageLog' $f)"; done
src/lib/ai/rag.ts aiUsageLog=0
src/lib/rag.ts aiUsageLog=0
```

CLAUDE.md §5 "**Tüm** LLM çağrıları `llm.ts` üzerinden; her çağrı `AiUsageLog` yazar" diyor.
RAG yolu bu tıkacı tamamen atlıyor: kiracı ataması yok, `promptHash` yok, kredi düşmüyor,
**işleme faaliyeti kaydı yok**. Bu hem mimari ihlal hem de GDPR md.30 (işleme faaliyeti kayıtları)
açığı. Rota canlı: `src/app/api/admin/documents/upload/route.ts:2 → processPdfAndStore`.

**Eğitim yasağı tarafı temiz:** `docs/legal/dpa-tr.md:5. bölüm` — "Yapay zeka çağrılarında müşteri
verisi model eğitimi için kullanılmaz" — açıkça beyan edilmiş. `AiUsageLog` ham istem değil
`promptHash` tutuyor (`prisma/schema.prisma:991`); yani veri ikinci kez kopyalanmıyor. Bu tasarım doğru.

### 2.8 Aydınlatma metinleri iki dilde mi (kartın sorusu)

**Evet** — ve kodda gömülü değil, i18n'den geliyor (geçen turda düzeltilmişti, bu turda korunduğu doğrulandı):

```
messages/tr.json legal.privacy anahtarları: metaTitle,metaDescription,heading,controllerHeading,
  controllerBody,dataHeading,dataBody,rightsHeading,rightsBody,rightsLink,securityHeading,securityBody
messages/en.json legal.privacy anahtarları: (aynı 12 anahtar — birebir eşleşiyor)

/tr/privacy            -> 200  h1='Gizlilik Politikası ve KVKK Aydınlatma Metni'
/en/privacy            -> 200  h1='Privacy Policy &amp; GDPR Disclosure'
/tr/gizlilik-politikasi-> 200  (TR SEO takma yolu çözülüyor)
```

Ama **içerik eksik** — bkz. madde A1/A2 aşağıda. "İki dilde mi" sorusu evet, "yeterli mi" sorusu hayır.

### 2.9 Kapı

```
$ npx tsc --noEmit -p tsconfig.json
src/lib/billing/plan-repository.ts(142,27): error TS18046: 'assignments' is of type 'unknown'.
tests/plan-visibility-rls.spec.ts(165,25): error TS2347: Untyped function calls may not accept type arguments.
```
**İkisi de benim değil** — `plan-repository.ts` şu anda BAŞKA bir ajan tarafından commit'lenmemiş
olarak düzenleniyor (`git diff --stat HEAD` → 16 ekleme, benim dokunmadığım dosya).
Pre-commit kancası bunu bağımsız olarak doğruladı:

```
⚠ Ağaçta senin OLMAYAN typecheck hataları var (başka bir ajan yazıyor olabilir):
src/lib/billing/plan-repository.ts(142,27): ...
tests/plan-visibility-rls.spec.ts(165,25): ...
  Bunlar commit'ini engellemiyor.
✓ Kapı temiz (staged kapsamı).
```

Üçüncü bir hata (`.next/types/validator.ts` → silinen dpa sayfası) **bayat üretilmiş artefakttı**;
`.next` gitignore'lu, dosya silinip yeniden üretilince hata kayboldu.

```
$ npx eslint <benim 4 dosyam>
(çıktı yok — temiz)

$ npx vitest run
 Test Files  101 passed | 2 skipped (103)
      Tests  1182 passed | 8 skipped (1190)
```
Tam takım **yeşil, 0 kırmızı**. (Ara aşamada `tests/users-scheduled-deletion.test.ts` benim
değişikliğim yüzünden 4 kırmızı verdi — mock'ta yeni modeller yoktu. Testi gevşetmeden mock'u
genişlettim ve **kapsamı doğrulayan yeni bir test ekledim**: her `deleteMany`/`updateMany`
çağrısının tek özneye kapsandığını iddia ediyor.)

---

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/inngest/jobs/users-scheduled-deletion.ts` | kaskad edilmeyen 6 kolonun imhası (+28) |
| `next.config.ts` | `/tr\|/en dpa` → bakımı yapılan `/compliance/dpa` rewrite'ı (+9/−1) |
| `src/app/[locale]/dpa/page.tsx` | **silindi** — eski, "FonBridge" adlı nüsha (−57) |
| `tests/gdpr-data-subject.live.test.ts` | 4 yeni canlı test + kalıntı fixture'ı (+103) |
| `tests/users-scheduled-deletion.test.ts` | mock genişletildi + kapsam testi (+40/−3) |

Commit: `39dd472 fix(gdpr): let erasure reach the rows no foreign key cascades`

---

## 4. Riskler

- **Purge artık daha fazla tabloya yazıyor.** Her ifade tek `userId`'ye kapsanmış ve bunu bir
  mutasyon denemesiyle (2.4) + "komşu el değmemiş" testiyle kanıtladım. Yine de bu iş bütün
  veritabanını tarar; canlı testin kendi ektiği satır dışında bir satır "vadesi dolmuş" ise
  **koşmayı reddeden koruma** yerinde duruyor.
- `AuditEvent.actorId` artık NULL'lanıyor. Denetim olayı **kalıyor**, yalnız fail bağı kopuyor.
  Bir kiracı "bu değişikliği kim yaptı" diye sorarsa, silinmiş kullanıcı için cevap artık
  "silinmiş bir kullanıcı" olacak. Bu bilinçli takas — GDPR md.17 karşısında doğru olan bu.
- DPA rewrite'ları `next.config.ts`'te; eski `/dpa` URL'i kırılmadı ama artık **farklı bir metin**
  sunuyor. Metin daha kapsamlı, ama bu yayınlanmış bir sözleşme değişikliğidir — hukukun haberi olmalı.

---

## 5. Açık sorular / kartı KAPATMAYA ENGEL maddeler

Sırayla. **A1–A3 hukuk metni kararıdır; uydurmadım ve uydurmamalıyım** — bu depoda şu anda
"uydurma kimlik dizeleri" temizleyen başka kartlar var (TASK-MTRNQHC3IV2BE), bir aydınlatma metnine
hayali bir tüzel kişilik/adres yazmak tam olarak o hatanın hukuki versiyonu olurdu.

**A1 (P0 — kapatılmadan kart kapanamaz) · Aydınlatma metni KVKK md.10'un zorunlu unsurlarını taşımıyor.**
`messages/{tr,en}.json → legal.privacy` içinde şunlar **yok**:
  - **hukuki sebep** (KVKK md.10/ç, GDPR md.13(1)(c)) — hiçbir işleme için belirtilmemiş.
    *Not: bu bilgi depoda zaten var* — `docs/legal/dpa-tr.md` §3 tam bir hukuki dayanak tablosu
    taşıyor (md.5/2-c, 5/2-f, 5/2-ç). Aydınlatma metnine taşınabilir, ama hangi metnin bağlayıcı
    olduğu hukukun kararı.
  - **saklama süresi** — hiç yok. Üstelik `metaDescription` "saklama süreleri" içerdiğini **iddia
    ediyor**; gövde bunu karşılamıyor. Bu tek başına yanıltıcı beyandır.
  - **aktarım alıcıları** (KVKK md.10/c) — metin alıcı saymıyor.
  - **yurt dışına aktarım + güvence** (GDPR md.13(1)(f), KVKK md.9) — Anthropic ve OpenAI ABD'de
    ve 2.7'de kanıtlandığı gibi **içerik alıyorlar**. Metnin "4. Güvenlik ve Depolama" bölümü
    verinin kendi Postgres/R2'lerinde durduğunu ima ediyor; bu **maddi bir eksiklik**.
  - **Kurula şikâyet / denetim makamına başvuru hakkı** (KVKK md.11/ğ, GDPR md.13(2)(d)) — yok.
  - **md.11'deki diğer haklar** — metin yalnız dışa aktarma ve silmeyi sayıyor.

**A2 (P0) · Veri sorumlusunun kimliği belirsiz.** Metin "Fabrika SaaS Platformu" diyor —
tüzel kişilik adı, adres, KEP/e-posta, başvuru kanalı yok. KVKK md.10/a bunu ve
*Veri Sorumlusuna Başvuru Usul ve Esasları Tebliği* başvuru kanalını zorunlu kılıyor.
**Bu bilgiyi iş tarafı vermeli.**

**A3 (P1) · Rıza/aydınlatma kaydı hiç tutulmuyor.** Şemada `Consent` benzeri **hiçbir model yok**
(`grep -c "Consent" prisma/schema.prisma` → **0**). Kayıt formunda da onay/aydınlatma adımı yok:
`/tr/kayit` sayfasındaki tek KVKK bağlantısı **site footer'ından** geliyor (`PublicFooter.tsx:117`),
formun kendisinde değil. Yani platform, bir veri sahibinin **ne zaman ve hangi metinle
bilgilendirildiğini gösteremez** (GDPR md.7(1) / md.5(2) hesap verebilirlik).
Tablo + migration + ürün kararı gerektiriyor.

**A4 (P1) · İki kolon hâlâ imhadan sağ çıkıyor — migration gerekiyor.**
`Relationship.ownerUserId` ve `DualApprovalStep.actorUserId` **`NOT NULL`**, bu yüzden
purge içinde güvenle koparılamıyorlar. Ayrıca `DualApprovalStep` **`actorName` — gerçek bir kişi
adı** da tutuyor (`prisma/schema.prisma:1189`) ve bu bir dokümanı kimin onayladığının kaydı;
GDPR md.17(3) kapsamında saklanması **meşru olabilir**. Karar hukuk + ürünün:
(a) kolonları nullable yap ve kopar, ya da (b) saklamayı hukuki yükümlülük olarak belgele.
**Kendiliğinden seçilecek bir şey değil, o yüzden dokunmadım.**

### Bu karta ait olmayan, ADIYLA bildirdiğim kusurlar (düzeltmedim)

1. **(P1) RAG yolu `AiUsageLog` yazmıyor** — 2.7. `src/lib/ai/rag.ts` ve `src/lib/rag.ts` yüklenen
   belge metnini OpenAI'a gönderiyor, sıfır kayıt bırakıyor. CLAUDE.md §5 ihlali + GDPR md.30 açığı.
   Ayrıca **iki paralel LLM adaptörü** var (`src/lib/llm.ts` ve `src/lib/ai/llm.ts`) — CLAUDE.md
   "tek giriş noktası" kuralına aykırı. Sahibi: YZ/altyapı ekibi.
2. **(P2) CLAUDE.md'nin tarif ettiği mimari mevcut değil.** `src/core/` dizini **hiç yok**;
   §5'in işaret ettiği `src/core/k6-ai/llm.ts` ve `src/core/k6-ai/prompts/*.md` yok — istemler
   modül dosyalarına gömülü string. `src/core/events` / `src/core/contracts` de yok.
   Ya CLAUDE.md ya kod yanlış; `docs/ROADMAP.md` "Açık kararlar"a yazılmalı.
3. **(P2) `process.env` doğrudan okunuyor** — `src/lib/ai/llm.ts:6` ve `src/lib/rag.ts:46`
   `process.env.{ANTHROPIC,OPENAI}_API_KEY` okuyor; CLAUDE.md "Yapma" listesi `src/lib/env.ts`
   kullanılmasını şart koşuyor.
4. **(P2) "FonBridge" ürün adı hâlâ 17+ yerde** — giriş kartı, admin düzeni, kullanım koşulları
   (`terms/page.tsx:55`), landing, ve **kullanıcıya görünen i18n dizeleri**
   ("Secured by FonBridge SaaS", doküman altbilgisi). Ben yalnız DPA'daki hukuki nüshayı kapattım.
5. **(P2) `src/app/[locale]/terms/page.tsx` copy'si koda gömülü** (`isTr ? … : …`) — CLAUDE.md §8
   ihlali; privacy ve dpa için düzeltilen desenin aynısı, terms'te duruyor.
6. **(P3) Önceki turun 2. ve 3. maddeleri hâlâ açık:** `docs/SECURITY_COMPLIANCE.md:101` var olmayan
   bir "herkese açık silme isteği formu" vaat ediyor; `cancelAccountDeletion` `deletionReason`'a
   bakmıyor (`request-deletion.ts:126-129`).
7. **(P3) `pnpm gate` bu ağaçta koşturulamadı** — depo `pnpm` komutlarını tarif ediyor ama tree'de
   şu anda **başka ajanların commit'lenmemiş düzenlemeleri ve untracked `scripts/_tmp-cs/`** var.
   İzole worktree açma iznim reddedildi, o yüzden kapıyı doğrudan koştum ve hataların sahipliğini
   `git diff` + pre-commit kancasının kendi çıktısıyla ayrıştırdım (2.9).

---

## 6. Sonraki adım

1. **A1 + A2 birlikte** — hukuk, aydınlatma metnini tamamlasın (hukuki sebep, saklama, alıcılar,
   yurt dışı aktarım, şikâyet hakkı, veri sorumlusu kimliği/başvuru kanalı). Metin `legal.privacy`
   anahtarlarına yazılır, kod değişikliği gerekmez — altyapı hazır.
2. **A4** — `Relationship` ve `DualApprovalStep` için saklama kararı, sonra migration.
3. **A3** — `Consent` tablosu + kayıt akışına aydınlatma onayı.
4. Bunlardan bağımsız: RAG yolunu `AiUsageLog` tıkacına bağla (madde 1) — bu kartın değil,
   ama açıkta duran en büyük uyum açığı.

**Kart bu haliyle `review`'da kalmalı.** Kod tarafındaki iki kusur kapandı ve kanıtlandı;
kalan dört madde kod değil karar bekliyor.
