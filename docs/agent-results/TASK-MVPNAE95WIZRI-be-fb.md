# TASK-MVPNAE95WIZRI (FO-163) — /partners/leaders: oturum + M1 kapısı + hız sınırı, kota yok

**Hüküm:** TAMAM — istenen kapılar eklendi, testle ve canlı istekle kanıtlandı. Tek sapma: sınır aşımı HTTP 200 + hata mesajı olarak dönüyor (429 değil), aşağıda "Riskler".

## Ne yapıldı

1. **Mevcut kapı tablosu** (değişiklik öncesi, `partners/leaders/page.tsx`):

   | Kapı | Önce | Nerede |
   |---|---|---|
   | Oturum | var | `(app)/layout.tsx` — oturumsuz istek `/giris`'e 307 |
   | Kiracı kapsamı | dolaylı | `[workspace]/layout.tsx` (kapsam yoksa 404); `checkModuleAccess` `NO_TENANT` döner |
   | M1 modül kapısı | var, **eksik** | `moduleGate('M1')` yalnız `allowed` bakar; sınırlı (`limits`) M1 planı geçiyordu. `/api/cordis/*` ise bunu 403 yapar |
   | `can(...)` | yok | okuma sayfası, aksiyon yok |
   | Hız sınırı | **yok** | — |
   | Aylık kota sayacı | yok (doğru) | `meterPartnerSearch` yalnız `partners/page.tsx`'te; leaders'ta çağrılmıyor |

2. **Eklendi** — yeni mekanizma YAZILMADI; FO-160 yardımcısı kullanıldı:
   - `src/lib/cordis-api-auth.ts`: oturum dalı `authenticateCordisSession()` olarak dışa açıldı (davranış aynen; `authenticateCordisRequest` onu çağırıyor). Oturum dalı: 401 anonim, 403 M1 tam açık değil (sınırlı dahil), 429 + `Retry-After` `CORDIS_SESSION_PER_USER_PER_MINUTE` (60) aşımı — aynı `UserWindowLimiter` örneği, aynı sabit.
   - `partners/leaders/page.tsx`: `moduleGate('M1')`'den sonra `authenticateCordisSession()`; reddedilirse 401→`signInRequired`, 403→`limitedPlan`, 429→`rateLimited`, diğer→`loadFailed` mesajı. Kota sayacı eklenmedi.
   - `messages/tr.json`, `messages/en.json`: `PartnersLeaders` altına 3 anahtar (iki dilde).
3. **Testler**: `tests/partners-leaders-gate.test.tsx` (5 durum). Eski iki liderler sayfası testi (`partners-leaders-page-error`, `-money`) yeni kapıyı `authenticateCordisSession`'ı geçirerek taklit eder; veri yolunu test ediyorlar.
4. **docs/API.md**: CORDIS okuma yolları için not (kota yok; oturumda M1 tam açık; kullanıcı başına 60/dk).

## Kanıt (ham çıktı)

**Birim/hedefli testler** (`npx vitest run` — 11 dosya):
```
 Test Files  11 passed (11)
      Tests  82 passed (82)
```
skipped: 0 (hedefli koşularda). Yeni dosya + FO-160 testi + kota testi + i18n testleri dahil.

**Mutasyon** — `if (!access.authenticated)` → `if (!access.authenticated && false)` (kapı devre dışı):
```
× anonymous: refused before any lookup runs
× limited M1 plan: refused the way /api/cordis/* refuses it (403)
× past the per-user window: 429 message, the lookup is not run
Tests  3 failed | 2 passed (5)
```
Kapı geri konunca yeşil (`grep -c "&& false"` → 0).

**Lint / typecheck**: `npx eslint .` → 0 hata, 4 uyarı (dosyalar: `src/lib/invitations/accept.ts`, `tests/e2e/fixtures/concept-template-tenant.ts`, `tests/settings-profile-update.test.ts` — bu işte dokunulmadı). `npx tsc --noEmit` → exit 0.

