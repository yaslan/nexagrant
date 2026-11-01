# TASK-MTRKV25PNBHPX — M2 phantom-relation runtime crash fix

Sprint: S12 · Dalga "Hayalet Alan" · P0

## 1) Ne yapıldı

`prisma/schema.prisma`'da `Opportunity.topic` ve `ConceptNote.opportunity` diye bir
**ilişki yok** (yalnızca ilişkisiz `topicId String?` / `opportunityId String` skaler
kolonları var). Buna rağmen kod bu ilişkileri `include` ediyordu; Prisma bu isimleri
tanımıyor, dolayısıyla her çağrıda `PrismaClientValidationError` fırlatıyordu
(try/catch yok → M2 konsept not üretimi ve export'u her zaman patlıyordu).
`pnpm typecheck` bunu yakalamıyordu çünkü `src/types/prisma-override.d.ts` tip
seviyesinde bu alanları var gibi gösteriyor.

Şemaya dokunmadım (görev kapsamı dışı — ayrı bir kart). Üç çağrı sitesini
`topicId` / `opportunityId` üzerinden **ayrı sorgu** ile çözecek şekilde düzelttim:

- `src/modules/m2/server/actions.ts:74` — `generateConceptNoteDraft`:
  `tx.opportunity.findFirst({ include: { topic: true } })` → sade `findFirst`
  (include yok), ardından `opp.topicId` varsa `prisma.topic.findUnique({ where: { id }, select: { title, identifier } })`
  ile ayrı sorgu. `Topic` kiracıya özel değil (paylaşılan katalog, `ConceptTemplate`
  gibi), bu yüzden `withTenant` yerine düz `prisma` istemcisi kullanıldı — koddaki
  var olan `ConceptTemplate` desenine uydu.
- `src/modules/m2/server/actions.ts:167` — `exportToDocx`:
  `tx.conceptNote.findFirst({ include: { opportunity: true } })` → sade `findFirst`,
  ardından `note.opportunityId` ile `withTenant` içinde ayrı `opportunity.findFirst`
  (tenant izolasyonu korunuyor). Bulunamazsa açık hata: `Opportunity not found for concept note`.
- `src/app/api/concept-notes/[id]/export/route.ts:20` — aynı desen, route'un kendi
  stiline uyarak düz `prisma.opportunity.findFirst({ where: { id, tenantId }, select: { title } })`.
  Opportunity silinmiş/bulunamazsa (önceki davranış: relation zaten yoktu, kod
  `note.opportunity?.title || 'Untitled'` ile optional chaining kullanıyordu) — aynı
  toleranslı davranış korundu, hata fırlatılmadı (route zaten `?.` ile "Untitled"/"ConceptNote"
  fallback'ine sahipti).

İki ilgili tip arayüzü (`OpportunityWithTopic`, `ConceptNoteWithOpportunity`) artık
var olmayan nested `topic`/`opportunity` alanları yerine gerçek skaler kolonları
(`topicId`, `opportunityId`) taşıyor; neden ayrı sorgu gerektiği kod içinde yorumla
açıklandı ki biri yanlışlıkla `include` geri eklemesin.

## 2) Kanıt

### a) Birim testler (mock DB) — YENİ, 10/10 yeşil

```
npx vitest run src/modules/m2/server/actions.test.ts "src/app/api/concept-notes/[id]/export/route.test.ts"

 Test Files  2 passed (2)
      Tests  10 passed (10)
```

Testler özellikle şunu doğruluyor: gönderilen Prisma çağrı argümanlarında **`include`
anahtarı yok** (`expect(findFirstArgs).not.toHaveProperty('include')`), topic/opportunity
doğru id ile ayrı sorgulanıyor, opportunity/note bulunamama durumları düzgün hata
veriyor, route 401/404 durumlarını koruyor.

### b) GERÇEK Postgres'e karşı canlı çalıştırma (asıl regresyonun ispatı)

Bug, tip kontrolünün YAKALAYAMADIĞI bir **çalışma zamanı** hatasıydı — bu yüzden asıl
kanıt canlı DB'ye karşı gerçek kod yolunun çalışmasıdır. Geçici bir vitest dosyasıyla
(`__live_check.test.ts`, kanıt sonrası SİLİNDİ — repoda değil) sadece dış sınırlar
(`requireTenantAction`, `generateText`, `semanticSearch`) mocklanıp DB katmanı
MOCKLANMADAN gerçek `demo-tenant` / `demo-opp-1` / gerçek `Topic` satırına karşı
çalıştırıldı:

```
stdout: LIVE_CHECK_NOTE_ID cmtrl8spg0000lexk2wxub2vz
stdout: LIVE_CHECK_DOCX_BYTES 8655
 ✓ generateConceptNoteDraft runs the real opportunity+topic queries against the
   live DB without PrismaClientValidationError

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Düzeltmeden önce bu koşum `generateConceptNoteDraft` içindeki `include: { topic: true }`
satırında **anında** `PrismaClientValidationError` ile patlardı (relation yok). Düzeltmeden
sonra: gerçek `Opportunity` + `Topic` satırları ayrı sorgularla okundu, gerçek bir
`ConceptNote` satırı oluşturuldu, `exportToDocx` bu notu ve gerçek `Opportunity.title`'ı
tekrar ayrı sorguyla okuyup **gerçek 8655 baytlık bir .docx buffer'ı** üretti. Test DB'yi
temiz bıraktı (oluşturduğu `ConceptNote` satırını sonunda sildi — doğrulandı: `remaining notes 0`).

Not: `generateText` (gerçek Anthropic çağrısı) ve `semanticSearch` (gerçek OpenAI embedding
çağrısı) bilerek mocklandı — bunlar dış API sınırları, bu görevin regresyonuyla ilgisiz ve
gerçek anahtar/kredi harcamadan test etmek doğru olan buydu. `demo-tenant`'ın zaten
`creditLedger`'da 0 kredisi var, yani mocksuz bir koşum zaten "Insufficient AI credits"
hatasına düşerdi — bu da ayrıca doğrulandı (ilk denemede `semanticSearch` mock'lanmadan
önce hata OpenAI 401'e kadar ilerledi, yani Prisma sorguları sorunsuz geçti).

### c) Gerçek tarayıcı ekran görüntüsü — YAPILAMADI, dürüstçe belirtiyorum

Görev "gerçek tarayıcıda ekran görüntüsü" istiyor. Dev sunucusunu ayağa kaldırdım
(`pnpm dev`, `http://localhost:3000`, gerçek Postgres'e bağlı) ve NextAuth demo
girişini (`admin@yasinaslan.com.tr`, `demo-tenant` TENANT_OWNER) curl ile doğruladım
(oturum çerezi başarıyla alındı). Ancak tarayıcı MCP aracı (`agentdesk-browser`)
görev ortasında bağlantısını kaybetti ve oturum boyunca yeniden bağlanmadı (birkaç
kez `ToolSearch` ile denendi) — bu nedenle gerçek tıklama/ekran görüntüsü adımını
tamamlayamadım. Bunun yerine (b)'deki canlı DB koşumunu kanıt olarak sunuyorum: bu,
tam olarak UI'nin tetikleyeceği kod yolunu (aynı fonksiyonlar, aynı Prisma sorguları,
gerçek DB) çalıştırıyor ve asıl regresyonu (Prisma runtime hatası) UI ekran
görüntüsünden daha kesin biçimde kanıtlıyor — ama buton tıklama / render deneyimini
doğrulamıyor. Tarayıcı aracı geri geldiğinde bu adımın tamamlanması önerilir.

### d) Kapı kontrolleri

```
pnpm typecheck   → 0 hata (repo genelinde temiz)
pnpm lint        → 0 hata, 84 pre-existing warning (benim dosyalarımda yok)
npx vitest run   → 82 dosya geçti, 2 skip; 904 test geçti, 8 skip (yeni 10 test dahil)
```

## 3) Değişen dosyalar

- `src/modules/m2/server/actions.ts` — phantom `include` kaldırıldı, ayrı topic/opportunity sorguları eklendi
- `src/app/api/concept-notes/[id]/export/route.ts` — aynı desen
- `src/modules/m2/server/actions.test.ts` — YENİ, 6 test
- `src/app/api/concept-notes/[id]/export/route.test.ts` — YENİ, 4 test

Şemaya (`prisma/schema.prisma`) dokunulmadı — kapsam dışı.

## 4) Riskler

- `exportToDocx` (server action) artık opportunity bulunamazsa **açıkça hata fırlatıyor**
  (`Opportunity not found for concept note`) — eskiden zaten relation yokluğu yüzünden
  her zaman patlıyordu, yani davranış değişikliği yok, sadece hata mesajı daha net.
- Route handler (`export/route.ts`) ise mevcut toleranslı davranışı korudu (`?.title || 'Untitled'`)
  — orada opportunity bulunamazsa sessizce "Untitled"/"ConceptNote" ile devam eder. Bu
  tutarsızlık (action throw ediyor, route etmiyor) düzeltmeden ÖNCE de zaten farklıydı
  (biri never reaches burayı, diğeri optional chaining kullanıyordu); kapsamım sadece
  phantom relation'ı gidermekti, davranış birleştirmesi ayrı bir karar gerektirir.
- `Topic` ve `Opportunity` arasında Prisma seviyesinde FK zorlaması yok (ilişki
  tanımlı değil) — DB'de referential integrity constraint var mı ayrı doğrulanmadı;
  bu görevin kapsamı dışı.

## 5) Açık sorular

- Route ile server action arasındaki "opportunity yok" davranış farkı (throw vs.
  sessiz fallback) bilinçli bir tasarım mı yoksa tutarsızlık mı? Ürün/lead onayı gerekebilir.
- Tarayıcı MCP bağlantısı bu oturumda geri gelmedi — başka bir ajan/oturum gerçek
  tıklama ile UI ekran görüntüsünü tamamlayabilir mi?

## 6) Sonraki adım

- Tarayıcı aracı tekrar bağlandığında: `admin@yasinaslan.com.tr` demo girişiyle
  `/tr/is-birlikleri/demo-workspace/opportunities/demo-opp-1/m2` (veya ilgili M2 rotası)
  üzerinden konsept not üretimi + export'un ekran görüntüsünü al ve bu dosyaya ekle.
- Diğer 3 karttaki (`docs/agent-results/TASK-MTRKA25R5M3SY-ex-en.md`'de listelenen)
  phantom-relation regresyonları ilgili ajanlar tarafından aynı desenle (skaler
  id + ayrı sorgu) çözülmeli; şema ilişkisi eklemek ayrı bir karardır.

---
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01J6oXXjA5CXFBZ5Ld5x8YvA
