Hüküm: ONAY (1 öneri, 1 süreç notu) — be-fb envanteri schema.prisma'daki 75 modelin tamamını, 4 R2 önekini ve dış sistemleri kapsıyor; ADR-0010 dev'de (ff8b2db6) ve kendi içinde tutarlı; U-1..U-5, U-7, U-8 kartları panoda henüz AÇILMAMIŞ (rapor da "açılmadı" diyor; U-6 ayrı açılıp done). Bloke eden yok.

# TASK-MUPIQODOCEZH9 — crw2-fb inceleme (tur 2, kart 2)

## 1. Model kapsamı (schema.prisma ↔ ADR-0010 Ek A)
```
$ python3 (schema.prisma modelleri / tenantId kolonu)
75 model; tenantId alanlı 50
```
- 75 modelin her biri ADR metninde geçiyor (`ADR'de geçmeyen modeller:` boş).
- Ek A tablosunda tek satırlık `| Model |` biçiminde görünmeyen 16 model (Programme, Call, Topic, TopicStat, 8×Cordis*, TopicMatch, ConceptTemplate, Document, Chunk) elle bakıldı: TopicMatch Ek A:260 (G0) + :283 (K1), Chunk :274, Document :275, ConceptTemplate :276 ayrı satırlarda ("(tenantId ≠ NULL)" notuyla); katalog modelleri A.2/A.3 grup satırlarında. Eksik kurum modeli YOK. Karma satırlar (tenantId NULL = platform) doğru ele alınmış: "platform satırları NULL, dokunulmaz".
- 50 = 29 cascade + 21 FK'siz sayımı ADR §1.1 ve Ek A sonundaki "Sayım" paragrafıyla tutuyor; rls.sql 47+3 = 50 ile uyumlu (rapor §2.1).

## 2. R2 nesneleri
dev'de (`FONBRIDGE-wt-qaefb-merge`) tüm yazıcılar tarandı: `PutObjectCommand`/`putObjectBytes`/`putObjectToR2` çağrıları → `storage.ts` (tenant önekli kanıt + `incoming/<tenantId>/`), `evidence/mock-upload/route.ts` (aynı anahtar şekli), `agency/cobrand-store.ts:107` (`<tenantId>/`), `feedback/submit.ts:144` (anahtar `feedback/${tenantId}/…`, `:104` civarı). ADR §2.5'teki 4 önek (`<tenantId>/`, `incoming/<tenantId>/`, `feedback/<tenantId>/`, `exports/<tenantId>/`) = kodda yazılan tüm önekler; eksik önek yok. Dış sistemler (Stripe/AI/SMTP/PostHog/jobs/yedek) ayrıca listeli.

## 3. ADR-0010 dev'de ve tutarlı mı
```
$ git log --oneline -3 dev -- docs/adr/ADR-0010-tenant-export-and-deletion.md
ff8b2db6 docs(adr): ADR-0010 taslak — ...
$ git diff --stat dev be-fb/p5-tenant-export-prep -- <ADR>   → (boş: aynı içerik)
```
dev ucu `99337d06`; ADR-0010 dev'de (qae-fb TASK-MUPL20074JQ0V ile alınmış). Tutarlılık: durum ÖNERİLDİ, K-1..K-5 §9 ile rapor §5 aynı; §1 iddiaları (tenant.delete yok, deletedAt yalnız okunuyor) rapor kanıtıyla aynı; ADR-0007/0008/0009 ve DPA §6 atıfları mevcut dosyalara gidiyor. ADR numarası çakışmıyor (0009 → 0010).

## 4. Uygulama kartları
`list_tasks` (60 kart): U-6 = TASK-MUPL2D9B8QWAB (done). U-1, U-2, U-3, U-4, U-5, U-7, U-8 için pano kartı YOK. Rapor bunu açıkça "panoya AÇILMADI, lider açar" diyor, yani yazar kusuru değil; bu işin kabul koşulu "kartlar açıldı" ise karşılanmamış → **Ö-1: leed-fb K-1..K-5 patron kararından sonra U-1..U-5, U-7, U-8'i açmalı** (pilot 02.10; K-3 A'daki U-8 runbook'u pilotta DPA §6 vaadinin tek karşılığı, önceliklendirilmeli).

## 5. Bulgular
- Bloke eden: yok.
- Ö-1: yukarıdaki kart açılışı (lider işi).
- Ö-2 (süreç): rapor "ADR dev'e alınmadı" diyor; sonradan dev'e alınmış (rapor bayat), zararsız.
- Ö-3 (yazar zaten işaretlemiş): FK cascade'in `fabrika_app` altında RLS'e takılmaması canlı doğrulanmadı (R-1/R-2, DB :5433 kapalıydı); U-3 DoD'unda ölçüm şartı var — yeterli.
- Not: kod değiştirmedim; canlı DB doğrulaması yapılmadı.

**Platform beyanı:** yalnız mac (Darwin 27), belge/statik okuma incelemesi; platforma bağlı yol yok. Linux/Windows koşulmadı (makinede yalnız mac), fark beklenmez.
