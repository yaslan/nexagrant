# TASK-MTR60M5ESB5PZ — M10 çift onay denetim kaydına uydurma kişi adı yazıyordu

**Ajan:** customer-support (CS-EN) · **Sprint:** SPRINT-S12 · **Branch:** `dev`
**Durum:** kapatıldı — birim, sunucu-eylemi ve gerçek tarayıcı seviyesinde doğrulandı

Commit'ler: `0139656` (düzeltme) · `04e6f60` · `4ee47c4` · `f983154` · `6053289` · `543d9d2` (testler + kanıt)

---

## 1. Ne yapıldı

### Sorunun tam hâli
İki yerde, çağıran kimse adını vermediğinde **gerçek bir kişinin adı** onay kaydına imza gibi yazılıyordu:

```ts
// src/modules/m10/server/actions.ts:153
export async function submitDualApprovalAction(docId: string, actorName: string = 'Dr. Mehmet Yılmaz')

// src/lib/dual-approval.ts:44
export function submitForDualApproval(docId: string, submittedBy: string = 'Dr. Mehmet Yılmaz')
```

Bu değer doğrudan `auditTrail[].actorName`, `submittedBy`, `financeApprover` ve `legalApprover`
alanlarına gidiyordu. Kimlik taşımayan bir çağrı, belgeyi hiç görmemiş bir kişinin adıyla
imzalanmış bir onay kaydı üretiyordu. Denetim kaydı bir imzadır: ya bilinen bir aktörle
üretilir ya da hiç üretilmez.

### Yapılan değişiklik

| Yer | Önce | Sonra |
|---|---|---|
| `dual-approval.ts` `submitForDualApproval` | `submittedBy: string = <gerçek bir kişi adı>` | `actor: ApprovalActor` — varsayılan YOK |
| `dual-approval.ts` `approveByDepartment` / `rejectDualApproval` | `actorName: string` | `actor: ApprovalActor` |
| `dual-approval.ts` `AuditLogRecord` | yalnız `actorName` | `actorName` **+ `actorUserId`** |
| `dual-approval.ts` `DualApprovalState` | `submittedBy`, `financeApprover`, `legalApprover` | + `submittedByUserId`, `financeApproverUserId`, `legalApproverUserId` |
| `m10/server/actions.ts` `submitDualApprovalAction` | `(docId, actorName = <ad>)` | `(docId)` — aktör YALNIZ oturumdan |
| `m10/server/actions.ts` `departmentApproveAction` | `(state, dept, actorName, note?)` | `(state, dept, note?)` |

Yeni tipler ve kural (`src/lib/dual-approval.ts`):

```ts
export interface ApprovalActor { userId: string; displayName: string }
export class MissingApprovalActorError extends Error { readonly code = 'APPROVAL_ACTOR_REQUIRED' }

function requireActor(actor: ApprovalActor | null | undefined): ApprovalActor {
  const userId = actor?.userId?.trim();
  const displayName = actor?.displayName?.trim();
  if (!userId || !displayName) throw new MissingApprovalActorError();
  return { userId, displayName };
}
```

Aktör oturumdan okunuyor, **istek gövdesinden değil** (`src/modules/m10/server/actions.ts`):

```ts
async function requireApprovalActor(): Promise<ApprovalActor> {
  const { userId } = await requireTenantAction();   // oturumsuz çağrıyı burada reddeder
  const session = await auth();
  const name = session?.user?.name?.trim();
  return { userId, displayName: name || emailLocalPart(session?.user?.email) || userId };
}
```

Görünen ad sırası: **gerçek ad → e-postanın yerel kısmı → kullanıcı id'si**. Üçü de oturumun
gerçekten taşıdığı veri; hiçbiri uydurma değil. Bu, TASK-MTR5BGKNELCO2'de konan ilkenin aynısı
(`src/lib/user-display.ts` yeniden yazılmadı, `emailLocalPart` oradan çağrıldı).

Aktör artık istemciden gelemiyor: `submitDualApprovalAction.length === 1` — ikinci parametre yok.

