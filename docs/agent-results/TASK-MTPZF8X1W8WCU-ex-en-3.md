# TASK-MTPZF8X1W8WCU — E10.3 KVKK/GDPR (3. tur): açık maddelerin yeniden doğrulanması + A4 karar brifingi

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tarih:** 2026-09-08 · **Branch:** dev
**Önceki turlar:** `TASK-MTPZF8X1W8WCU-ex-en.md` (1. tur), `TASK-MTPZF8X1W8WCU-ex-en-2.md` (2. tur)

## Karar: KART HÂLÂ KAPANAMAZ — 4 madde açık, ama biri artık karara hazır

Bu tur **yeni kod yazmadı**. İki iş yaptı:
1. 2. turun dört açık maddesini bugünkü koda karşı **yeniden ölçtü** (rapor eskimiş olabilirdi —
   o turdan bu yana `0ac06a0`, `1af95e4`, `d78b5c7` dahil çok sayıda commit indi).
2. **A4'ü karara hazır hale getirdi**: iki kolonun aynı vaka olmadığını gösterdi ve 1-3-1 brifingi yazdı.

---

## 1. Yeniden doğrulama — dördü de hâlâ geçerli (bugün ölçüldü)

| Madde | 2. turdaki iddia | Bugünkü ölçüm | Durum |
|---|---|---|---|
| A1 | Aydınlatma metni KVKK md.10 unsurlarını taşımıyor | aşağıda §1.1 | **geçerli** |
| A2 | Veri sorumlusunun kimliği belirsiz | `controllerBody` = "Fabrika SaaS Platformu olarak…" — tüzel kişilik/adres/başvuru kanalı yok | **geçerli** |
| A3 | Rıza/aydınlatma kaydı yok | `grep -c "Consent" prisma/schema.prisma` → **0**; `model Consent` yok | **geçerli** |
| A4 | İki kolon imhadan sağ çıkıyor | `Relationship.ownerUserId` ve `DualApprovalStep.actorUserId` hâlâ `String` (NOT NULL) | **geçerli** |

### 1.1 A1 — metnin tamamı okundu, eksikler kalem kalem

`messages/tr.json → legal.privacy` 12 anahtar taşıyor: `metaTitle, metaDescription, heading,
controllerHeading, controllerBody, dataHeading, dataBody, rightsHeading, rightsBody, rightsLink,
securityHeading, securityBody`. EN birebir aynı 12 anahtar. Gövdenin tamamı okundu:

- **hukuki sebep** — YOK. Hiçbir işleme için belirtilmemiş.
- **saklama süresi** — YOK. Gövdedeki tek saklama bilgisi silme takvimi ("30 gün sonra kalıcı
  olarak silinir"); genel saklama süresi yok. **Ama `metaDescription` "saklama süreleri"
  içerdiğini açıkça iddia ediyor.** Bu tek başına yanıltıcı beyandır ve hâlâ canlı.
- **aktarım alıcıları** — YOK. (Metinde geçen "dışa aktarabilirsiniz" *kullanıcının kendi
  dışa aktarımı*; alıcı listesi değil. İlk taramamda bu bir yanlış-pozitif verdi, tam metni
  okuyunca düzeltildi.)
- **yurt dışına aktarım** — YOK, **ve metin aksini ima ediyor**: `securityBody` verinin
  "çok kiracılı veritabanında … R2/S3 üzerinde" durduğunu söylüyor. 2. tur §2.7'de ölçüldüğü gibi
  içerik Anthropic ve OpenAI'a (ABD) gidiyor. Bu maddi bir eksiklik ve **herkese açık sayfada duruyor**.
- **Kurula şikâyet / denetim makamına başvuru hakkı** — YOK.

### 1.2 2. turun risk çerçevesinde ESKİYEN bir nokta (düzeltme)

2. tur `CalendarConnection.accessToken`/`refreshToken` için "**açık metin**… çalışır durumdaki
üçüncü taraf kimlik bilgisi" dedi. **Bu çerçeve artık geçerli değil** ve olduğu gibi
tekrarlanmamalı:

- Şema yorumu bugün şöyle: `accessToken String? // Plaintext. Column is unpopulated today — no
  OAuth writer exists yet` (`prisma/schema.prisma:1164`) — yani kolon **boş**.
- Ayrıca `src/lib/db.ts` içindeki `withCalendarTokenGate` Prisma extension'ı her
  `create/update/updateMany/upsert`'te `assertEnvelopedOrNull` çağırıyor
  (`src/lib/calendar/token-envelope.ts:25`), yani şifrelenmemiş bir jeton yazma denemesi
  **veritabanına ulaşmadan** patlıyor.

İmhanın bu satırları silmesi (2. turda yapıldı) doğru ve yerinde duruyor; ama artık "canlı kimlik
bilgisi sızıntısı" değil, "boş kolonun temizliği" olarak raporlanmalı. Kanıtsız alarm da kanıtsız
"bitti" kadar zararlı.

### 1.3 Kart dışı bildirilen kusurlar — hangileri hâlâ açık

| # | Kusur | Bugünkü ölçüm | Durum |
|---|---|---|---|
| 1 | RAG yolu `AiUsageLog` yazmıyor | `src/lib/ai/rag.ts aiUsageLog=0`, `src/lib/rag.ts aiUsageLog=0` | **açık** |
| 4 | "FonBridge" artık adı taşınmayan ürün adı | **40 dosya** (2. turda "17+") — `messages/{tr,en}.json:926` "Secured by FonBridge SaaS", `:1007` üretilen doküman altbilgisi | **açık, büyümüş** |

`:1007` özellikle önemli: bu, **müşterinin dışarıya gönderdiği üretilmiş dokümanın altbilgisi**.
Kozmetik bir artık değil, yanlış şirket adı taşıyan bir çıktı.

---

## 2. A4 — KARAR BRİFİNGİ (1-3-1)

### Yeni bulgu: bu iki kolon AYNI VAKA DEĞİL

2. tur ikisini tek maddede topladı. Ölçünce ayrıldılar:

**`DualApprovalStep.actorUserId`** — bir **imza kaydı**.
- Şemanın kendi yorumu niyeti yazıyor (`prisma/schema.prisma:1207`):
  *"`actorUserId` is deliberately not a foreign key: an approval is a signature, and the record
  must outlive a change to the user row that made it."*
- Dört-göz kuralı bu id'ye dayanıyor: `@@unique([followupDocId, actorUserId])` — "bir kişi en fazla
  bir departmanı imzalar".
- **Aynı satırda `actorName` var ve kullanıcıya GÖSTERİLİYOR:**
  `src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx:427` →
  `{formatDateTime(entry.timestamp)} · {entry.department} · {entry.actorName}`.

**`Relationship.ownerUserId`** — bir **iş ataması** ("internal focal point").
- Dış taraf zaten ayrı kolonlarda: `counterpartName`, `counterpartEmail`.
- İmza/kayıt niteliği yok, hiçbir kural buna dayanmıyor. Yalnız `@@index([tenantId, ownerUserId])`.

### Problem
Silinen bir kişinin kimliği, `NOT NULL` olduğu için imhadan sağ çıkan iki kolonda kalıyor ve bunun
meşru saklama mı yoksa kusur mu olduğu karara bağlanmamış.

### Seçenekler

**A — İkisini de nullable yap, imhada kopar.**
- *Artı:* tek kural; purge mantığı basit kalır; "uniform erasure" anlatması kolay.
- *Eksi:* `DualApprovalStep` için **işe yaramaz**. `actorName` aynı satırda kalır ve ekranda
  görünmeye devam eder. Yalnız id'yi koparmak uyumu **görüntüde** sağlar: sahte güvence.
  Ayrıca Postgres'te NULL'lar unique index'te birbirinden ayrı sayıldığı için dört-göz kuralı
  o satırlar için sessizce devre dışı kalır.

**B — İkisini de sakla, GDPR md.17(3) hukuki yükümlülük olarak belgele.**
- *Artı:* imza kaydının bütünlüğü korunur; migration gerekmez.
- *Eksi:* `Relationship.ownerUserId` için savunulamaz — bir iş atamasını imhadan muaf tutmanın
  hukuki gerekçesi yok.

**C — Ayır: farklı vakalar olduğu için farklı karar.**
- `Relationship.ownerUserId` → nullable yap + imhada kopar (veya kiracının aktif bir kullanıcısına devret).
- `DualApprovalStep` → **saklanır**; ama `actorUserId` *ve* `actorName` **birlikte**, saklama
  kaydında ve aydınlatma metninde **adıyla beyan edilerek** (A1'in "saklama süresi" boşluğuyla
  aynı yerde çözülür).
- *Artı:* her kolon kendi gerekçesine göre karara bağlanır; yarım imha kalmaz; ekrandaki ad
  beyan edilmiş bir saklamaya dayanır.
- *Eksi:* iki ayrı migration/karar; tek kural yerine iki kural.

### Öneri: **C**
Gerekçe ölçüme dayanıyor: `DualApprovalStep` için niyet şemada yazılı ve bir bütünlük kuralı bu
id'ye bağlı; `Relationship`'te böyle bir gerekçe yok. A'yı ikisine birden uygulamak,
`DualApprovalStep`'te adı ekranda bırakıp id'yi koparmak olurdu — uyum görüntüsü üreten,
gerçek koruma sağlamayan en kötü sonuç.

**Karar hukukun/ürünün.** Ben iki vakayı ayırdım ve A'nın neden `DualApprovalStep` için sahte
çözüm olduğunu ölçtüm; saklama kararını vermedim ve veremem.

### Karar "C" ise Definition of Done
- [ ] `Relationship.ownerUserId` nullable migration + RLS/şema dokümanı güncel (`docs/DATA_MODEL.md`)
- [ ] Purge işi `Relationship.ownerUserId`'yi NULL'lıyor; **komşu satır el değmemiş** testi var
- [ ] `DualApprovalStep` saklaması `docs/legal/` saklama kaydında adıyla yazılı (`actorUserId` **ve** `actorName`)
- [ ] Aydınlatma metni (`legal.privacy`) bu saklamayı beyan ediyor — A1 ile aynı PR'da
- [ ] `tests/gdpr-data-subject.live.test.ts` her iki davranışı da canlı DB'ye karşı iddia ediyor
- [ ] Purge sonrası hiçbir kolonda özneye ait **ad** kalmadığı ayrıca ölçüldü (id yeterli değil)

---

## 3. Kanıt (kopyalanmış gerçek çıktı)

```
$ grep -c "Consent" prisma/schema.prisma
0

$ grep -n "ownerUserId\|actorUserId\|actorName" prisma/schema.prisma
965:  ownerUserId    String   // internal focal point
1207:/// `actorUserId` is deliberately not a foreign key: an approval is a signature, and
1215:  actorUserId   String
1216:  actorName     String
1221:  @@unique([followupDocId, actorUserId])

$ grep -rn "actorName" src/ | grep client.tsx
src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx:427:
  {formatDateTime(entry.timestamp)} · {entry.department} · {entry.actorName}

$ for f in src/lib/ai/rag.ts src/lib/rag.ts; do echo "$f aiUsageLog=$(grep -c 'aiUsageLog' $f)"; done
src/lib/ai/rag.ts aiUsageLog=0
src/lib/rag.ts aiUsageLog=0

$ grep -rl "FonBridge" --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md' src messages docs | wc -l
40
$ grep -rn "FonBridge" --include='*.json' messages/
messages/tr.json:926:    "footer": "Secured by FonBridge SaaS — Horizon Europe Engine"
messages/tr.json:1007:   "footer": "FonBridge — Ufuk Avrupa & TÜBİTAK doküman üretim motoru | Sayfa 1 / 1",
messages/en.json:926:    "footer": "Secured by FonBridge SaaS — Horizon Europe Engine"
messages/en.json:1007:   "footer": "FonBridge — Horizon Europe & TÜBİTAK document engine | Page 1 / 1",

$ sed -n '1164p' prisma/schema.prisma
  accessToken       String?   // Plaintext. Column is unpopulated today — no OAuth writer exists yet
```

`legal.privacy` gövdesinin tamamı §1.1'de okundu ve kalem kalem eşleştirildi.

---

## 4. Değişen dosyalar

Bu tur **kod değiştirmedi** — yeniden doğrulama + karar brifingi turudur.

| Dosya | Değişiklik |
|---|---|
| `docs/agent-results/TASK-MTPZF8X1W8WCU-ex-en-3.md` | bu rapor |

Açık maddeler board'a kart olarak açıldı (§6).

---

## 5. Riskler

- **Yanıltıcı beyan canlıda duruyor.** `metaDescription` "saklama süreleri" vaat ediyor, gövde
  vermiyor; `securityBody` verinin kendi altyapılarında durduğunu ima ediyor, oysa içerik ABD'deki
  iki sağlayıcıya gidiyor. İkisi de **herkese açık sayfada**. A1 kapanana kadar bu risk açık.
- **Üretilen dokümanların altbilgisi yanlış şirket adı taşıyor** (`messages/*.json:1007`).
  Müşterinin dışarıya gönderdiği çıktı; kozmetik değil.
- **A4'te yanlış seçenek seçilirse zarar sessiz olur.** A seçilirse `DualApprovalStep` "imha
  edildi" görünür ama kişinin adı ekranda kalır — kimse fark etmez, çünkü test id'ye bakar.
  Bu yüzden DoD'a "ad kalmadığı ayrıca ölçüldü" maddesini koydum.

---

## 6. Açık sorular

1. **A1 + A2 hukuk metni** — hukuki sebep, saklama süreleri, alıcılar, yurt dışına aktarım +
   güvence, şikâyet hakkı; veri sorumlusunun tüzel kişilik adı/adres/başvuru kanalı.
   **Uydurulamaz, iş/hukuk tarafı vermeli.** Altyapı hazır: metin `legal.privacy` anahtarlarına
   yazılır, kod değişikliği gerekmez.
2. **A3 `Consent`** — tablo + kayıt akışına aydınlatma onayı; ürün kararı gerektiriyor
   (onay ayrı adım mı, kayıt butonuna gömülü beyan mı).
3. **A4** — yukarıdaki brifing; hukuk C'yi onaylıyor mu?
4. **Kart dışı ama en büyük canlı açık:** RAG yolu `AiUsageLog` yazmıyor (GDPR md.30). Sahibi
   YZ/altyapı ekibi.
5. `docs/SECURITY_COMPLIANCE.md:101` hâlâ var olmayan bir "herkese açık silme isteği formu"
   vaat ediyor mu? (1. turdan kalan P3; bu turda yeniden ölçülmedi.)

---

## 7. Sonraki adım

Kart `review`'da kalır. Açılan kartlar (§6 maddeleri sırasıyla) hukuk/ürün cevabını bekliyor.
A4 için cevap geldiği anda migration + test tek PR'da yapılabilir — brifingdeki DoD hazır.
