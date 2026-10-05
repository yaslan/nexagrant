# TASK-MTS6MFER9LQZR — e2e reds B, re-measured

**Ajan:** geli-tirici (BE-EN) · **Tarih:** 2026-09-08 · **Branch:** `dev`
**Kart:** "e2e kırmızıları B: dashboard-outcome-case + f10-absence-not-zero + gate-tenant-isolation + m10-audit-identity"

---

## 1. Ne yapıldı

Kart `review`de kapanış ölçümü olmadan duruyordu ve yazıldığından beri dört spec'in çevresi
değişmişti (M10 spec'i yeniden yazıldı, e2e seed altyapısı kendi kiracılarına geçti,
`demo-tenant`'tan iki fırsat silindi, M10'a kalıcı `DualApprovalStep` tablosu geldi).

Dört spec'i **tek tek** koştum. **Dördü de bugün yeşil** — yani "kırmızılar B" başlığı
bayat: düzeltilecek kırmızı yok. Ürün de düzeltilmedi, test de gevşetilmedi; **net kod
değişikliği sıfır.**

Asıl iş bu yüzden ikinci soruya kaydı: *bu dört yeşil gerçekten bir şey ölçüyor mu, yoksa
boş mu geçiyor?* Kart bir mutasyon kontrolü istiyordu; **dördünde de** ayrı ayrı yaptım —
her spec'in koruduğu iddia edilen kusuru ürün kaynağında kasten geri getirdim, spec'in
kırmızı verdiğini gördüm, kaynağı geri aldım. Dördü de gerçekten ölçüyor.

Sayıma dayanan tek spec (`dashboard-outcome-case`) sayıyı zaten sabit yazmıyor; pay ve
paydayı Postgres'ten okuyor — bu koşuda `1/5 = 20.0 %`. Aynı yerel Postgres'e başka
ajanların yazması onu bozmuyor.

---

## 2. Kanıt

### 2.1 Dördünün bugünkü hâli — tek koşu, 11/11 yeşil

```
$ npx playwright test tests/e2e/dashboard-outcome-case.spec.ts \
    tests/e2e/f10-absence-not-zero.spec.ts \
    tests/e2e/gate-tenant-isolation.spec.ts \
    tests/e2e/m10-audit-identity.spec.ts --reporter=list

  ✓   1 dashboard-outcome-case.spec.ts:81 › the panel export reports the above-threshold rate the database actually holds (1.4s)
[seed-f10-e2e] ready — empty=f10-empty-ws full=f10-full-ws opportunity=f10-full-opp-a
  ✓   2 f10-absence-not-zero.spec.ts:66  › an empty workspace explains itself instead of reporting a 0 % hit rate (860ms)
  ✓   3 f10-absence-not-zero.spec.ts:87  › the same empty state reads in English (643ms)
  ✓   4 f10-absence-not-zero.spec.ts:100 › a populated workspace shows its real figures — including a hit rate that is really 0 (890ms)
  ✓   5 f10-absence-not-zero.spec.ts:128 › a date range with no opportunities says that, not that the workspace is empty (968ms)
[seed-f10-e2e] rolled back
  ✓   6 f10-absence-not-zero.spec.ts:145 › an unfilled evaluation reads "not evaluated", never "0.0 / 15.0 below threshold" (1.6s)
[seed-gate-e2e] ready — tenantA=gate-e2e-tenant-a oppA=gate-e2e-opportunity-a tenantB=gate-e2e-tenant-b oppB=gate-e2e-opportunity-b clearedDecisions=0
  ✓   7 gate-tenant-isolation.spec.ts:34  › tenant A can still run its own gate, and the decision is filed (1.3s)
[seed-gate-e2e] rolled back
  ✓   8 gate-tenant-isolation.spec.ts:81  › tenant A cannot gate tenant B’s opportunity, against the real database (25ms)
[seed-plan-e2e] ready — ultra=plan-e2e-ultra-ws (ultra) flip=plan-e2e-flip-ws (pro)
  ✓   9 m10-audit-identity.spec.ts:168 › the approval record names the session that acted, and each step names its own actor (1.5s)
  ✓  10 m10-audit-identity.spec.ts:245 › an identity-less visitor never reaches the approval surface (512ms)
[seed-plan-e2e] rolled back
  ✓  11 m10-audit-identity.spec.ts:266 › an unauthorised write is refused by the action itself — measured on a LIVE action id (986ms)

  11 passed (11.8s)
```