### ÖLÇÜLDÜ: kusur bugün tarayıcıdan tetiklenemiyordu (ama kodda duruyordu)
`submitDualApprovalAction` ve `departmentApproveAction`, `documents/client.tsx`'e **import ediliyor
ama hiçbir yerden çağrılmıyor**. Next bu yüzden ikisine sunucu-eylemi kaydı açmıyor: gerçek HTTP
POST'ları `404 Server action not found` dönüyor (kanıt §2.1). Kardeş M10 eylemleri kayıtlı ve
kimliksiz çağrıyı `TenantScopeError` ile reddediyor.

Yani ekrandaki "Çift Onaylı Kurumsal Yetki Akışı" paneli bugün **dekoratif**; uydurma ad canlı bir
denetim kaydına henüz yazılmadı. Kusur yine de gerçek: varsayılan koddaydı ve panele bir düğme
bağlandığı anda ilk kayıt sahte imzayla açılırdı. Önem: **canlı sahtecilik değil, kurulu tuzak.**

### DB'de kaç kayıt var: **0** — ve nedeni yapısal
`fabrika` veritabanındaki 67 tablonun **her text/json sütunu** tarandı: bu adı taşıyan **0 satır**
(kanıt §2.4). Sebebi kayıtların temizlenmiş olması değil: **çift onay durumu hiçbir tabloya
yazılmıyor.** `DualApprovalState` bellekte üretilip istemciye dönüyor; şemada `auditTrail`,
`actorName`, `financeApprover` karşılığı bir tablo/sütun **yok** (`AuditEvent` 0 satır,
`ApprovalRequest` 0 satır). Hiçbir kayıt silinmedi/değiştirilmedi.

### Şemada eksik olan alan — ADIYLA BİLDİRİYORUM, tablo AÇMADIM
Kart "denetim kaydı `userId` de taşısın; şemada alan yoksa adıyla bildir" diyordu. Durum bundan
bir adım daha kötü: **eksik olan alan değil, tablonun tamamı.**

- Eksik tablo: çift onay denetim izi için kalıcı bir tablo yok. Gereken alanlar
  `tenantId, docId, stage, department, action, actorName, **actorUserId**, note, createdAt`.
- `prisma/schema.prisma`'daki `AuditEvent` (`tenantId, actorId, type, target, data, createdAt`)
  bu izi taşıyabilecek en yakın mevcut tablo — `actorId` alanı zaten var.
- Kendi başıma migration/tablo açmadım (kartın açık talimatı). Kalıcılık kararı + hangi tablonun
  kullanılacağı **patron/lead kararı**. Şu an `actorUserId` bellek içi kayıtta taşınıyor, yani
  kalıcılık eklendiğinde yazılacak alan hazır.

### Kapsam dışı ama aynı sınıf — yeni kart açıldı
`grep -rn "Dr. Mehmet Yılmaz" src` boş DEĞİL; kalanların hiçbiri bu kartın dokunma izni olan
dosyalarda değil (§2.3). İkisi ciddi ve **TASK-MTRHZIWHU2SKA** olarak board'a açıldı:

- `src/lib/document-exporter.ts:128` → `<span>İsim: Dr. Mehmet Yılmaz</span>` — kullanıcının
  **indirdiği belgenin imza satırı**. Bu sınıfın en ağırı: dışa çıkan bir belgeye sahte imza sahibi.
- `src/modules/m11/ui/PartBCollaborativeEditor.tsx:111` → `const currentUserName = 'Dr. Mehmet Yılmaz'`
  — ortak yazım ekranının yazar atfı; `types.ts:107,120,216,224` fixture mı diye ölçülecek.

Meşru demo/örnek içerik, dokunulmadı ve kart konusu değil: `src/lib/auth.ts:21` DEMO_PROFILES,
`login/LoginForm.tsx:216` + `login/AuthCard.tsx:323` (giriş ekranının demo hesap kartları),
`src/lib/blog.ts:27` + `admin/blog/client.tsx:49,76` (blog yazar örneği),
`src/lib/user-display.ts:5` (kusuru ANLATAN yorum satırı).

---

## 2. Kanıt

Tüm ham çıktılar: `docs/agent-results/TASK-MTR60M5ESB5PZ-screenshots/`

