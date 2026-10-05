# TASK-MUMKVK1T4G1BT — Belge senkronu: İNCELEME-19 K-1/K-2 + 29.09'da kapanan işler ROADMAP'e — cs-fb

**Tarih:** 29.09.2026 · **Dal:** `dev` (başlangıç HEAD `4e5ea9e1`) · **Kod değişikliği:** yok. Yalnız `docs/adr/ADR-0007-ilkadim-free-pilot.md` ve `docs/ROADMAP.md` değişti.

> Not: Kartın board açıklamasını okuyamadım. `list_tasks` yalnız başlığı döndürüyor. Kapsam şu kaynaklardan alındı: kart başlığı, görev metni ve İNCELEME-19 raporu (`docs/agent-results/TASK-MUMJA0EG9EMGS-crw-fb.md` §3 K-1, K-2, §7 "cs-fb: K-1 ve K-2 belge güncellemesi").

## 1. Ne yapıldı

**ADR-0007 (K-1 + K-2)**

- K-1: "Açık iş (29.09): İNCELEME-17 B-1 … hâlâ yazabiliyor" satırı şöyle değişti: **"B-1 kapandı (29.09)"**. Satır şunları içeriyor: `fe021b59`, portal yazmadan önce pilot kapısından geçiyor, İNCELEME-19 canlı ONAY `79ff1312`.
- K-2: "`pipeline/actions.ts` ayrıca `assertTenantWritable` çağırır" cümlesi düzeltildi. Doğrusu `assertTenantActionWritable` (`src/lib/tenant.ts:115`). Bu fonksiyon `assertTenantWritable`'ı (`src/lib/billing/pilot.ts:140`) sarar ve `digest = 'PILOT_EXPIRED'` ekler (`0b93f2ed`). Oturumsuz portal yolu da cümleye eklendi: `src/modules/m11/server/actions.ts:587`.

