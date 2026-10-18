---
sözleşme: 3
görev: TASK-MVDWV6Y3WCC1E
kod: FO-89
ajan: be-fb
motor: claude-haiku-5-5
tip: test
okur: lider
hüküm: Bitti: FO-81 API anahtarı iptali için kiracılar arası izolasyon testi eklendi (tekli + toplu iptal, B anahtarları durur, /api/v1 200, A için audit yok). Mutasyon kontrolü kırmızı→yeşil doğrulandı; pnpm gate exit 0.
platform: mac (darwin 27.0). Test ve sunucu yolu platforma bağlı değil; Windows/Linux koşulmadı (gerek yok).
sürüm: be-fb/fo89-api-key-cross-tenant, origin/dev 138d5a1c tabanı
tarih: 2026-10-18
---

# TASK-MVDWV6Y3WCC1E (FO-89) — FO-81 API anahtarı iptali: kiracılar arası izolasyon testi

## Ne yapıldı

- `tests/e2e/api-keys-revoke-locked.spec.ts` içine yeni `describe` ("one tenant cannot withdraw another tenant's keys (FO-89)") eklendi. Tek test, iki kiracı (A = `fo81-e2e-tenant`, sahibi oturum açar; B = `fo89-e2e-other-tenant`).
- Akış: A'nın sahibi gerçek sayfada kendi anahtarına tıklar; bu tıklamanın gönderdiği `revokeApiKey` server action isteği `waitForRequest` ile yakalanır (probe deseni). Aynı istek, gövdedeki A id'si B id'siyle değiştirilerek tekrar oynatılır: önce tekli (b1), sonra toplu döngü gibi (b1, b2) sırayla.
- Doğrulamalar: B'nin iki anahtarı DB'de duruyor (count 2); `auditEvent` (A kiracısı, `apiKey.revoked`, hedef b1/b2) 0; kontrol olarak A'nın kendi anahtarı için audit 1; B anahtarı `/api/v1/partners` ile 200 (M1 B için ON).
- Listeleme (DoD 2): aynı testte, A'nın kilit ekranı panelinde B'nin anahtar adı ve id'si yok.
- `setM1` ve `seedKey` yardımcılarına isteğe bağlı `tenantId` parametresi eklendi; mevcut çağrılar değişmedi. `seedKey` artık `rawKey` de döndürüyor (B'nin anahtarını /api/v1'de denemek için).
- Kod değişikliği YOK (uygulama kodu dokunulmadı; mutasyon denemesi sonrası `actions.ts` `git checkout` ile geri alındı).

## Mutasyon kontrolü

`src/app/[locale]/(app)/[workspace]/settings/api-keys/actions.ts` içinde `revokeApiKey`'deki `deleteMany({ where: { id: keyId, tenantId } })`, `tenantId` çıkarılarak `where: { id: keyId }` yapıldı; yeni test çalıştırıldı:

```
✘  API keys — one tenant cannot withdraw another tenant's keys (FO-89) › the owner of A revokes B's keys ...
Expected: 2
Received: 0
  > 263 | expect(await prisma.apiKey.count({ where: { id: { in: [b1.id, b2.id] } } })).toBe(2);
1 failed
```

Mutasyon geri alındı (`git checkout -- actions.ts`); `git status` yalnız test dosyasını gösteriyor. Yeşil sonuç aşağıda.

**Gözlem:** Bu mutasyonda B'nin anahtarları gerçekten silindi; yani e2e'de kullanılan DB rolü satır-seviyesi güvenlik (RLS) ile B'yi korumadı. Üretim rolünde durum ayrıca doğrulanmadı; test yalnız uygulama katmanındaki `tenantId` koşulunu ölçüyor.

## Kanıt (ham çıktı)

```
E2E_PORT=3110 pnpm exec playwright test tests/e2e/api-keys-revoke-locked.spec.ts
  ✓ 1 … owner creates a key, M1 closes … (FO-81)           4.8s
  ✓ 2 … owner revokes all keys at once, in English … (FO-81)  1.2s
  ✓ 3 … a member sees the active keys but no revoke control … 730ms
  ✓ 4 … API keys — one tenant cannot withdraw another tenant's keys (FO-89) … 1.4s
  4 passed (18.3s)            ← 0 skipped

pnpm exec eslint tests/e2e/api-keys-revoke-locked.spec.ts   → 0 bulgu (exit 0)
pnpm typecheck                                              → tsc --noEmit, exit 0
vitest tests/modules/api-keys.test.ts tests/server-action-missing-id.test.ts
  Test Files 2 passed (2) · Tests 45 passed (45)

E2E_PORT=3110 pnpm gate   (tam kapı, --no-verify yok)
  lint: 0 error (4 warning, mevcut) · typecheck ✓ · vitest: Test Files 359 passed | 7 skipped
  Tests 4764 passed | 120 skipped · i18n:check ✓ · rls:check/bypass-check/verify ✓
  e2e: 371 passed, 10 skipped (8.7m) · GATE_EXIT=0
```

## Değişen dosyalar

- `tests/e2e/api-keys-revoke-locked.spec.ts` (+105 / −6)
- `docs/agent-results/TASK-MVDWV6Y3WCC1E-be-fb.md` (bu rapor)

## Riskler ve açık noktalar

- Toplu iptal sıralı ve atomik değil (FO-81 raporunda zaten yazılı); güvenlik etkisi yok, test bunu değiştirmez.
- Yukarıdaki RLS gözlemi: uygulama katmanındaki kiracı koşulu tek savunma gibi görünüyor. Bu bir açık değil ama test rolü RLS'i atlıyor olabilir; ayrı bir kart olarak incelenmesi önerilir.
- Ortam yan etkisi: worktree'de `node_modules` ilk başta ana ağaca symlink'lendi; `pnpm exec` bu symlink üzerinden ana ağacın `node_modules`'ünü günceller etti (next 16.3.4 → 16.3.8, `@tiptap/*`, `eslint-config-next` sürüm değişimi). Symlink kaldırıldı, worktree'ye ayrı kurulum yapıldı. Ana ağacın (`/Users/macbook/alan/FONBRIDGE`) `node_modules` durumu bu yüzden değişmiş olabilir; lider bilmeli.
- Patronun `:3000` sunucusuna dokunulmadı; tüm e2e `E2E_PORT=3110` ile koştu. İlk gate denemesi `E2E_PORT` verilmeden başlatıldığı için e2e'ye gitmeden durduruldu (süreç yalnız kendi worktree'siydi).

## Açık sorular

Yok.

## Sonraki adım

PR açıldı (base `dev`); kart `review`. Lider onayından sonra merge.

## Definition of Done

- [x] Tekli + toplu iptal ve listeleme için kiracılar arası test
- [x] Mutasyon kontrolü kırmızı→yeşil (kırmızı: yukarıda; yeşil: 4 passed)
- [x] Testler + gate temiz (`E2E_PORT=3110 pnpm gate` exit 0), PR açık
- [x] Platform beyanı: sunucu + web, mac
