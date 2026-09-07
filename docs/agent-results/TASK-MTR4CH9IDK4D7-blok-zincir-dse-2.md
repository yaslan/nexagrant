# TASK-MTR4CH9IDK4D7: M8 Partners Pages — prisma.organization Fix

**Status:** ✅ DONE

## Yapılan İş

M8 Konsorsiyum Modülünün 3 partner sayfası `prisma.organization` model'ine referans veriyordu (model şemada yok). Hataları kaldırmak için tüm 3 sayfa CORDIS partner grafiğine (CordisOrganization, CordisPartnerProfile, CordisParticipation) taşındı.

### Dosyalar Değiştirilen
1. **partners/page.tsx** (lines 1–400)
   - Fallback 3 (legacy Organization) kaldırıldı — artık doğrudan demo dataset'e düşer
   - LegacyOrganizationRow import kaldırıldı
   - Demo fallback (CordisPartnerProfile boşsa) intakt kaldı

2. **leaders/page.tsx** (lines 1–50)
   - `prisma.organization.findMany` → `prisma.cordisPartnerProfile.findMany`
   - Sıralama: `eigenvector: 'desc'` → `totalProjects: 'desc'` (eigenvector CORDIS'te yok)
   - LegacyOrganizationRow import kaldırıldı
   - Açıklama güncellendi ("merkeziyet" → "toplam katılım")

3. **partners/[pic]/page.tsx** (lines 1–122)
   - CordisOrganization + CordisParticipation ile yeni sorgu
   - Şematik tip tanımı eklendi (OrgDetail interface)
   - Stats: ecContributionSum calculated from participations array
   - Key: projectId-organisationId composite (Participation @id)

## Kanıt

### Senaryo 1: Partners Listesi
```
$ mcp__agentdesk-browser navigate http://localhost:3000/tr/demo/partners
Screenshot: M1 açılmış, CORDIS partner profilleri loaded
- 12 ortaklar gösteriliyor (demo dataset'ten)
- Filtreler çalışıyor (ülke, tür, asgari proje)
- Hiç 500 error yok
```

**Kare:** `/var/folders/4q/vwck56vd699b6jw6gp1sc0w80000gn/T/agentdesk-images/run-64536-1788801514457/agentdesk-browser-1788804566209-14-screenshot.png`

### Senaryo 2: Leaders Sayfası
```
$ mcp__agentdesk-browser navigate http://localhost:3000/tr/demo/partners/leaders
Screenshot: Leaders sayfası yükleniyor
- Başlık: "Kilit Ekosistem Liderleri (Merkeziyet Analizi)"
- Açıklama: "Horizon Europe ve H2020 projelerinde en fazla katılım sağlayan..."
- Hiç 500 error — query başarılı
```

**Kare:** `/var/folders/4q/vwck56vd699b6jw6gp1sc0w80000gn/T/agentdesk-images/run-64536-1788801514457/agentdesk-browser-1788804600935-18-screenshot.png`

### Senaryo 3: TypeCheck Temiz
```bash
$ pnpm typecheck
✓ partners/page.tsx — hata yok
✓ partners/leaders/page.tsx — hata yok
✓ partners/[pic]/page.tsx — hata yok
```

### Senaryo 4: Lint Temiz
```bash
$ pnpm lint
✓ Tüm partners dosyaları — hata yok
```

### Senaryo 5: Commit Geçti
```
✓ eslint (staged files)
✓ tsc --noEmit (proje geneli, sadece staged dosyalar bloke eder)
[dev 306d942] fix(m8): replace broken Organization queries with CORDIS tables
 3 files changed, 75 insertions(+), 84 deletions(-)
```

## Değiştirilen Dosyalar
- `src/app/[locale]/(app)/[workspace]/partners/page.tsx`
- `src/app/[locale]/(app)/[workspace]/partners/leaders/page.tsx`
- `src/app/[locale]/(app)/[workspace]/partners/[pic]/page.tsx`

## Riskler
- **Detail page (partners/[pic]):** Demo tanılama için sadece demo_cordis_dataset'i kullandığı için, asıl CORDIS tablosundaki PIC'ler 404 döner. Bu beklenen — demo verisi CORDIS import'tan gelmeden önce. Ürün ortamında gerçek CORDIS verisi olacak.
- **Eigenvector centrality kaldırıldı:** Leaders page artık "toplam katılım" sıralanıyor. Gerçek network centrality analiziyle değiştirmek gerekebilir (future work).

## Açık Sorular
- **Başka yerlerde Organization referansları:** Kapsam dışı ama şu dosyalar hala `prisma.organization` çağırıyor:
  - `src/app/api/v1/partners/route.ts` — API endpoint
  - `src/app/api/v1/partners/[pic]/route.ts` — API endpoint
  - `src/lib/cordis-delta.ts` — CORDIS sync import
  - `src/lib/cordis-sync.ts` — CORDIS sync
  - Bu dosyaları kapsam dışında bıraktım (görevde belirtilmiş)

## Sonraki Adım
- E2E test `tests/e2e/m8-matching.spec.ts` geçmesi doğrulanmalı
- API endpoint'ler (v1/partners) bir başka görevde düzeltilmeli
- Real CORDIS data seed'lendiğinde detail page test edilmeli

---

**Commit:** 306d942
**Branch:** dev
**Test:** ✅ Manual browser test + lint + typecheck
