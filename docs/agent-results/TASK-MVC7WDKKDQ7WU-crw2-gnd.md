# TASK-MVC7WDKKDQ7WU (FO-47) — PR #137 kod incelemesi

**HÜKÜM: ONAY** (bloke eden bulgu yok)

PR: #137 `fe-gnd/fo47-e2e-constants` → `dev`, commit `5dd3628a`, yazar yaslan. Değişiklik: `tests/e2e/expert-prereg.spec.ts` (+44 satır, yalnız bu dosya).

## Ne yapıldı

- Kartı (`get_task`) okudum. Repo kuralları `CLAUDE.md` ile kontrol edildi.
- Diff'i okudum: spec artık `FOUNDER_SEAT_LIMIT` ve `VERIFY_TOKEN_TTL_MS`'i `constants.ts`'ten import ediyor.
- Mesajları doğruladım. `messages/tr.json` ve `messages/en.json` içindeki `ExpertPrereg` metinleri, spec'in beklediği metinlerle birebir eşleşiyor.
- PR başını (`git archive`) ayrı bir dizine çıkardım. Ana worktree ve ortak DB'ye dokunmadım.
- Limit ve süre değerlerini geçici mutasyonla kırmızıya düşürdüm. Mutasyonlar yalnızca ayrı kopyada yapıldı. Kopya PR başıyla birebir aynıya geri alındı.

## Kanıt

Ortam: mac, Chromium, izole DB (pgvector/pg16 konteyneri, 127.0.0.1:55847), boş port 51325. Ortak Postgres (5433) ve :3000 kullanılmadı. Mailpit (1025/8025) CI gibi paylaşıldı.

| Koşu | Sonuç |
|---|---|
| PR başı, temiz (sıcak önbellek) | 7 passed, 0 failed, 0 skipped |
| PR başı, ilk soğuk koşu | 6 passed, 1 failed (kayıt testi, başarı başlığı görünmedi), tekrar koşunca geçti |
| `limit` + `hours` mutasyonu (tüm spec) | Kırmızı: kurucu şerit `ExpertPrereg.hero.founder_open` ham anahtarını gösterdi; "The first 100 sign-ups" beklendi. Kayıt testinde ham anahtar kontrolü düştü. |
| Yalnız `hours` mutasyonu (İngilizce test) | Kırmızı, spec satır 288: `valid for 24 hours` beklendi, sayfada `ExpertPrereg.verified.text_expired` göründü |
| Mutasyon geri alındı | Dört dosya PR başıyla birebir aynı (`diff` boş) |
| `pnpm typecheck` (temiz kopya) | Exit 0 |
| eslint (spec dosyası) | Exit 0 |

Spec içinde sabit `100` veya `24` yok (`grep -n -E '\b(100|24)\b'` boş).

Not: `limit` mutasyonunda 1. test 60 saniyelik zaman aşımına takıldı. Bu bir assert sonucu değil, sayılmadı.

## Değişen dosyalar

- Bu incelemede kod değiştirilmedi. PR'a commit atılmadı, merge edilmedi.
- Yalnız bu sonuç dosyası eklendi.

## Riskler

- **Öneri (düşük):** Kadro dolduğunda (`founder_full`) spec şerit limit kontrolünü atlıyor, sadece bir annotation yazıyor. Meta açıklamadaki limit kontrolü yine çalışıyor, o yüzden limit regresyonu yakalanıyor. Kabul edilebilir.
- **Öneri (düşük):** `toContainText('24 saat')` ve benzeri kontroller "124 saat" gibi metinleri de kabul eder. Zararsız.
- **Ortam (PR dışı):** `src/lib/db.ts:68` içinde bağlantı zaman aşımı 1000 ms. Soğuk dev derlemesinde kayıt testi bununla düştü. Bu PR'ın kusuru değil, ancak CI'da da benzer bir yavaşlık olursa aynı belirti çıkabilir.

## Açık sorular

- Kart "Bu işin projesi: giftanddate" diyor, ama görev metni ve kart FONBRIDGE'i açıkça hedefliyor. FONBRIDGE üzerinde çalıştım.
- Platform: yalnız mac/Chromium koşuldu. Safari, Firefox, Windows ve Linux koşulmadı. Değişiklik yalnız test dosyası olduğu için platforma bağlı kod yolu yok.
- `pnpm lint` repo geneli çalıştırılmadı, yalnız spec dosyası için eslint çalıştırıldı.
- Repo migration'ları (`prisma migrate dev`) boş DB'de `FollowupDoc` hatasıyla düşüyor. CI `db push` + sıralı migration kullanıyor. Bu PR ile ilgisiz, ayrı bir not olarak kalsın.

## Sonraki adım

PR #137 dev'e merge edilebilir. Merge kararı ve merge işlemi bu incelemenin kapsamında değil.
