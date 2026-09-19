---
name: fabrika-board-cards-go-stale
description: Fabrika görev panosundaki in_progress kartlar bitmiş işi gösteriyor olabilir — kartı koda karşı doğrulamadan iş dağıtma
metadata:
  type: feedback
  updatedAt: 2026-09-06
---

Fabrika panosundaki kart durumu **güvenilir değil**. 2026-09-06'da "IN PROGRESS" sütunundaki
5 kritik kartın **beşi de** aslında bitmiş işti; kimse kartı taşımamıştı:

| Kart | Bitmiş olduğunun kanıtı |
|---|---|
| RLS Validation & CI Check | `pnpm exec tsx scripts/check-rls.ts` → 37/37 model geçiyor |
| i18n Message Catalog | `scripts/i18n-check.ts` → "All translation keys present in both languages" |
| Stripe Webhooks | `src/app/api/webhooks/stripe/route.ts` + `credits-monthly-grant.ts` |
| Authorization (can/authz) | `src/lib/rbac.ts:72` `can()` |
| K1 Adapter & Daily Cron | adaptörler + `k1-daily-calls.ts` (yalnız bu kısmi: SEDIA testleri kırık) |

**Why:** bayat karta iş dağıtmak, bitmiş işi ikinci kez yaptırır ve gerçek kalan işi gizler —
devir sonrası en pahalı karışıklık türü bu.

## Kuyruk otomatik ilerletmesi bitmiş işi yeniden başlatabiliyor

2026-09-06: HANDOVER-1 modül manifest sözleşmesini bitirip commit'ledikten (`5cf3d9f`) SONRA,
başarısız delegasyonların kuyruğu otomatik ilerletildi ve `TASK-MTQ5YNJNF17OZ`
("11 manifest sözleşmesi") yeniden bir pane'de başlatıldı — yani **zaten inmiş iş**
ikinci kez yapılıyordu. Aynı anda `TASK-MTQ5Y8EPT7FDA` (kiracı izolasyonu) ise gerçekten
yeni alanı (m6/m7/m10) genişletiyordu.

Ders: bir delegasyon "done" raporladıktan sonra `agentspace_delegation_status`'a bak —
"in-flight · pane AYAKTA" satırları, senin bitirdiğin işi tekrar koşuyor olabilir.
Yeniden başlatılan kartın kapsamını `git log`'a karşı kontrol et.

## Yineleme kapatma kuralı (panonun kendi konvansiyonu)

Bu panoda yinelenen kart SİLİNMİYOR: başlığa `[YİNELENEN → TASK-XXX]` ön eki konup
`done` yapılıyor (`[BİRLEŞTİRİLDİ → ...]` ve `[TAŞINDI → ...]` de aynı ailedendir).
Hayatta kalan kart olarak en ileri durumdakini seç (review > todo > backlog).
2026-09-06'da Çekirdek'teki 42 kartın 9'u böyle kapatıldı: M6.2/M6.3/M6.4 ikişer,
E11.2 ve E11.4 üçer, E11.3 iki, E10-seed iki kart.

**How to apply:** Bir kartı ekibe vermeden ÖNCE kapsamını koda karşı doğrula — ilgili script'i
KOŞ (`check-rls.ts`, `i18n-check.ts`), dosyanın/cron'un varlığına bak, `git log`'a bak.
Bitmişse iş dağıtma; kartı `review`'a al ve kanıtı yaz. `docs/ROADMAP.md` de aynı şekilde
uzun süre hiç işaretlenmemişti — bkz. [[fabrika-team-handover-cekirdek]].

## `todo` kartlar da bayat olur — ve en ucuz kanıt `git log -- <teslimat dosyası>`

2026-09-10: `TASK-MTVRAZSUVLL9R` ("Tenant-bypass Dilim 5 — kalıcı statik kapı") panoda **todo**
duruyordu. Oysa iş inmişti:

```
git log --oneline -- scripts/check-tenant-bypass.ts
80ee229 feat(gate): TASK-MTVRAZSUVLL9R — tenant-bypass slice 5, a static gate ...
git log --oneline -S "rls:bypass-check" -- package.json   # aynı commit → gate'e de bağlanmış
```

Ders: bayatlık `in_progress` sütununa özgü değil. Bir karta iş dağıtmadan önce, kartın
**teslimatı hangi dosyaysa** ona `git log --oneline -- <dosya>` at; kart kodu commit
mesajında çıkıyorsa iş inmiştir. Bir kapı kartıysa ikinci soru şu: `package.json`'daki
`gate` zincirine gerçekten eklenmiş mi (`git log -S "<script adı>" -- package.json`).
Bu iki komut, o karta boşuna bir pane açmaktan ucuzdur.