**ROADMAP (K-1 + 29.09'da kapanan işler)**

- Üst nota "Gece güncellemesi — 29.09" paragrafı eklendi.
- Pilot kapısı (f): "DÜZELTME GEREKLİ: B-1" ve "TASK-MUMHVNJLRYQU9 (todo)" ifadeleri kaldırıldı. Yeni durum: B-1 kapandı (`fe021b59`, İNCELEME-19 ONAY), test verisi silindi (`3481a4b9`). Kart `review`'da, `done` olunca kapı kapanır. Sahip sütunu da güncellendi: in_progress → review, İNCELEME-19 eklendi.
- Pilot kapısı (d): hukuk paketi hazır (`6bfae321`, İNCELEME-18 ONAY), 1.1 eki review'da. Görüş hâlâ bekleniyor.
- Açık karar #24 K-1: "tek istisna açık B-1" ifadesi "B-1 de kapandı" olarak değişti. `0b93f2ed` mesajı da eklendi.
- FB-KAMU-2:
  - Başlıktaki sayılar düzeltildi. Eski: 41 kart. Yeni: 60 kart (48 done · 9 review · 2 in_progress · 1 backlog).
  - TASK-MUM9RXZX5RGAU review → done.
  - 9 yeni madde eklendi: pilot, süre dolumu mesajı, pilot CTA, test verisi, ADR-0007 kayıtları, Modüller sayfası, uyarı işi, admin yetkisi, hukuk paketi. B-5 build notu da eklendi.
  - İnceleme listesine İNCELEME-15…19 eklendi (hepsi `done`). Artık yalnız İNCELEME-20 sürüyor. Bu, İNCELEME-16 K-1'deki eski "Sürüyor: İNCELEME-15" notunu da kapatıyor.
  - İNCELEME-14'te kalan 3 küçük iş artık kartlara bağlı.
- FB-GAP-1: E2E (`9d03f474`, `056e83f6`), dev ortamı (`ae9420fc`), Inngest (`375d32f2`) ve DoS (`50d7e8a9`) maddeleri "kapandı" oldu. "Hâlâ açık" listesinin altına üç satır eklendi: kapananlar, review'dakiler ve hâlâ açık olanlar.
- Epik satırlarına "güncel 29.09 gece" notu eklendi:
  - E0: dev ortamı, bakım, Inngest ve PostHog/Sentry. Sentry K-3a'nın review'da olduğu da yazıldı.
  - E5: DoS.
  - E6: K2 gerçek dökümü SUCCESS 272 sn. M1 bellek taşması hâlâ açık.
  - E8: prompt'lar.
  - E10: MVP ölçüm sonucu ve açılan kartlar.
- `npx prettier --write docs/ROADMAP.md`: yalnız pilot kapıları tablosunun sütun genişlikleri yeniden hizalandı.

## 2. Kanıt

Her iddia commit'ten ya da koddan doğrulandı:

```
$ git log -1 --format=%cd 90f76612   → Tue Sep 29 13:11:09  (ADR-0007 "B-1 açık" yazıldı)
$ git show --stat fe021b59            → 13:13:21 "B-1: addBudgetLineByToken … now runs assertTenantWritable on the token's tenant"
$ grep -n assertTenantWritable src/modules/m11/server/actions.ts   → 587:    await assertTenantWritable(part.tenantId);
$ git show HEAD:"src/app/[locale]/(app)/[workspace]/pipeline/actions.ts" | grep -n Writable
  5: import { …, assertTenantActionWritable } · 155, 315, 355, 388, 441, 506, 606, 689: await assertTenantActionWritable(scope.tenantId);
$ grep -n "assertTenantActionWritable\|export async function assertTenantWritable" src/lib/tenant.ts src/lib/billing/pilot.ts
  src/lib/tenant.ts:115 · src/lib/billing/pilot.ts:140
```

İnceleme kararları raporlardan alındı:

- İNCELEME-19 `TASK-MUMJA0EG9EMGS-crw-fb.md:9-11`: pilot **ONAY** (B-1 kapandı), ADR-0007 **ONAY notlu**, Modüller **ONAY** (B-4a kapandı).
- İNCELEME-18 `TASK-MUMIIMRN92JDQ-crw-fb.md:11-15`: Inngest ONAY, uyarı işi ONAY, PostHog ONAY (koşullu, K-3a), hukuk paketi ONAY.
- İNCELEME-17 `TASK-MUMH7665CD7DQ-crw-fb.md:14-15`: AuthCard ONAY, ADR-0007 ONAY notlu.
- İNCELEME-16 `TASK-MUMACL71C32U4-crw-fb.md:9`: TASK-MUM9RXZX5RGAU ONAY.

Kart durumları board'dan alındı (`list_tasks sprint=FB-KAMU-2 limit=100` → 60 kart; `sprint=FB-GAP-1` → 48 kart). Commit'ler `git log --oneline --grep=<TASK-ID>` ile tek tek eşlendi (31 kart).

Eski ifade taraması:

```
$ grep -n -E "açık B-1|hâlâ yazıyor|hâlâ yazabiliyor|MUMABL78X5JLX\*\* \(in_progress|MUMHVNJLRYQU9 \(todo" docs/ROADMAP.md docs/adr/ADR-0007-*.md docs/kamu/ILKADIM-PILOT.md
(çıktı yok)
$ npx prettier --check docs/ROADMAP.md docs/adr/ADR-0007-ilkadim-free-pilot.md
All matched files use Prettier code style!
```

## 3. Değişen dosyalar

- `docs/adr/ADR-0007-ilkadim-free-pilot.md` (2 satır)
- `docs/ROADMAP.md`
- `docs/agent-results/TASK-MUMKVK1T4G1BT-cs-fb.md` (bu rapor)

Çalışma ağacında başka bir ajanın commit'lenmemiş `src/lib/k2-cordis/partnerProfileJob.ts` değişikliği ve `FON_BRIDGE.md` var. Bunlara dokunulmadı ve commit'e alınmadı.

## 4. Riskler

- Durumlar 29.09 gecesinin anlık görüntüsü. İNCELEME-20 (TASK-MUMKVSIXGEIYA) sürüyor. Bitince şu kartlar review → done olabilir: MUMJ9STRA6RJK, MUMJ2ERCFP964, MUMJ9M19CZY56. O zaman FB-KAMU-2 sayıları ve kapı (f) yine eskir.
- B-5 build yeşil iddiası fe-fb raporuna dayanıyor (`e5fd0e9e`). `pnpm build`'i ben koşmadım, çünkü belge kartıydı ve kod dokunulmadı.
- MVP ölçümü B-3 ve B-4 için board'da kart göremedim. ROADMAP'te "board'da kart görünmüyor" diye yazdım, "yok" diye değil.

## 5. Açık sorular

- Kapı (f) için "kapandı" demek, TASK-MUMABL78X5JLX'in `done`'a alınmasına bağlı bırakıldı. İNCELEME-19 §7 "done'a alınabilir" diyor. Lider onaylarsa tabloda (f) "Kapandı" yapılmalı.
- MVP ölçümü B-3 (konu önekine göre koordinatör listesi) ve B-4 (YZ kullanım beyanı UI'ı) için kart açılsın mı? Karar liderin.

## 6. Sonraki adım

- Lider: TASK-MUMABL78X5JLX, TASK-MUMH6W5I1W9WC ve TASK-MUMI52B8UW21O'yu `done`'a alabilir (İNCELEME-19 §7). Bu kart K-1/K-2'yi kapatıyor.
- İNCELEME-20 bitince FB-KAMU-2 sayıları ve kapı (f) ile tek satırlık bir güncelleme yapılmalı.

**Platform beyanı:** Doğrulama yalnız **mac**'te yapıldı (Darwin 27, git + prettier + board aracı). Bu yalnız belge işi, platforma bağlı bir kod yoluna dokunulmadı. Kaydı yapılan kod da sunucu tarafı TS ve Postgres (`assertTenantWritable`, advisory lock). Süreç, kabuk, dosya yolu ya da ekran bağımlılığı yok. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. Belge içeriği platformdan bağımsız.

## 7. Ek (aynı gün, ikinci commit)

İlk commit'ten (`765f4863`) hemen sonra İNCELEME-20 raporu geldi (`d49312bd`). Üç kartın üçü de ONAY aldı: MUMJ9STRA6RJK, MUMJ2ERCFP964, MUMJ9M19CZY56. Board'a yeni bir kart da eklendi: TASK-MUML0QZAZ5M80 (todo). ROADMAP'teki "İNCELEME-20 sürüyor" ifadeleri ve FB-KAMU-2 sayıları güncellendi. Yeni sayılar: 61 kart (48 done · 10 review · 1 in_progress · 1 todo · 1 backlog). B-5 build yeşil bilgisi artık İNCELEME-20'nin kendi koşusuna dayanıyor: `4e5ea9e1`'de exit 0. Bu yüzden §4'teki "fe-fb raporuna dayanıyor" riski kapandı.
