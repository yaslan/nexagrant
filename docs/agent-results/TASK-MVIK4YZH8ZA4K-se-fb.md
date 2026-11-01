# TASK-MVIK4YZH8ZA4K (FO-117) — crw2-fb bulgularının düzeltilmesi (B1, B2, B3)

**Hüküm:** BAŞARILI — B1 ve B2 düzeltildi ve doğrulandı; B3 kod değişikliği olmadan takip notu olarak bırakıldı. Testler 50/50, lint 0 hata, typecheck 0 hata. Admin action'ın istemciye dönen yanıtı değişmedi; guard testi değişmedi.
**Tip:** bug (düzeltme turu, incelemeden gelen bulgular)
**Dal:** `feat/partner-search-interreg` · İncelenen temel commit: `1a0e4a0b` · Girdi raporu: `docs/agent-results/TASK-MVIK4YZH8ZA4K-crw2-fb.md`
**Platform:** mac'te doğrulandı (macOS Darwin 27, zsh). Saf TS, CLI çıktısı ve statik test; platforma bağlı yol yok (süreç, dosya yolu, kabuk, izin kullanılmıyor). Windows ve Linux'ta koşulmadı: bu makinede yalnız mac var.

## Durum notu (önemli)
Çalışma ağacında B1 ve B2 değişiklikleri bu oturumdan ÖNCE zaten yapılmış ve commit edilmemişti (`M scripts/run-keep-eu-sync.ts`, `M src/lib/keep-eu-sync.ts`, `M tests/keep-eu-sync.test.ts`). Bu oturumda kodu yeniden yazmadım; diff'i okuyup her bulguyu doğruladım, sonra testleri ve gerçek CLI çıktısını koşup commit ettim.

## Yapılanlar

### B1 — CLI dry-run'da HTTP durumu (düzeltildi, doğrulandı)
- `src/lib/keep-eu-sync.ts` · `fetchKeepEuOpenData` dönüş tipine `status?: number` eklendi; HTTP hatasında `status: response.status` dönülüyor. Yorum: alan yalnız sunucu içi çağrılar için, action'a girmez.
- `scripts/run-keep-eu-sync.ts` · hata satırı artık `❌ keep.eu fetch failed: <kod> (HTTP <durum>)` yazıyor.
- `syncKeepEuData` `status` alanını taşımıyor; `actions.ts` değişmedi (`git diff` boş). İstemciye giden yanıt aynı.

**Gerçek dry-run çıktısı (sahte 500 ile):** keep.eu isteğine sahte `500 Internal Server Error` döndüren bir fetch preload'u (`NODE_OPTIONS=--import`, yalnız bu koşu için, depoya eklenmedi) ile:

```
Timestamp:        2026-10-22T15:34:20.728Z
Programmes:       305, 387, 385, 66
Dry Run:          YES (no table or vector writes)
RAG Embeddings:   ENABLED (OpenAI 1536-dim vector)
API Key Config:   Configured (in environment)
───────────────────────────────────────────────────────────────────────────────
Fetching live upstream data from keep.eu Open Data API...
❌ keep.eu fetch failed: upstream_error (HTTP 500)
```
Çıkış kodu: 1. Log: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/849052e8-3102-4003-81a1-51020e855d06/scratchpad/dryrun-500.log`

### B2 — 403 sync testi kod bazlı assert (düzeltildi)
- `tests/keep-eu-sync.test.ts` · `syncKeepEuData({ programmeIds: [305], apiKey: 'test-key' })` — artık ortamdaki `KEEP_EU_API_KEY`'e bağlı değil; `expect(res.upstreamError).toBe('forbidden')`.
- Ayrıca `fetchKeepEuOpenData` 500 testi `status: 500` içeren tam eşleşme assert ediyor.
- `syncKeepEuData`'ye `apiKey?: string` seçeneği eklendi (`KeepEuSyncOptions`), `fetchKeepEuOpenData`'ye iletiliyor.

### B3 — takip notu (kod değişmedi)
`client.tsx` `upstreamError` doluyken `syncResult`'ı atlıyor. Bu, `allowDatabaseFallback` action'a eklendiğinde yeniden indekslemenin sonucunu kullanıcıdan gizler. Bugün action bu seçeneği geçmiyor, yani tetiklenmiyor. Takip: `allowDatabaseFallback` action'a eklenirse UI `upstreamError` ile `syncResult`'ı birlikte göstermeli.

## Testler (ham çıktı)
```
perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run tests/api/api-error-body-guard.test.ts tests/keep-eu-sync.test.ts tests/admin-interreg-actions.test.ts
 Test Files  3 passed (3)
      Tests  50 passed (50)
   Start at  18:29:54
   Duration  27.62s
```
Not: komutun çıkış kodu pipe (`tail`) yüzünden yakalanamadı; ancak çıktıda 3/3 dosya ve 50/50 test geçti.

```
pnpm lint      → 0 error, 4 warning (hepsi değişmeyen dosyalarda: invitations/accept.ts, e2e fixtures, settings-profile-update.test.ts), exit 0
pnpm typecheck → tsc --noEmit, exit 0
```

## Değişen dosyalar
- `src/lib/keep-eu-sync.ts` — `status?: number` dönüşü, `apiKey` seçeneği
- `scripts/run-keep-eu-sync.ts` — HTTP durumlu hata satırı
- `tests/keep-eu-sync.test.ts` — 403 testi `apiKey` + `toBe('forbidden')`; 500 testi `status: 500`
- `docs/agent-results/TASK-MVIK4YZH8ZA4K-se-fb.md` — bu rapor

Değişmeyenler (kontrol edildi, `git diff` boş): `tests/api/api-error-body-guard.test.ts`, `src/app/[locale]/admin/interreg/actions.ts`, `messages/*.json`.

## Güvenlik değerlendirmesi
- Yeni `status` alanı yalnız sunucu içi dönüşte; action ve istemci sözleşmesi aynı kaldı, ham hata metni ya da HTTP metni istemciye gitmiyor.
- `apiKey` seçeneği yalnız sunucu tarafında çağrılıyor; env okuması hâlâ `src/lib/env.ts` üzerinden (`env.KEEP_EU_API_KEY` varsayılanı).
- CLI'nin HTTP durumu yazması hata gövdesini ya da anahtarı yazmıyor; yalnızca sayısal durum.

## Riskler
- B3 açık takip olarak duruyor; bugün tetiklenmiyor.
- Canlı keep.eu ile 401/403/200 davranışı koşulmadı; sahte 500 ile yalnız CLI yolu doğrulandı.
- UI akışı bu turda yeniden tıklanmadı (kart DoD'unda ekran görüntüsü bir önceki turda alınmıştı).

## Açık sorular
- Yok.

## Sonraki adım
1. Commit (`git commit -- <üç kaynak dosya + bu rapor>`); push yok, merge yok.
2. Kart `review`'a alınabilir; B3 takip notu olarak kalır.
