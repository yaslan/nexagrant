# ADR-0007 — İlkadım pilotu ücretsiz deneme; ücretli satış ve e-Fatura pilot sonrası

- **Durum:** **KABUL**, patron kararı
- **Tarih:** 2026-09-29
- **Bağlam:** ADR-0004 (kamu segmenti önceliği, "pilot ücretsiz yürür"), `docs/kamu/ILKADIM-PILOT.md` (90 günlük pilot planı), ROADMAP "Pilot kapıları" (e) e-Fatura / GİB entegratörü (TASK-MTRJSOWFH6B45)
- **Kayıt kartı:** TASK-MUMABULM5KZX2 · **Uygulama kartı:** TASK-MUMABL78X5JLX (be-fb)
- **Hazırlayan:** CS-FB · **Karar veren:** patron

## Bağlam

ROADMAP "Pilot kapıları" tablosunda (e) e-Fatura / GİB entegratörü, İlkadım pilotu başlamadan kapanması gereken kapılar arasındaydı. Oysa ADR-0004 ve pilot planı zaten "pilot ücretsiz yürür" diyordu. Ücretsiz bir pilotta fatura kesilmez; e-Fatura yalnız ücretli satışın ön koşuludur. Bu yüzden (e) pilotu gereksiz yere bekletiyordu.

## Karar

1. İlkadım Belediyesi pilotu **ücretsiz deneme** olarak yürür: **90 gün**, **Ekip planı** yetkileri, **6 koltuk**.
2. Pilotun kapsamı: **davet koduyla kayıt** (B1), **Fon Hazırlık Karnesi** (`/fon-hazirlik`) ve **belediye çağrı radarı** (`/belediye-cagrilari`).
3. Pilot süresince ödeme alınmaz, fatura kesilmez, e-Fatura gerekmez.
4. **Ücretli satış** (yıllık TL kamu paketi) ve **e-Fatura / GİB entegrasyonu** pilot sonrasına kalır. e-Fatura işi (TASK-MTRJSOWFH6B45) pilot kapısı değildir; **ücretli satış kapısıdır**.

## Sonuçlar

- **ROADMAP:** (e) "Pilot kapıları" tablosundan çıkar, yeni "Ücretli satış kapısı" bölümüne taşınır. Pilotu kiracıya atama işi tabloya satır olarak eklenir (TASK-MUMABL78X5JLX).
- **Ürün:** Platform yöneticisi bir kiracıya 90 günlük Ekip planı pilotu atar. Süre dolunca kiracı salt-okunur olur. Bu akışta ödeme ve e-Fatura adımı yoktur (TASK-MUMABL78X5JLX).
- **Satış:** Pilot sonrası fiyat, `ILKADIM-PILOT.md` §6.2'deki patron onaylı kamu paketlerinden verilir. Ücretli geçiş tarihi, e-Fatura canlıya alınmadan verilmez.
- **Risk:** Pilot biterken e-Fatura hazır değilse belediye ücretli pakete geçemez. Salt-okunur dönem bu boşluğu kapatır; veri silinmez. Öneri (karar değil): e-Fatura kartı pilotun ilk haftalarında başlatılsın.
- **Değişmeyen:** ADR-0004'teki segment kararı ve ADR-0006'daki giriş yöntemi aynen geçerlidir.