`dashboard-outcome-case` sayıyı DB'den okuyor, sabitten değil — canlı uç noktanın döndürdüğü CSV:

```
--- database says 1/5 = 20.0 % above threshold ---
KPI,Değer,Birim,Dönem
Toplam Teklif,5,adet,"09.08.2026 - 08.09.2026"
Başarı Oranı,20.0,%
İsabet Oranı,4.8,skor
Kişi-Gün,28.5,gün
G0→G2 Süresi,0,gün
Açık Modüller,5,modül
```

### 2.2 Mutasyon kontrolleri — dördü de kırmızı verdi

Her mutasyon **yalnız ürün kaynağında**, spec'e dokunmadan; her koşudan hemen sonra
kaynak dosya HEAD'e geri alındı (§2.3'te kanıtı).

---

**M1 — `dashboard-outcome-case`** · `src/lib/proposal-outcome.ts`
`isAboveThreshold` gövdesi TASK-MTQTYXC0NUT0B'nin özgün hatasıyla değiştirildi
(SCREAMING_CASE ile ham sütun karşılaştırması):

```ts
return ['SUBMITTED', 'FUNDED', 'ABOVE_THRESHOLD'].includes(raw ?? '');
```

Ürün gerçekten regresyona girdi — canlı uç nokta güvenle `0.0` bastı:

```
$ grep -n "Başarı Oranı" <spec'in yazdığı CSV>
3:Başarı Oranı,0.0,%
```

Spec kırmızı:

```
    > 145 |   expect(csv).toContain(`Başarı Oranı,${expectedRate},%`);
          |               ^
        at tests/e2e/dashboard-outcome-case.spec.ts:145:15
  1 failed
```

---

**M2 — `gate-tenant-isolation`** · `src/lib/gates/evaluate.ts`
`runGate`'in okumasından kiracı yan tümcesi kaldırıldı (TASK-MTQZMLLZE1I29 hatası):
`findFirst({ where: { id: opportunityId, tenantId } })` → `findFirst({ where: { id: opportunityId } })`.

Kiracı A, kiracı B'nin fırsatını **başarıyla** kapıdan geçirdi; spec yakaladı:

```
  ✘  2 gate-tenant-isolation.spec.ts:81 › tenant A cannot gate tenant B’s opportunity, against the real database

    Error: expect(received).rejects.toBeInstanceOf()
    Received promise resolved instead of rejected
    Resolved to value: {"passed": true, "reasons": []}

      > 93 |     ).rejects.toBeInstanceOf(GateOpportunityNotFoundError);
  1 failed
  1 passed
```

