---
sözleşme: 3
görev: TASK-MVDWV6Y3WCC1E
kod: FO-89
ajan: crw2-fb
tip: inceleme
okur: lider
hüküm: ONAY — PR #111 (head 88d4e456) birleşebilir. Bloke eden bulgu yok. Test iki kiracıyla tekli + toplu iptali ve listelemeyi gerçekten sınıyor; mutasyon bende de kırmızı; diff yalnız test + rapor. RLS gözlemi yeni bulgu değil (Açık karar #16). Ayrı uyarı: ana ağacın node_modules'ünde next 16.3.8 var, lockfile 16.3.4 istiyor (be-fb'nin bildirdiği yan etki doğrulandı).
platform: mac (darwin 27.0). Test yolu (Playwright + Prisma + server action) platforma bağlı değil; Windows/Linux koşulmadı, gerek yok.
sürüm: be-fb/fo89-api-key-cross-tenant @ 88d4e456 (taban origin/dev 138d5a1c)
tarih: 2026-10-18
---

# TASK-MVDWV6Y3WCC1E (FO-89) inceleme — PR #111

## Ne yapıldı
`88d4e456`'yı kendi worktree'mde (`FONBRIDGE-wt/crw2-fo89`, ayrık HEAD) kurdum. `.env*` dosyalarını açmadan `cp` ile kopyaladım ve `pnpm install --frozen-lockfile` koştum. Spec'i `E2E_PORT=3127` ile koştum, `revokeApiKey` mutasyonunu kendim uygulayıp geri aldım, test sonrası kalan veriyi DB'de saydım. Kod değiştirmedim. Patronun :3000 sunucusuna (pid 18344) dokunmadım.

## Kontrol listesi

