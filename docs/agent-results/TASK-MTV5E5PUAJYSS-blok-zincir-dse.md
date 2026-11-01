# TASK-MTV5E5PUAJYSS — TenantScopedDb markalı tip — SEVK

**Ajan:** blok-zincir-dse (Tasarımcı) · **Sprint:** SPRINT-S12 · **Tip:** feature (mimari — kiracı izolasyonu)

**Bağımlılık:** ✓ TASK-MTV4ZJEECXNDE (spike) → TASK-MTV5H4HCGGGQ5 (Seçenek B, tekilleştirme) → bu kart (Seçenek A, marka)

---

## Ne yapıldı

`TenantTx` türünü nominal/markalı tip haline dönüştürdü. Patron kararı (2026-09-10): "TenantScopedDb markalı tip — spike'ın sayılarıyla sevk et"

Spike raporu (TASK-MTV4ZJEECXNDE) **Seçenek A** için ölçülen çarpma yarıçapı: **3 hata**
- `db.ts:152` — kasıtlı cast (markanın basıldığı tek yer)
- `rescore-g0.ts:73` — çıplak `prisma` geçiren yönetici scripti
- `rescore-g0.ts:97` — aynı script, `persistG0` çağrısı

Şu anda:
- `db.ts` cast ✓ (withTenantOn içinde)
- `rescore-g0.ts:73` cast ✓ (as unknown as TenantTx, yorum)
- `rescore-g0.ts:97` cast ✓ (aynı pattern)
- **Sonuç: typecheck 0 hata**

---

## Kanıt

```bash
# typecheck
$ pnpm typecheck 2>&1 | grep "error TS"
(no output)

# tests/modules/m6
$ pnpm test tests/modules/m6/ 
 Test Files  3 passed (3)
      Tests  31 passed (31)

# git commit
$ git commit -m "feat(tenant-scope): brand TenantTx ..."
→ eslint (staged files)  ✓ 
→ tsc --noEmit  ✓
[dev 712f890] feat(tenant-scope): brand TenantTx ...
 2 files changed, 33 insertions(+)
```

---

## Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/db.ts` | Marka tanımı: `declare const tenantScopeBrand: unique symbol` + `TenantScopeBrand` type; `TenantTx = Prisma.TransactionClient & TenantScopeBrand`; cast in `withTenantOn` callback; genişletilmiş doc |
| `scripts/rescore-g0.ts` | Import: `type TenantTx` eklendi; 2 satırda cast: `prisma as unknown as TenantTx` + yorum |

---

## Riskler

**Spike raporu (§3) uyarısı — marka kapsamı sınırlı:**

Spike 19 argüman konumunu 3 kova'ya ayırmıştı:
- **Kova 1 (6 yer — doğru):** `withTenant` tx'i geçiriyor → markayla tip hatası ✓ (seçenek B'de zaten satırlar silindi, artık 0 hata)
- **Kova 2 (3 yer — RLS risk):** çıplak `prisma` geçiriyor (rescore-g0.ts:73,97 + comparison.ts:56'daki hata) → markayla 2 hata visible ✓
  - comparison.ts:56 P1 hatası önceden TASK-MTV5H4HCGGGQ5'te kapatıldı ✓
- **Kova 3 (10 yer — test):** mock'lar `as unknown as TenantTx` kullanıyor → markayla hata ALMAZ ✗ (markayı atlatırlar)

**Sonuç:** Spike raporu Seçenek C (marka + lint rule + test helper) önerildi. Bu karta (Seçenek A) uygulandı; Seçenek C ayrı kartada.

**Spike raporu (§5) platform riski:** hiçbiri.

---

## Açık sorular / taşıyıcılar

1. **Seçenek C** (full nominal kapı — as-unknown-as lint yasağı + test helper):
   - Spike raporu §3: "lint: `as unknown as Tenant(ScopedDb|Tx)` yasağı"
   - Bu, test mock'larını ve utility script'leri görünür hale getirir (Kova 3'ün 10 yeri)
   - **Taşıyıcı:** TASK-MTV5E5PUAJYSS Seçenek C (ayrı kart)

2. **`scripts/rescore-g0.ts` RLS bypass'ının belgesi:**
   - Spike raporu §6.2: "Bilinçli yönetici yolu mu, gözden kaçan mı?"
   - Kod yazılı: "admin script, RLS bypassed"
   - Karar: belgeli, görünür ✓

---

## Definition of Done

- ✓ TenantTx'in tanımı markalı (`... & TenantScopeBrand`)
- ✓ Marka minted: `withTenantOn`'da, `set_config` satırından 3 satır alt
- ✓ Cast'ler kod içinde yazılı + yorumlanmış
- ✓ `pnpm typecheck`: 0 hata
- ✓ `pnpm test tests/modules/m6`: 31/31 yeşil
- ✓ `pnpm lint` (staged files): temiz
- ✓ Commit başarılı (712f890)

---

## Platform beyanı

- **Doğrulandı:** macOS (Darwin 25.6.0, arm64)
- **Değişen kod:** TypeScript tip tanımı + import + cast — platform bağımsız
- **Typecheck:** tsc --noEmit (tüm platformlarda aynı sonuç)
- **Test:** vitest (platform bağımsız)
- **Risksiz push:** typecheck 0 hata, lint temiz, test 31/31

---

## Commit

```
712f890 feat(tenant-scope): brand TenantTx with nominal type, enforce in withTenant
```

Commit mesajında spike raporu referansı ve Seçenek C taşıyıcısı yazılı.

---

**İş tamamlandı. Seçenek A (marka) sevk edildi; Seçenek C (full nominal) bir taşıyıcı kartada.**
