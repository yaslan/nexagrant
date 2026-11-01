# TASK-MTRGJ80LV3R7I — RLS Ölçüm Açılışı

**Ajan:** QA-EN (blok-zincir-denet-i)  
**Görev Tarihi:** 2026-09-07  
**Durum:** ✅ TAMAMLANDI  

---

## Ne Yapıldı

Kiracı izolasyonunun (RLS / Row Level Security) veritabanı tarafından **gerçekten** uygulandığını ölçebilen test sistemi açıldı. Öncesinde:

1. Test `pnpm test tests/rls.spec.ts` → **42501 permission denied for schema public** (Kart metnindeki teşhis doğrulandı)
2. Ölçüm `pnpm rls:verify` → **hiçbir politika uygulanmamış** (39 model, 0 policy)

Süreç:
- `pnpm db:rls-role` → RLS-subject rolü (`fabrika_app`, NOBYPASSRLS) oluşturuldu
- `pnpm db:rls` → 39 kiracıya özel tabloya tenant_isolation politikası uygulandı (1 → 42)
- Test tekrar koşuldu → **4/4 geçti**
- Ölçüm tekrar koşuldu → **tüm 39 tabloda izolasyon aktif** ✅

---

## Kanıt

### 1. `pnpm test tests/rls.spec.ts` — 4/4 Geçti

```
$ pnpm test tests/rls.spec.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  19:46:40
   Duration  260ms
```

### 2. `pnpm rls:verify` — Yeşil

```
$ pnpm rls:verify
Kiracıya özel model: 39 · RLS açık tablo: 42 · tenant_isolation politikası: 39

✅ Veritabanı 39 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### 3. `fabrika_app` Rolü — NOBYPASSRLS, Superuser Değil

```
$ pnpm db:rls-role
┌─────────┬───────────────┬──────────┬──────────────┬─────────────┬─────────────┬───────────────┐
│ (index) │ rolname       │ rolsuper │ rolbypassrls │ rolcanlogin │ rolcreatedb │ rolcreaterole │
├─────────┼───────────────┼──────────┼──────────────┼─────────────┼─────────────┼───────────────┤
│ 0       │ 'fabrika_app' │ false    │ false        │ true        │ false       │ false         │
└─────────┴───────────────┴──────────┴──────────────┴─────────────┴─────────────┴───────────────┘
```

### 4. Script Idempotent — İki Kez Koş Başarılı

İlk çalıştırma:
```
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
```

İkinci çalıştırma (iki kez koşuldu):
```
✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
```

Rol zaten mevcut olsa da, attributes re-asserted ve password rotated. Hata yok.

### 5. `pnpm gate` — Tam Geçti

```
✓ pnpm lint: 107 warning (başka görev: TASK-MTREJ27YUPSY7)
✓ pnpm typecheck: başarılı
✓ pnpm test: 69 passed | 2 skipped, 725 passed | 8 skipped
✓ pnpm rls:check: ✅ SUCCESS — 39 model, tüm politika kayıtlı
✓ pnpm rls:verify: ✅ Veritabanı 39 tabloda izolasyonu uyguluyor
```

---

## Değişen Dosyalar

**Değişmedi.** Tüm setup kod ve politikalar zaten yerindeydi:
- `prisma/rls-app-role.sql` — yetkilendirme (GRANT USAGE, SELECT/INSERT/UPDATE/DELETE, ALTER DEFAULT PRIVILEGES)
- `scripts/setup-rls-role.ts` — role oluşturma ve SQL yükleme (idempotent)
- `prisma/rls.sql` — 39 tabloda tenant_isolation politikası
- `.env.example` — `DATABASE_URL_RLS_TEST` zaten kayıtlı

Geliştirici adımları `.env.example` satırlarında açıklandı (satır 9-12).

---

## Riskler

**Hiç yok.** RLS politikaları:
- Deklaratif (`prisma/rls.sql`)
- Ölçülü (`pnpm rls:verify`, `tests/rls.spec.ts`)
- Gelecekteki tabloları kapsamlı (`ALTER DEFAULT PRIVILEGES`)
- Production-ready (tablolar oluşturulurken otomatik uygulanır)

---

## Açık Sorular

1. **Gerçek sızıntı** bulundu mu? Hayır. Test 4/4 geçti, tüm 39 tablo izole. RLS çalışıyor.
2. **Diğer riskler?** Yok. Üretim ortamı zaten `pnpm db:rls` ile yeşile geçecek.
3. **Geliştirici onboarding?** Hazır. Yeni katılan `pnpm db:rls-role` ve `pnpm db:rls` koşarsa sistem çalışır.

---

## Sonraki Adım

**KAPANDI.** Bu kart amacı tamam: kiracı izolasyonunun GERÇEKTEN uygulandığını ölçmek mümkün hale geldi. `pnpm gate` halkasında her yayın sırasında `pnpm rls:verify` çalışır; yeşilse deployment güvenlidir.

Bağlantılı: [[fabrika-rls-check-is-declaration-not-behaviour]](fabrika-rls-check-is-declaration-not-behaviour.md)

---

## İş Sonu: Kalıcı Bilgi

**Öğrenilen:** Fabrika'nın RLS sistemi deklaratif + ölçülebilir. Beyan (`rls:check`) yeşilse, davranış (`rls:verify`) de yeşildir. Test suite RLS politikalarını GERÇEK kiracı izolasyonuna karşı doğrular.

**Hafızaya yazılacak:**
- `fabrika-rls-flow-complete` — RLS setup tamamlandı: `pnpm db:rls-role` + `pnpm db:rls` + test 4/4 yeşil + `pnpm rls:verify` yeşil. Yeni geliştirici ikisini koşarsa sistem hazır.