### 2.0 ÖNCE — düzeltmeden önceki gerçek davranış
`submitForDualApproval('doc-anon-1')`, aktör verilmeden çağrıldı (vitest, gerçek modül):

```
--- BEFORE FIX: submitForDualApproval("doc-anon-1") with no actor ---
{
  "docId": "doc-anon-1",
  "stage": "PENDING_FINANCE_APPROVAL",
  "submittedBy": "Dr. Mehmet Yılmaz",
  "financeApproved": false,
  "legalApproved": false,
  "auditTrail": [
    {
      "id": "log-sub-1788800296228",
      "department": "FINANCE",
      "action": "APPROVED",
      "actorName": "Dr. Mehmet Yılmaz",
      "note": "Doküman Çift Onaylı Kurumsal Yetki Akışına Gönderildi",
      "timestamp": "2026-09-07T16:58:16.228Z"
    }
  ]
}
```

Kimse adını vermedi; kayıt yine de bir kişinin adıyla imzalandı. Düzeltmeden sonra aynı çağrı
`MissingApprovalActorError` fırlatıyor (§2.2, `submitForDualApproval refuses no actor at all`).

### 2.1 Sunucu eylemlerinin kimliksiz HTTP POST ile yoklanması
`00-anonymous-action-probe.txt` — dev sunucusuna gerçek POST, oturum çerezi YOK:

```
### Reachability probe of the five M10 server actions (dev server, real HTTP POST)
URL: http://localhost:3000/tr/main/opportunities/demo-opp-1/documents

submitDualApprovalAction   HTTP 404  Server action not found
departmentApproveAction    HTTP 404  Server action not found
signDocument               HTTP 500  TenantScopeError
createNewVersion           HTTP 500  TenantScopeError
generateStandardDoc        HTTP 500  TenantScopeError
```

İlk iki satır "bu iki eylem hiçbir yerden çağrılmıyor, Next kayıt açmamış" demektir; son üç satır
modülün kimliksiz çağrıyı zaten reddettiğini gösterir. Hiçbirinde uydurma ad dönmüyor.

### 2.2 Birim + sunucu-eylemi testleri (gerçek kod yolu)
`04-unit-tests.txt` — `pnpm test`:

```
 Test Files  71 passed | 2 skipped (73)
      Tests  754 passed | 8 skipped (762)
```

Eklenen 11 + 6 test (`tests/dual-approval.test.ts`, `tests/m10-dual-approval-action.test.ts`):

```
 ✓ submitForDualApproval refuses no actor at all
 ✓ submitForDualApproval refuses a null actor
 ✓ submitForDualApproval refuses an actor with no userId
 ✓ submitForDualApproval refuses an actor with no display name
 ✓ approveByDepartment and rejectDualApproval refuse an unidentified actor
 ✓ every audit line carries the actor id next to the display name
 ✓ stamps the audit record with the signed-in user, name and id
 ✓ a nameless session falls back to its own e-mail, not to somebody else
 ✓ an anonymous call is refused and produces no audit record
 ✓ the actor cannot be supplied by the caller any more
 ✓ signs the department step with the session user
 ✓ an anonymous department approval is refused
```

### 2.3 grep
`03-grep.txt`:

```
$ grep -rn "Dr. Mehmet Yılmaz" src/modules/m10 src/lib/dual-approval.ts
(no output — clean)
```

