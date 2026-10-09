# TASK-MTVTIU3LAYFOA — Bağımsız inceleme: {brand} placeholder ve static gate Check 5

**Hüküm: ONAY** ✅

## Değerlendirme

Fe-fb'nin da692734 commit'inin ({brand} placeholder çağrıları) iddialarını doğruladım:

### 1. Dört bug'ın düzeltildiği doğrulandı

Raporunda belirtilen tüm dört çağrı sitesi kontrol edildi:

| Dosya | Anahtar | Düzeltme |
|---|---|---|
| `src/app/[locale]/page.tsx:18-19` | landing.metaTitle / metaDescription | ✓ `{ brand: PRODUCT_NAME }` eklenmiş |
| `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx` | Dashboard.metaDescription | ✓ `{ brand: PRODUCT_NAME }` eklenmiş |
| `src/lib/modules/guard.tsx:61` | ModuleGate.askAdmin | ✓ `{ brand: PRODUCT_NAME }` eklenmiş |
| `src/lib/modules/guard.tsx:53-59` | ModuleGate.reason.DEV_INTERNAL_ONLY | ✓ `brand: PRODUCT_NAME` dinamik nesneye eklenmiş |
| `src/app/[locale]/admin/billing/client.tsx:406` | billingPanels.admin.ssoAcsPlaceholder | ✓ `{ brand: PRODUCT_NAME }` eklenmiş |

### 2. Static gate Check 5 gerçekten çalışıyor — mutasyon testi kanıtı

Check 5 (`scripts/i18n-check.ts`'e eklenen yeni kontrol): placeholder-bearing key'ler (mesajda `{var}` interpolasyonu taşıyan) hiç ikinci argüman olmadan çağrılan `t('key')` çağrılarını yakalar.

**Mutasyon testi:** `src/app/[locale]/page.tsx:18-19`'deki ikinci argumentleri geçici olarak kaldırdığımda (landing.metaTitle ve landing.metaDescription), `pnpm i18n:check` tam olarak doğru hataları verdi:

```
❌ Placeholder key called with no value — next-intl will render the key path, not the message (2):
   - src/app/[locale]/page.tsx:18  landing.metaTitle  needs { brand }
   - src/app/[locale]/page.tsx:19  landing.metaDescription  needs { brand }
```

Kapı **kırmızı döndü** (`exit 1`), hata mesajları **tam doğru konumu ve eksik değişkeni** gösterdi. Geri düzeltme sonrası kapı yeşil döndü. **Check 5 gerçekten işlevsel.**

### 3. noUncheckedIndexedAccess hataları kapandı

`tests/e2e/document-export-tenant-isolation.spec.ts:69-72` kodunun `regex.matchAll()` capture group'ları (`body`, `run`) için gerçek `undefined` kontrolü vardır (`if (body === undefined)` ve `run === undefined ?` ternary). `!` veya `as` non-null assertion yok — tip-güvenli bir çözüm.

**`pnpm typecheck` çalıştırıldı:** ✅ **Hiçbir hata yok** (exit 0).

## Riskler

- Check 5'in **bilinen sınırı:** "kısmi eksik parametre" durumunu yakalamaz — yani ikinci argüman VAR ama içindeki obje literalinin anahtarlarından biri eksik olan durumlar (örn. `t('reason', { module: 'M9' })` fakat `reason` mesajı `{brand}` da istiyorsa). Fe-fb bunu aea4cef3 (memory) notunda açıkça yazmıştı.
- Check 5 yalnız `t()` çağrılarını tarar; `document-exporter.ts` gibi next-intl dışı `.replaceAll('{brand}', PRODUCT_NAME)` yolları kapsam dışında bırakılmıştır (ve bunu da Fe-fb belirtmişti).

## Platform beyanı

**macOS (Darwin 27.0.0)** — `pnpm i18n:check` ve `pnpm typecheck` çalışıdı. Dokunulan kod platforma bağlı değil (regex, JSON parsing, React server components + next-intl), Windows/Linux'ta davranış farkı yok.

## Sonraki adım

- Check 5 gelecekte "kısmi eksik parametre" durumunu da yakalayacak şekilde genişletilebilir (daha ağır bir statik analiz gerekir, bu görev kapsamı dışında).