Not: 1. test (kiracı A'nın kendi kapısı) mutasyon altında da yeşil kaldı — doğrusu bu,
spec regresyonu ayırt ediyor, topluca kırmızıya boyamıyor.

---

**M3 — `f10-absence-not-zero`** · `src/modules/m5/ui/Dashboard.tsx`
İki yokluk dalı da kapatıldı (`false && …`), yani boş çalışma alanı doğrudan KPI ızgarasına düştü:

```
  ✘  1 an empty workspace explains itself instead of reporting a 0 % hit rate
  ✘  2 the same empty state reads in English
  ✓  3 a populated workspace shows its real figures
  ✘  4 a date range with no opportunities says that, not that the workspace is empty
  ✓  5 an unfilled evaluation reads "not evaluated"
  3 failed / 2 passed

    Expected substring: "Bu çalışma alanında henüz fırsat yok"
    Received string:    "Toplam Teklif0projeBu dönemdeki aktif fırsatlarİsabet OranıHenüz veri yok…"
```

**Yan bulgu (kusur değil, iyi haber):** dış dal kapatılınca kartlar `0,0` basmadı,
kart başına `Henüz veri yok` bastı. Yani F10 savunması **iki katmanlı** — bu spec dış
katmanı çiviliyor, `metricCard`'ın `emptyDescription`'ı ikinci katman. Spec'in
`not.toContainText('0,0')` satırı bu mutasyonda ateşlenmedi; ateşlenen, açıklamayı
isteyen olumlu iddia oldu. Spec yine de doğru şeyi ölçüyor.

---

**M4 — `m10-audit-identity`** · `src/lib/dual-approval.ts`
`requireActor` oturumdan bağımsız sabit bir imzacı adı döndürecek şekilde değiştirildi
(TASK-MTR60M5ESB5PZ hatası): `return { userId, displayName: 'Dr. Mehmet Yılmaz' };`

```
  ✘  1 the approval record names the session that acted, and each step names its own actor

    Expected substring: "E2E Approver A mtsi4cnt"
    Received string:    "08.09.2026 13:03:07 · FINANCE · Dr. Mehmet Yılmaz — Doküman Çift Onaylı Kurumsal Yetki Akışına Gönderildi"
  1 failed
  2 passed
```

Koşu başına türetilen `E2E Approver A <run>` adı işe yarıyor: uydurma imzacı geri gelir
gelmez satır yakalandı.

### 2.3 Mutasyonlar geri alındı + fikstür sızıntısı yok

```
$ git status --porcelain -- src/ prisma/
 M src/app/[locale]/(app)/[workspace]/calls/page.tsx
 M src/app/api/documents/export/route.ts
 M src/lib/billing/catalog.ts
 M src/lib/document-exporter.ts
```

Dört dosyanın **hiçbiri benim** — mutasyon hedeflerim (`src/lib/proposal-outcome.ts`,
`src/lib/gates/evaluate.ts`, `src/modules/m5/ui/Dashboard.tsx`, `src/lib/dual-approval.ts`)
listede yok, yani HEAD'e dönmüş. Yukarıdakiler paylaşılan ağaçta başka ajanların açık işi;
dokunmadım.

Mutasyon koşuları DB'de artık bırakmadı:

```
leftover fixture rows after the mutation runs:
   gate-e2e tenants     0
   f10-e2e tenants      0
   plan-e2e tenants     0
   plan-e2e user B      0
   e2e followupDocs     0
```

### 2.4 Kapı

```
$ pnpm lint       → $ eslint            (çıktı yok = temiz)
$ pnpm typecheck  → $ tsc --noEmit      (çıktı yok = temiz)
$ pnpm test
 Test Files  102 passed | 2 skipped (104)
      Tests  1201 passed | 8 skipped (1209)
   Duration  5.91s
```

### 2.5 `docs/agent-results` kirlenmesi

E2e koşusundan sonra, **benim dört spec'imin izlenen (tracked) tek bir dosyayı bile
değiştirmediği** doğrulandı:

```
$ git status --porcelain -- docs/agent-results
 M docs/agent-results/TASK-MTQYXISOPUJ53-customer-support-2.md
?? docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/st6-application-empty-tenant.png
?? docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/st6-dashboard-empty-tenant.png
?? docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/st6-notifications-empty-tenant.png
?? docs/agent-results/TASK-MTS6MMOD8XF3A-screenshots/03-404-signed-in-en.png
?? docs/agent-results/TASK-MTS6MMOD8XF3A-screenshots/03-404-signed-in-tr.png
?? docs/agent-results/TASK-MTSHVKTSGC8A4-screenshots/
```

Kalan satırlar başka kartların işi (TASK-MTQYXISOPUJ53 = customer-support,
MTS6MMOD8XF3A ve MTSHVKTSGC8A4 = başka ajanlar); dördümün yazdığı kareler artık
git-ignored `test-artifacts/` altına düşüyor:

```
$ ls test-artifacts/
TASK-MTQTYXC0NUT0B-screenshots   TASK-MTQWBAJ2T5XSV-screenshots
TASK-MTQZMLLZE1I29-screenshots   TASK-MTS9C907G4YNW-screenshots
```

Bu, benim değil **blok-zincir-dse'nin** TASK-MTSHUZUMVLTBF'de yaptığı düzeltmenin sonucu
(`tests/e2e/fixtures/shots.ts` + 31 spec'te `shotsDir()`). Kartın istediği "boş olmalı"
koşulu, bana düşen kısımda sağlanmış durumda.

---

## 3. Değişen dosyalar

**Hiçbiri.** Bu koşu net kod değişikliği üretmedi: dört spec zaten yeşildi ve dördü de
mutasyonla ölçüyor olduğunu kanıtladı. Ürün düzeltilmedi (kırık değildi), test
güncellenmedi (bayat değildi).

Eklenen tek dosya bu rapor:

- `docs/agent-results/TASK-MTS6MFER9LQZR-geli-tirici-2.md` (yeni)

Mutasyonlar için geçici olarak dokunulup **HEAD'e geri alınan** dosyalar (§2.3):
`src/lib/proposal-outcome.ts`, `src/lib/gates/evaluate.ts`,
`src/modules/m5/ui/Dashboard.tsx`, `src/lib/dual-approval.ts`.

---

## 4. Riskler

1. **`tests/e2e/` üzerinde canlı çakışma — DURDUM, DOKUNMADIM.** Kart bunu ayrıca
   sordu, cevap: evet, risk gerçek. Çalışırken `tests/e2e/m10-audit-identity.spec.ts`
   önce +20 satırla değişti, sonra geri alındı; ardından **31 spec birden** (dördüm
   dâhil: `dashboard-outcome-case`, `f10-absence-not-zero`, `gate-tenant-isolation`,
   `m10-audit-identity`) `shotsDir()` alacak şekilde değişti. Bu blok-zincir-dse'nin
   TASK-MTSHUZUMVLTBF'si. **Hiçbir spec dosyasına yazmadım**; bütün mutasyonlarım
   `src/` altında kaldı. Aynı dosyayı ikimiz birden değiştirmedik.
2. **Mutasyonlar paylaşılan dev sunucusunda çalıştı.** Her mutasyon penceresi
   ~10–40 saniyeydi ve hemen geri alındı, ama o pencerede başka bir ajan e2e koştuysa
   sahte bir kırmızı görmüş olabilir. Etkilenen dosyalar ve pencereler §2.2'de adıyla
   duruyor.
3. **Bir kerelik flake gördüm ve tekrarlanmadı.** Dördünü birlikte koşarken
   `f10-absence-not-zero:128` bir kez `page.goto` üzerinde düştü; hemen ardından aynı
   spec tek başına 5/5 yeşil, sonraki birleşik koşuda 11/11 yeşil. Sebep spec değil,
   eşzamanlı `src/` düzenlemelerinin dev sunucusunu yeniden derletmesi (aynı anda başka
   bir ajan `notfound-status` koşuyordu ve `test-results/` dizinini süpürdü, o yüzden
   düşüşün trace'i kurtarılamadı). İzi kaybolduğu için bunu "çözüldü" diye değil,
   **açık bir gözlem** olarak bırakıyorum.
4. Playwright `list` reporter'ının `[seed-*] rolled back` satırını son testin ✓
   satırından **önce** basması bir görüntü artefaktı (stdout tamponlama); fikstürün
   gerçekten yerinde olduğunu spec'lerin kendi ön koşul iddiaları kanıtlıyor
   (`expect(before, 'tenant B fixture must exist…').not.toBeNull()` geçti).

---

## 5. Açık sorular (kapsam dışı, DÜZELTİLMEDİ — adıyla bildiriyorum)

1. **`f10-absence-not-zero`'nun `not.toContainText('0,0')` satırı ölü olabilir.**
   M3 mutasyonu gösterdi ki dış dal düşünce kartlar `0,0` değil `Henüz veri yok` basıyor.
   O negatif iddianın kırmızı verdiği bir senaryo var mı, ölçülmedi. Zararsız ama
   "koruduğunu sandığımız" bir satır olabilir.
2. **`gate-tenant-isolation`'ın 2. testi tarayıcı kullanmıyor.** `evaluateGate`'i
   doğrudan çağırıyor; yani HTTP/action katmanının kiracı kontrolü bu spec'te ölçülmüyor
   — yalnız motorunki. Kapsam kararı olabilir, ama "e2e" adı bunu vaat ediyor gibi
   duruyor.
3. **`dashboard-outcome-case` `alice@fabrika.test`'in ilk üyeliğine bağlı**
   (`memberships[0]`). Alice ikinci bir kiracıya üye yapılırsa spec sessizce başka bir
   kiracıyı ölçmeye başlar. Şu an tek üyeliği var, o yüzden bugün doğru.
4. **`m10-audit-identity` oturumu `AUTH_SECRET`'in kod içindeki varsayılanıyla basıyor**
   (`process.env.AUTH_SECRET || 'fabrika-secret-key-…'`). Ortamda gerçek bir sır varsa
   spec onu kullanıyor; yoksa kaynaktaki sabite düşüyor. CLAUDE.md "sırrı koda gömme"
   diyor — bu bir test dosyası ama sabit gerçek varsayılanla birebir aynı.

---

## 6. Sonraki adım

- Kart `review` → **`done`**: dört spec de yeşil, dördü de mutasyonla ölçtüğü kanıtlandı,
  kapı temiz. Düzeltilecek kırmızı yoktu; "kırmızılar B" başlığı bayattı.
- §5'teki dört madde ayrı kart açmaya değer mi, lider karar versin. Hiçbiri bugün bir
  şeyi bozmuyor.
- `docs/agent-results` kirlenmesinin kalıcı çözümü blok-zincir-dse'nin
  TASK-MTSHUZUMVLTBF'si; o kart kapanınca bu kontrol tüm suite için kalıcı olur.
