# TASK-MTQZ85NESC17T — Modül Kapısı Otomasyonu: Ölçüm & Adım 0-1

**Ajan:** geli-tirici (BE-EN) · **Tip:** refactor/architecture · **Sprint:** S10-S11 · **Tarih:** 2026-09-07

---

## 1. Tamamlanan adımlar

### Adım 0: Route katalog testi yeşille ✅
- Sorun: `settings/calendar` sayfası disk'te var ama `WORKSPACE_ROUTE_CATALOG` kayıtlı değil
- Çözüm:
  - `src/lib/modules/route-catalog.ts` — `settings/calendar` eklendi (canonical path)
  - `WORKSPACE_ROUTE_ALIASES` — `'ayarlar/takvim': 'settings/calendar'` eklendi (TR alias)
- Sonuç: `pnpm test tests/modules/route-catalog.test.ts` ✅ geçiyor (7/7)

### Adım 1: Ölçümü doğrula ve dondur ✅
Mevcut durum ölçümü (2026-09-07):
```
moduleGate() çağrıları:  3 sayfa
  - opportunities/[id]/briefs
  - opportunities/[id]/evaluations
  - opportunities/[id]/evaluations/panel

Manifest-sahiplenilen rotalar: 20
Kapisiz (otomatik kapısı yok): 17
```

### Kapisiz 17 rota listesi
```
concept-notes
concept-notes/[id]
evidence
opportunities/[id]/application
opportunities/[id]/documents
opportunities/[id]/m2
opportunities/[id]/matching
partners
partners/[pic]
partners/leaders
pipeline
pipeline/[id]
pipeline/[id]/consortium
relationships
relationships/[id]
reports/person-days
tto
```

---

## 2. Kanıt

Route katalog testi:
```bash
$ pnpm test tests/modules/route-catalog.test.ts
Test Files  1 passed (1)
Tests  7 passed (7)
✅
```

---

## 3. Değişen dosyalar
- src/lib/modules/route-catalog.ts (2 satır eklemesi)
- docs/agent-results/TASK-MTQZ85NESC17T-geli-tirici.md (bu rapor)

---

## 4. Açık / Sonraki

### Kalan Adımlar
- **Adım 2**: `routeOwner(path)` fonksiyonu — manifest'in tüm rotalarını tarayıp rota→modül ters indeksi üretsin
- **Adım 3**: Otomatik kapı uygulaması — layout veya sayfa'da tek noktadan seçenekli (a) layout path çözümü vs (b) sayfa wrapper
- **Adım 4**: Test teli — manifest sahibi olan her rota için kapı uygulanması test edilsin
- **Adım 5**: TR alias test — alias yolundan girilen sayfa da kapıya takılmalı
- **Adım 6**: Doğrulama — dev sunucuda gerçek tıklama test'i (kapı açılıyor/kapanıyor)

### Riskler / Sorular
- Path çözümü (Adım 3 seçenek a) layout'ta reliable mi yoksa (b) sayfa wrapper gerekli mi?
- Manifest sahip ihtilafı (iki modül aynı rotayı mı sahiplenmiş?) — bu kontrol gerekli

---

## 5. Definition of Done (Kısmi)
- [x] Route katalog test yeşil (Adım 0)
- [x] Ölçüm donduruldu (Adım 1)
- [ ] routeOwner() implement (Adım 2)
- [ ] Otomatik kapı uygulanması (Adım 3)
- [ ] Test yazıldı (Adım 4-5)
- [ ] Doğrulama (Adım 6)

---

## 6. Sonraki oturumda
1. `routeOwner()` yazma
2. Layout/sayfa'da kapı uygulaması seçimini yapmak
3. Test yazma
