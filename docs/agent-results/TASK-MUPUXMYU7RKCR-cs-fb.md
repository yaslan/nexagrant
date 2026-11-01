# TASK-MUPUXMYU7RKCR — FB PİLOT P-7: haftalık görüşme Pazartesi 15:00 Europe/Istanbul

**Hüküm: TAMAM.** Dal `cs-fb/p7-monday-1500` (worktree `../FONBRIDGE-wt-csfb-p7`, kaldırılmadı), commit `7ed3f53e`, push yok.
**Platform:** macOS (darwin) üzerinde doğrulandı. Kod yolu platformdan bağımsız (saf TS/Intl, dosya yolu/kabuk yok); Windows/Linux koşulmadı — gerek yok, `Intl` IANA tz verisi Node'da aynı.

## 1. Ne yapıldı
- `src/lib/beta/constants.ts`: `BETA_CHECKIN_TZ` → `Europe/Istanbul` (Pzt 15:00 zaten weekday=1/hour=15); "Brüksel/E11 vs Perşembe" çelişki yorumu "P-7 karara bağlandı" olarak yeniden yazıldı. `checkin-schedule.ts` başlık yorumu ve `scripts/beta-onboarding.ts` (flag varsayılanı + çelişki notu) hizalandı.
- `docs/BETA_GUIDE.md` / `.en.md`: başlık ve ritim satırı Pazartesi 15:00–15:45 (Istanbul); hafta 5-8 tarihleri 10-05 / 10-12 / 10-19 / 10-26 (beta 09-07 Pazartesi başladı → hafta N Pazartesisi; beta 11-01'de biter, çakışma yok; fiyat atölyesi 10-22 hafta 7 içinde kalır).
- `docs/beta/beta-weekly-sync.ics`: yalnız hafta 5-8 Pzt 15:00-15:45 TZID=Europe/Istanbul; UID'ler sabit, `DTSTAMP:20261001`, `SEQUENCE:1` eklendi. Kickoff + hafta 1-4 (geçmiş/bugün) dokunulmadı. CRLF korundu. Haftalık RRULE yok (8 tekil olay) — `BYDAY=MO` gerekmedi.
- `docs/beta/SSS-PILOT.md`: G4 ve P-7 satırı "Pazartesi 15:00 Istanbul" olarak kapatıldı (TR+EN).
- `tests/beta/checkin-schedule.test.ts`: Brüksel beklentileri yeni varsayılana göre güncellendi; DST regresyon testi açık Brussels slotuyla korundu (test gevşetilmedi, kapsam aynı).

## 2. Kanıt
- `git grep -n -i -E 'çarşamba|wednesday|brussels' -- src/lib/beta scripts/beta-onboarding.ts docs/BETA_GUIDE.md docs/BETA_GUIDE.en.md docs/beta` → 0 satır (exit 1). (Repo genelinde Brussels, çağrı son tarihleri/M9 için meşru kullanımda kalıyor; kapsam dışı.)
- `npx vitest run tests/beta` → `Test Files 7 passed (7) · Tests 97 passed (97)`. (Kartın `src/lib/beta` yolunda test yok: "No test files found"; testler `tests/beta/` altında.) İlk koşuda 3 test eski Brüksel beklentisiyle kırmıştı → yukarıdaki şekilde güncellendi.
- `.ics` ayrıştırma (python zoneinfo, Europe/Istanbul):
  `week04 Thu 2026-10-01 14:00 +0300` (değişmedi) · `week05 Mon 2026-10-05 15:00 +0300` · `week06 Mon 2026-10-12 15:00 +0300` · `week07 Mon 2026-10-19 15:00 +0300` · `week08 Mon 2026-10-26 15:00 +0300`.
- `npx tsc --noEmit` → çıktı yok, exit 0.
- `scripts/beta-onboarding.ts` .ics'i `buildCheckinSchedule`/`DEFAULT_CHECKIN_SLOT` üzerinden üretir (constants'tan): test 'emits … UTC' `DTSTART:20260907T120000Z` ve `20261026T120000Z` (=15:00 +03:00) geçiyor.

## 3. Değişen dosyalar
docs/BETA_GUIDE.md, docs/BETA_GUIDE.en.md, docs/beta/beta-weekly-sync.ics, docs/beta/SSS-PILOT.md, scripts/beta-onboarding.ts, src/lib/beta/checkin-schedule.ts, src/lib/beta/constants.ts, tests/beta/checkin-schedule.test.ts.

## 4. Riskler / notlar
- Hafta 4 (bugün, Perşembe) ile hafta 5 (Pzt 10-05) arası 4 gün: partnerlere değişiklik duyurusu gerekir; `SEQUENCE:1` bazı istemcilerde güncellemeyi tetikler, **davranış denenmedi (varsayım)**. Zaten dağıtılmış eski .ics'ler partnerlerde Perşembe'yi gösterir.
- Toplantı bağlantısı: `.ics`te `LOCATION:Online`, bağlantı yok. `BETA_MEETING_URL` varsayılanı hâlâ `meet.google.com/fabrika-beta-checkin`; `eio-ftwm-wak` dev'de yok (`git grep` boş) → dokunulmadı. fe-fb dalı dev'e girince `constants.ts`/env tutarlılığı kontrol edilmeli.
- `scripts/beta-pricing-survey.ts` atölye varsayılanı 2026-10-22 (Perşembe) — hafta 7 senkronu artık Pzt 10-19; atölye ayrı etkinlik olarak 10-22'de kalıyorsa sorun yok, aynı gün sanılıyorsa karar gerekir.
- `docs/beta/weekly-sync-template.md` kapsam dışı bırakıldı (gün/saat içermiyor).

## 5. Açık sorular
- Pilot (İlkadım) için ayrı .ics daveti hazır mı (SSS E7 notu) — P-7'nin kalan yarısı.
- Hafta 5 Pzt 10-05 mi, yoksa 10-12'den başlayıp bir hafta kaydırmak mı (crw-fb raporu 10-12…11-02 önermişti; ben hafta hizalı Pazartesileri seçtim, beta bitişi 11-01 ile uyumlu).

## 6. Sonraki adım
İnceleme → dev'e merge; partnerlere Pazartesi duyurusu + yeni .ics; `BETA_MEETING_URL` kararı.