**Canlı istekler** (yerel `next dev :3163`, kendi Postgres konteynerim pgvector/pg16 — `pnpm db:setup` temiz çıktı; konteyner sonra kaldırıldı):
```
anon  /tr/default/partners/leaders  → 307 → /tr/giris
anon  /en/default/partners/leaders  → 307 → /en/login
anon  /api/v1/partners/leaders      → 401
anon  /api/cordis/projects          → 401
alice@fabrika.test (M1 ON, oturumlu)
      /tr/default/partners/leaders  → 200  H1 "Kilit Ekosistem Liderleri (Merkeziyet Analizi)", 1 kart
      /en/default/partners/leaders  → 200  H1 "Key Ecosystem Leaders"
      62 ardışık istek              → 62×200; son sayfada alert:
                                      "Kısa sürede çok fazla sorgu yapıldı. Bir dakika sonra tekrar deneyin."
demo@usfinbridge.com (yeni org, M1 OFF) → 200, moduleGate: "Bu modül şu anda kullanılamıyor" (kapı çalışıyor)
Sayaç tabloları: PartnerSearchQuotaUsage 0→0, AiUsageLog 0→0 (62 istekten sonra)
```

**Platform beyanı**: macOS (darwin) üzerinde doğrulandı. Koda platforma bağlı yol yok (süreç, dosya yolu, ikili adı yok); Linux/Windows'ta aynı davranış beklenir — ancak koşulmadı.

## Değişen dosyalar

- `src/lib/cordis-api-auth.ts` (oturum dalı dışa açıldı; davranış aynı)
- `src/app/[locale]/(app)/[workspace]/partners/leaders/page.tsx`
- `messages/en.json`, `messages/tr.json`
- `tests/partners-leaders-gate.test.tsx` (yeni)
- `tests/partners-leaders-page-error.test.tsx`, `tests/partners-leaders-page-money.test.tsx` (gate mock)
- `docs/API.md`
- `docs/agent-results/TASK-MVPNAE95WIZRI-be-fb.md` (bu rapor)

## Riskler

- **HTTP durumu 200.** Sayfa render edildiği için sınır aşımı HTTP 429 değil, 200 + "rateLimited" uyarı bölümü. Next sayfa render'ından 429 dönemiyor; tam 429 için bir route handler gerekir. Kart "429 ya da eşdeğer" dediği için eşdeğer kabul edildi — karar lidere ait.
- **Sınır süreç-içi.** `UserWindowLimiter` çoklu örnekte limiti N katına çıkarır ve restartta sıfırlanır (FO-160'taki bilinen sınır). Sayfa ve `/api/cordis/*` aynı kullanıcı penceresini paylaşıyor.
- **Sınırlı plan canlı denenmedi.** Limited-M1 reddi yalnız birim testiyle kanıtlı (yerel seed'de limited M1 tenant'ı yok).
- **Bağımlılık.** Dal FO-160 (`be-fb/fo160-cordis-route-auth`, fe447522) üstünde; #178 çakışma düzeltmesi bitmeden birleşmez.
- **Kota sayacı canlıda boş tablolarla kontrol edildi** (0→0) — sayaç tabloları başlangıçta boş olduğu için bu kanıt zayıf; asıl kanıt `meterPartnerSearch`'in bu sayfada hiç import/çağrılmadığı ve testin `not.toHaveBeenCalled` ile sabitlenmesi.

## Açık sorular

- Sınır aşımında HTTP 429 mi, yoksa şimdiki 200 + mesaj mı isteniyor? (Route handler ile 429 mümkün.)
- Sonuç dosyası yolu: kart iki farklı yol veriyor (`/Users/macbook/alan/docs/agent-results/...` ve repo-göreli `docs/agent-results/...`). Bu rapor proje reposuna (`FONBRIDGE/docs/agent-results/`) yazıldı; workspace kökü bir git reposu değil. Kopya gerekiyorsa lider söylesin.

## Sonraki adım

Draft PR (dal FO-160 üstünde) açıldı/açılacak; PR gözden geçirmesi ve #178 çakışma düzeltmesi sonrası rebase. Merge/approve bu işte yok.
