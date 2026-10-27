---
görev: TASK-MVC4JRKUKYPLU
kod: FO-41
ajan: be-fb
pr: 178
dal: be-fb/fo41-packaging
head: da2f3885 (yerel, PUSH EDİLMEDİ)
önceki_head: 234aee54 (origin'de hâlâ bu)
merge: 16d59567 (origin/dev 06e32fe9 birleştirildi)
hüküm: FAIL — pnpm gate KIRMIZI, push YOK
platform: mac (Darwin 27). Windows/Linux koşulamadı (bu makinede yok); kod yolu platforma bağlı değil (katalog, entitlement, SQL, sayfa).
tarih: 2026-10-27
---

# FO-41 · PR #178 fix-4 (be-fb) — FAIL

**Hüküm: FAIL.** B1 (dev çakışması) çözüldü; Ö-A/Ö-B/Ö-C işi tamam. Ama
`pnpm gate` kırmızı kaldı (son koşu: 14 dosya, 94 test başarısız). Kırmızıyken
push yapılmadı, `--no-verify` ve force kullanılmadı. origin'deki dal hâlâ
`234aee54`.

## Ne yapıldı

1. **B1 · dev merge (bloke):** `origin/dev` (06e32fe9) ile merge edildi, merge
   commit `16d59567`. Tek çakışma `prisma/migrations/apply-order.txt`; iki satır da
   tutuldu, sıra: `drop-blog-read-time.sql`, ardından `module-state-grandfathered.sql`.
   Çakışma dışında hiçbir dosya elle değiştirilmedi.
   - İlk commit denemesi pre-commit tsc'de düştü (`src/lib/blog.ts` `number | null`).
     Sebep: `node_modules`'taki Prisma client eski (nullable) şemadan üretilmişti.
     `pnpm db:generate` sonrası typecheck temiz; merge kodu değişmedi.
2. **Ö-B · TTO Edition kota yedeği:** `tests/partner-search-api.test.ts` katalog
   bloğuna `expect(partnerSearchGrant('tto-edition', true)).toEqual({ queriesMonthly: 10, export: false })`.
3. **Ö-C · canlı sekme çift sayım:** `tests/partners-page-search-quota.test.tsx`'e
   `render({ tab: 'live', q: 'x' })` → `meterPartnerSearch` çağrılmıyor. Canlı sekme
   bileşenleri (`AnnouncementBrowser`, `ActiveAnnouncementsBadge`) bu testte mock'landı
   (render için gerekli; sunucu tarafı sayaç testi değiştirilmedi).
4. **Ö-A · karar yazıldı, karar VERİLMEDİ:** `docs/ROADMAP.md` "Açık kararlar" 25. madde
   (`TASK-MVCH2R3VSLAJN`'e bağlı). Kod ve `docs/BILLING.md` değişmedi.
5. **Ö-D:** sayaç SQL'i ve `quotaMonth` iki kopyası bu işte YOK — **ayrı iş**.

## Mutasyon kanıtı (Ö-B / Ö-C testleri gerçekten tutuyor mu)

Hedefli koşu: `tests/partner-search-api.test.ts` + `tests/partners-page-search-quota.test.tsx`
→ **43/43 geçti** (yeni testlerle).

| Mutasyon | Sonuç |
|---|---|
| MA: `partnerSearchGrant` TTO yedeği (`?? moduleLimitsFor(planId,'M1')?.partnerSearchPerMonth`) kaldırıldı | `1 failed | 42 passed` — yakalandı |
| MC: `hasCriteria && !liveTab` → `hasCriteria` (çift sayım) | `1 failed | 42 passed` — yakalandı |

Her mutasyondan sonra `git checkout --` ile kaynak geri alındı; `git status` yalnızca
test dosyalarını gösteriyor.

## Gate (pnpm gate, izole DB)

Ortam: `be-fb-fix4-pg` konteyneri (`pgvector/pgvector:pg16`, 127.0.0.1:5744, DB `fabrika`).
Parolalar repo dışında 600 izinli `$HOME/.fix4-env.sh`'da. Paylaşılan DB'ye dokunulmadı.

- `prisma db push --url <izole>` → sync.
- `scripts/apply-migrations.sh` **iki kez** → ikisi de exit 0, "58 files applied as fabrika",
  hata yok (idempotency).
- `pnpm db:rls` → "Policies in public: 30 → 117".
- `pnpm db:seed` → "Seeding completed"; konteynerde Tenant=1, politika=117 doğrulandı.
- `pnpm db:rls-role` → `fabrika_app` mevcut.

Üç gate koşusu, hepsi `GATE_EXIT=1`:

| Koşu | Koşulan ayar | Test dosyası (başarısız) | Test (başarısız / geçen / atlanan) |
|---|---|---|---|
| 1 | `CI=true` (benim hatam), app rolü yok | 50 | 37 / 5179 / 302 |
| 2 | `CI` kaldırıldı, rls-role hazır | 35 | 35 / 5168 / 407 |
| 3 (son) | + `DATABASE_URL_RLS_TEST` izole rol | 14 | 94 / 5430 / 147 |

Koşular arasında sayılar oynak; kök neden tam kanıtlanmadı. Son koşuda en çok
başarısız dosyalar: `invitation-accept.live` (15), `agency-invite.live` (15),
`system-scope.live` (12), `blog-posts.live` (10), `agency-funnel.live` (10),
`oauth-registration.live` (7), `agency-report.live` (5).

**Düzelttiklerim:**
- `CI=true` env'den kaldırıldı. Yerel gate'te bu, DB'siz canlı testleri atlamak yerine
  "refusing to skip in CI" ile düşürüyordu (koşu 1).
- `fabrika_app` parolası kendi konteynerimde yeniden belirlendi, `DATABASE_URL_RLS_TEST`
  export edildi. Sonuç: `rls.spec.ts`, `plan-storefront.spec.ts`,
  `plan-visibility-rls.spec.ts`, `setup-rls-role.live.test.ts` → **28/28 geçti**.

**Kalan kırmızılar (kanıt durumu):**
- `cron-tenant-scope.test.ts` (11 test): `ECONNREFUSED 127.0.0.1:5672`. Repo'da 5672'ye
  bağlanan kod/config bulunamadı (grep boş). Dış bir broker bekleniyor; bu makinede yok.
  **Doğrulanmadı:** kaynağı henüz bulunamadı.
- `api-error-body-guard.test.ts`: 30 sn zaman aşımı (51 sn). Yük altında yavaş olabilir;
  DB ile ilişkisi kanıtlanmadı.
- Canlı dosyaların çoğu (`agency-*`, `invitation-accept`, `system-scope`, `blog-posts`…)
  Prisma bağlantı/istek hatasıyla düşüyor. Bunların ortam mı (izole DB'deki veri/rol/
  seed) yoksa mevcut koddan mı kaynaklandığı **kanıtlanmadı**.

**Ayırt etmek için gereken:** `origin/dev` (06e32fe9) üzerinde aynı izole ortamda aynı
gate'in koşulması. Bu koşu yapılmadı (ayrı worktree + gate kilidi gerekir).

## Değişen dosyalar

- `prisma/migrations/apply-order.txt` (çakışma çözümü, merge `16d59567`)
- `tests/partner-search-api.test.ts` (+3)
- `tests/partners-page-search-quota.test.tsx` (+10: test + 2 mock)
- `docs/ROADMAP.md` (+1: Açık kararlar madde 25)
- Merge `16d59567` ayrıca dev'den gelen değişiklikleri içeriyor (blog read-time drop,
  partner-search admin, expert-prereg vb.); bunlar bu işin kodu değil.

## Riskler

1. **Push yok:** PR #178 origin'de hâlâ `234aee54` (CONFLICTING). Gate yeşil olmadan merge
   edilemez.
2. **Kırmızı gate'in kaynağı belirsiz:** 94 başarısızlık, koşular arası oynuyor. Bu,
   izole ortamın kararsız olduğunu ya da bir testin zamanlamaya bağlı olduğunu düşündürüyor.
3. **`.env` okunamadı:** `.env` içeriği ve değişken adları okuma izni reddedildiği için
   incelenmedi. `db:rls-role` bu dosyaya yazdı (gitignore'da, `.gitignore:35`). İzolasyon,
   export edilen env'in dotenv'i geçmesi ve konteynerdeki satır sayılarıyla doğrulandı.
4. Canlı DB'de grandfathered tenant sayısı ölçülmedi (canlı DB erişimi yok).
5. Merge commit'i dev'den gelen içerik taşıyor; FO-41 dışında ek değişiklik var.

## Açık sorular

- Gate kırmızısının kök nedeni: `origin/dev` baseline'ı aynı izole ortamda koşulsun mu?
  (Karar: ben koşarım, öneri: evet, ayrı worktree ile.)
- RabbitMQ (5672): cron testleri için yerel broker mı kurulacak, yoksa test ortamı mı
  düzeltilecek? Bu ortam kararı lidere ait.
- Ö-A (Basic + M1 eklentisi çelişkisi) karara bağlanacak mı? (`TASK-MVCH2R3VSLAJN`)

## Sonraki adım

1. Gate kırmızısının kaynağını ayır: `origin/dev` baseline'ını izole ortamda koş; aynı
   başarısız test listesi çıkarsa ortam kaynaklıdır ve PR ile ilgisiz; çıkmazsa
   yalnızca bu PR'ın getirdiği başarısızlıkları düzelt.
2. Cron testleri için RabbitMQ kararını ver (veya test ortamını düzelt).
3. Gate yeşil olunca: `git push origin be-fb/fo41-packaging` (force yok, `--no-verify` yok).
4. Push sonrası `git merge-tree --write-tree origin/dev HEAD` temiz olduğunu tekrar göster,
   ardından crw2-fb delta incelemesi.
5. Ö-D ayrı iş olarak açılacak.