Kartın istediği `grep -rn "Dr. Mehmet Yılmaz" src` → **boş DEĞİL**, 14 satır dönüyor. Hepsi bu
kartın "DOKUNMA" listesindeki ya da izin verilmeyen dosyalarda; ikisi için TASK-MTRHZIWHU2SKA
açıldı, kalanı meşru demo içeriği (§1'deki döküm).

### 2.4 DB sayımı — SİLİNMEDİ, DEĞİŞTİRİLMEDİ
`06-db-count.txt`:

```
scanned 67 tables of database "fabrika" for the literal "Dr. Mehmet Yılmaz" in every text/json column
tables with a match : (none)
TOTAL MATCHING ROWS: 0

why: the dual approval state has no table at all — grep for a persistence call:
  AuditEvent rows      : 0
  ApprovalRequest rows : 0
  FollowupDoc rows     : 0
```

Yalnız `SELECT` çalıştırıldı; hiçbir satır silinmedi ya da güncellenmedi.

### 2.5 Gerçek tarayıcı kareleri (Playwright, gerçek dev sunucusu)
`07-e2e.txt`:

```
Running 3 tests using 1 worker
  ✓  1 M10 dual approval identity › a real signed-in user sees the workflow and no invented signer (558ms)
  ✓  2 M10 dual approval identity › an identity-less visitor never reaches the approval surface (958ms)
  ✓  3 M10 dual approval identity › an identity-less POST to an M10 action is refused, never signed (49ms)
  3 passed (2.0s)
```

- `01-real-user-dual-approval.png` — **gerçek oturum** (`demo-user-alice`, sağ üstte **Alice**).
  M10 "Takip Belgeleri & Eşik Üstü Ödül Paketi" sayfası ve "ÇİFT ONAYLI KURUMSAL YETKİ AKIŞI"
  paneli açık; sayfada uydurma ad yok.
- `02-anonymous-refused.png` — **kimliksiz ziyaretçi**: `/tr/main/opportunities/demo-opp-1/documents`
  isteği `/tr/giris`'e yönlendirildi, onay yüzeyi hiç render edilmedi.
  (Bu ekrandaki demo hesap kartlarında ad geçiyor — o, giriş ekranının kendi meşru içeriği,
  bir onay kaydı değil ve bu kartın kapsamı dışında.)

### 2.6 Kapı (kendi dosyalarım)
`05-lint-typecheck.txt`:

```
$ pnpm exec eslint src/lib/dual-approval.ts src/modules/m10/server/actions.ts \
    tests/dual-approval.test.ts tests/m10-dual-approval-action.test.ts \
    tests/e2e/m10-audit-identity.spec.ts tests/modules/m10.test.ts
(exit 0)

$ pnpm typecheck  — my files only
(no errors in dual-approval / m10)
```

Her commit `pre-commit` kapısından geçti: `✓ Kapı temiz (staged kapsamı).`

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/lib/dual-approval.ts` | `ApprovalActor` + `MissingApprovalActorError`; varsayılan ad söküldü; `actorUserId` ve `*ApproverUserId` eklendi; kullanılmayan `prisma` import'u kaldırıldı |
| `src/modules/m10/server/actions.ts` | `requireApprovalActor()` (oturumdan); iki eylemin `actorName` parametresi kaldırıldı |
| `tests/dual-approval.test.ts` | yeni imzaya taşındı + 7 yeni test (kimliksiz aktör reddi, `actorUserId` zorunluluğu) |
| `tests/m10-dual-approval-action.test.ts` | **yeni** — sunucu eylemi seviyesinde 6 test |
| `tests/e2e/m10-audit-identity.spec.ts` | **yeni** — 3 gerçek tarayıcı testi + kareler |
| `tests/modules/m10.test.ts` | `@/lib/auth` stub'ı (aşağıda) |
| `docs/agent-results/TASK-MTR60M5ESB5PZ-screenshots/` | **yeni** — 7 kanıt dosyası |

Kod değişikliğinin yan etkisi ve düzeltmesi: `m10/server/actions.ts` artık `@/lib/auth`'u doğrudan
import ediyor. `tests/modules/m10.test.ts` yalnız `@/lib/tenant`'ı stub'lıyordu, bu yüzden suite
next-auth'un `next/server` import'unda **yüklenemez** hâle geldi (`Cannot find module .../next/server`).
Aynı commit'te o teste `@/lib/auth` stub'ı eklendi; 9/9 geçiyor.

**Ortam (kod değil):** dev veritabanına `ModuleState` satırı `ms-demo-m10` (`demo-tenant` / `M10` /
`ON`) eklendi — M10 kapalıyken sayfa modül kapısını render ediyordu ve e2e sayfaya ulaşamıyordu.
Mevcut `ms-demo-m8` satırıyla aynı desen. e2e spec'inin başında ön koşul olarak yazılı.

---

## 4. Riskler

1. **Kalıcılık hâlâ yok.** Denetim izi bellekte üretilip istemciye dönüyor; sayfa yenilenince
   kayboluyor. "Çift onay" bugün bir kayıt değil, bir ekran durumu. Tablo kararı verilmeden bu
   akış denetim amaçlı KULLANILAMAZ — ürün metninde "denetim kaydı" denmesi yanıltıcı olur.
2. **`departmentApproveAction` durumu istemciden alıyor.** `currentState` parametresi
   istemci-kontrollü: bir çağıran uydurma bir `auditTrail` gönderip üstüne kendi onayını
   ekletebilir. Bugün zararsız (hiçbir yere yazılmıyor, eylem zaten çağrılamıyor), ama kalıcılık
   eklenirken durum sunucudan okunmalı. Ayrı iş; bu kartın kapsamı adın uydurulmasıydı.
3. **e2e ön koşulu ortama bağlı:** M10 `demo-tenant` için `ON` olmazsa 1. test modül kapısında
   düşer. Spec'te yazılı ama seed'de değil.
4. **Ekrandaki panel dekoratif.** Kullanıcı 4 aşamalı akışı görüyor, hiçbir düğme onu işletmiyor.
   Destek tarafında "onaya gönderdim ama bir şey olmadı" şikâyeti üretebilecek bir yüzey.

---

## 5. Açık sorular

1. **Denetim izi nereye yazılacak?** Yeni bir `DualApprovalAudit` tablosu mu, yoksa mevcut
   `AuditEvent` (`actorId` alanı hazır) mı? Karar patronun; ben tablo açmadım.
2. Panel bilerek mi dekoratif bırakıldı, yoksa düğme bağlanması unutulan bir iş mi? Bağlanacaksa
   önce 1. soru cevaplanmalı.
3. DB'de 0 sahte kayıt var; geriye dönük bir düzeltme kararı GEREKMİYOR. Yine de teyit:
   üretim/staging veritabanı da tarandı mı, yoksa yalnız yerel `fabrika` mı yeterli sayılıyor?

---

## 6. Sonraki adım

1. **TASK-MTRHZIWHU2SKA** (açıldı, backlog, öncelik 3) — `document-exporter.ts` indirilen belgenin
   imza satırı + M11 yazar atfı. İndirilen belgeye sahte imza sahibi yazılması bu karttan daha ağır.
2. Kalıcılık kararı (§5.1) verildikten sonra tablo + migration + RLS + `actorUserId` yazımı;
   `docs/DATA_MODEL.md` aynı PR'da.
3. Karar sonrası paneldeki düğmelerin `submitDualApprovalAction`'a bağlanması ve gerçek tıklama e2e'si.

---

## Not — bu sprint'te gördüğüm, bana ait OLMAYAN kırıklar

- **Çalışma ağacı iki kez sıfırlandı.** `src/lib/dual-approval.ts` + `src/modules/m10/server/actions.ts`
  düzeltmem bir kez, `tests/dual-approval.test.ts`'i yeniden yazışım bir kez, başka bir ajanın
  ağaç sıfırlamasıyla silindi (branch `f9634a3` → `00c5dc5` atladı, `git diff` dosyalarımı boş
  gösterdi). İkinci seferden sonra her dosyayı scratchpad'e yazıp yaz-ekle-commit'i tek adımda
  yaptım. Sprint kuralının yasakladığı `git reset --hard` hâlâ uygulanıyor.
- **Ana sayfa (`/`) dev'de 500 veriyor:** `Invalid src prop (https://images.unsplash.com/...) on
  next/image, hostname "images.unsplash.com" is not configured under images in your next.config.js`.
  `next/image` taşımasının (TASK-MTREJ27YUPSY7 bölgesi) yan etkisi. Playwright'ın `webServer`
  hazır-olma yoklaması `/` adresine baktığı için `pnpm test:e2e` bu hâliyle **hiç başlayamıyor**;
  ben kendi dev sunucumu 3300'de açıp `/tr/giris` üzerinden yokladım.
- Ağaçta bana ait olmayan typecheck hataları (`opportunities/[id]/application/client.tsx`,
  `briefs/client.tsx`, `documents/client.tsx` — `_opportunityId`, `locale`, `ShieldCheck`, `Clock`)
  vardı; lint kartının in-flight hâli. Dokunmadım.