| # | Kontrol | Sonuç |
|---|---|---|
| 1a | İki ayrı kiracı | ✓ A = `fo81-e2e-tenant` (oturum sahibi), B = `fo89-e2e-other-tenant` (ayrı tenant + `pro` aboneliği, M1 ON) |
| 1b | Probe deseni | ✓ A'nın kendi anahtarına gerçek tıklama yapılıyor. `waitForRequest` gövdesinde `own.id` olan `next-action` POST'unu yakalıyor. Aynı action-id, başlıklar ve oturumla `body.replace(own.id, b.id)` tekrar oynatılıyor. Yakalama koşulu gövdede `own.id`'yi şart koştuğu için `replace` boşa düşemez, yani sessiz yeşil olmuyor. |
| 1c | Tekli + toplu | ✓ Tekli: b1. Toplu: `[b1, b2]` döngüsü. Bu sadakatli bir taklit: `revoke-panel.tsx:41` ve `client.tsx:92` "hepsini iptal et"i id başına `revokeApiKey` çağırarak yapıyor, ayrı bir toplu action yok (`actions.ts` "one revoke path"). |
| 1d | B DB'de duruyor | ✓ `apiKey.count({id in [b1,b2]}) === 2` |
| 1e | B `/api/v1`'de 200 | ✓ `GET /api/v1/partners` + `x-api-key: b1.rawKey` → 200. Uç noktanın gerçekten kimlik doğruladığını FO-81 testi gösteriyor (iptal edilen anahtar reddediliyor). |
| 1f | A'da B'ye ait audit yok | ✓ `auditEvent{tenantId:A, apiKey.revoked, target in [b1,b2]}` = 0. Kontrol olarak A'nın kendi anahtarı için 1: probe gerçek iptal yoluna ulaşıyor. |
| 1g | Listelemede B yok | ✓ M1 OFF kilit ekranında panelde `FO-89 other key` yok, sayfa gövdesinde `b1.id` yok |
| 2 | Mutasyon kırmızı | ✓ Bende de kırmızı (ham çıktı aşağıda) |
| 3 | Uygulama kodu değişmedi | ✓ `gh pr view 111 --json files`: yalnız `tests/e2e/api-keys-revoke-locked.spec.ts` (+105/−6) ve be-fb raporu |
| 4 | Kendi verisini temizliyor | ◐ Anahtarlar ve kimlik temizleniyor. Kiracı, abonelik, ModuleState ve audit satırları kalıyor (Ö-2'ye bakın, bloke etmiyor). |
| 5 | RLS gözlemi | Bilinen durum, yeni bulgu değil (aşağıda) |

## Kanıt (ham çıktı)

Yeşil, HEAD 88d4e456:
```
E2E_PORT=3127 pnpm exec playwright test tests/e2e/api-keys-revoke-locked.spec.ts --reporter=list
  ✓ 4 [chromium] › … one tenant cannot withdraw another tenant's keys (FO-89) › … (1.3s)
  4 passed (13.8s)          ← skipped satırı yok: 0 skipped
```

Mutasyon: `actions.ts` `deleteMany({ where: { id: keyId } })` (tenantId çıkarıldı)
```
  ✓ 1 … (FO-81) owner creates a key …            ✓ 2 … revokes all …    ✓ 3 … member …
  ✘ 4 … (FO-89) the owner of A revokes B's keys … (1.3s)
    Expected: 2
    Received: 0
    > 263 |     expect(await prisma.apiKey.count({ where: { id: { in: [b1.id, b2.id] } } })).toBe(2);
  1 failed
  3 passed (11.0s)
git checkout -- actions.ts ; git status --short   → (boş)
```
Mevcut üç FO-81 testi mutasyonu yakalamıyor, yeni test yakalıyor. K-1 boşluğu kapandı.

Test sonrası DB'de kalan veri (iki kiracı için):
```
{ tenants: 2, subs: 2,
  modState: [ fo81-e2e-tenant OFF, fo89-e2e-other-tenant ON ],
  keys: 0, audit: [ fo81-e2e-tenant: 47 ], users: 0 }
```

Ana ağacın bağımlılık durumu (be-fb'nin risk notunu doğrulamak için):
```
node -p "require('./node_modules/next/package.json').version"  → 16.3.8
package.json "next": "16.3.4" · pnpm-lock.yaml next@16.3.4
```

## Bulgular (önem sırasıyla)

**Bloke eden yok.**

- **Ö-1 (öneri, test kalitesi)** `api-keys-revoke-locked.spec.ts` tekrar oynatma satırları (`single` ve döngü) yalnız HTTP 200'ü doğruluyor. Server action reddi de 200 döner, yani bu satırlar ayırt edici değil. Asıl koruma DB sayımı ve audit sayımı, mutasyon testi de bunu kanıtlıyor. İstenirse yanıt gövdesinde `"success":false` araması eklenebilir. Zorunlu değil.
- **Ö-2 (öneri, temizlik)** `afterAll` B kiracısının `Tenant`, `Subscription` ve `ModuleState` satırlarını, A'nın `apiKey.revoked` audit satırlarını bırakıyor. Audit, bu DB'de çalıştırmalar boyunca 47 satıra birikmiş. Kararsızlığa yol açmıyor: id'ler her çalıştırmada yeni üretiliyor, sorgular id'ye göre süzülüyor, `upsert` tekrar çalıştırmaya dayanıklı. Mevcut FO-81 describe'ı da aynı deseni izliyor, yani yeni bir sorun değil, var olan bir alışkanlık. İsteğe bağlı: B için `moduleState`, `subscription` ve `tenant` silmesi.
- **Not (kapsam dışı, eski):** Dev sunucusu her derlemede `instrumentation.ts:18 process.exit … Edge Runtime` uyarısı basıyor. Bu PR'la ilgisi yok, testi etkilemiyor.

## (5) RLS gözlemi — değerlendirme
**Bilinen durum, yeni bulgu değil.** `docs/ROADMAP.md:414` (Açık karar #16, 29.09'da patron kararıyla **HAYIR** olarak kapandı, TASK-MULQM9UCIRY1A) şunu kayda geçiriyor: ana `DATABASE_URL` `fabrika` rolüyle bağlanıyor, bu rol `SUPERUSER + BYPASSRLS` (`prisma/rls-app-role.sql:1-9`). RLS politikaları dev'de ve **üretimde de** değerlendirilmiyor. Politikalar yalnız `fabrika_app` (NOBYPASSRLS) rolüyle `DATABASE_URL_RLS_TEST` + `tests/rls.spec.ts` üzerinde sınanıyor (`ROADMAP.md:158-159`). e2e de aynı ana bağlantıyı kullanıyor, mutasyonda B'nin anahtarlarının silinmesi bu yüzden beklenen sonuç.

be-fb'nin "üretim rolünde ayrıca doğrulanmadı" notuna cevap: karar #16'ya göre üretimde de durum aynı. Uygulama katmanındaki `where: { id, tenantId }` gerçekten tek savunma. Bu, FO-89 testini değerli kılan şeyin ta kendisi. be-fb'nin önerdiği ayrı kart gerekmiyor, çünkü karar zaten verilmiş. RLS'i çalışma zamanında açmak, patronun yeniden açması gereken bir karar.

## Değişen dosyalar
- `docs/agent-results/TASK-MVDWV6Y3WCC1E-crw2-fb.md` (bu rapor). Kod değişikliği yok.

## Riskler
- **Lider bilmeli:** ana ağaçta `/Users/macbook/alan/FONBRIDGE/node_modules` lockfile'dan sapmış: next 16.3.8 kurulu, lock 16.3.4 istiyor. Sebebi be-fb'nin symlink yan etkisi, bende doğrulandı. Ana ağaçtan çalışan sunucular ve kapılar kilitlenmemiş sürümle koşuyor olabilir. `pnpm install --frozen-lockfile` ile düzeltmek liderin ya da devop-fb'nin kararı. Bu incelemede dokunmadım.

## Açık sorular
Yok.

## Sonraki adım
PR #111 dev'e birleşebilir. Ö-1 ve Ö-2 isteğe bağlı. node_modules sapmasını lider ya da devop-fb ele almalı.

## Definition of Done (inceleme)
- [x] Test iki kiracıyla, tekli + toplu + listeleme: doğrulandı
- [x] Mutasyon bende kırmızı, geri alındı
- [x] Diff yalnız test
- [x] Temizlik değerlendirildi (Ö-2)
- [x] RLS gözlemi değerlendirildi (karar #16, bilinen durum)
- [x] Test koşuldu: 4 passed, 0 skipped
- [x] Platform beyanı: mac. Test yolu platformdan bağımsız, Windows/Linux koşulmadı.

> Not: Teslim metninin bir yerinde sonuç yolu `…-be-fb.md` diye geçiyor. O dosya yazarın raporu, üzerine yazmadım. Görev metnindeki ve kimlik kuralımdaki yol olan bu dosyayı kullandım.
