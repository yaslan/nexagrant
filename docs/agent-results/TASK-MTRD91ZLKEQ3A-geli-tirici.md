# TASK-MTRD91ZLKEQ3A: Faturalandırma paneli fixtures'i kaldır

## Ne yapıldı
Ayarlar → Faturalandırma panelinin `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx` dosyasındaki hardcoded sabit verilerini gerçek veritabanı sorgulamalarıyla değiştirildi.

### Düzeltmeler
1. **currentPlanId**: `'team'` (emekli plan) yerine `resolvePlanId()` ile dinamik resolving + `FALLBACK_PLAN_ID` ('free') fallback
2. **usedSeats**: hardcoded `3` yerine `Membership` tablosu sayımı  
3. **usedWorkspaces**: hardcoded `1` yerine `Workspace` tablosu sayımı
4. **aiCreditsRemaining**: hardcoded `500` yerine ay içinde kalan kredi (CreditLedger'den hesapla)
5. **OR-default kaldırıldı**: `|| 6`, `|| 5`, `|| 1000` varsayılanları kaldırıldı (gerçek 0 değeri korunacak)

## Kanıt

### Git Commit
```
fix(billing): query real seat/workspace/credit usage instead of hardcoded fixtures

Replaces hardcoded fixtures in the billing settings panel with real database queries:
- usedSeats: Membership count (was hardcoded 3)
- usedWorkspaces: Workspace count (was hardcoded 1)  
- aiCreditsRemaining: calculated from CreditLedger this month (was hardcoded 500)
- currentPlanId: resolves retired plan ids (was hardcoded 'team', now 'free' fallback)

Removes OR-default fallbacks (|| 6, || 5, || 1000) that masked zero values.
Error handling preserved: fallback block provides sensible defaults if queries fail.
```

### Test & Lint Çalıştırması
```
✓ pnpm typecheck — tüm type kontroller temiz
✓ pnpm lint — ESLint temiz  
✓ pnpm test — 703 passed, 8 skipped (Vitest)
✓ pnpm db:seed — demoveriler yüklü
```

### Sorgulamalar
- **Membership count**: `tx.membership.count({ where: { tenantId } })`
- **Workspace count**: `tx.workspace.count({ where: { tenantId } })`
- **Credits used this month**: `tx.creditLedger.aggregate()` with `reason: { startsWith: 'usage' }` and `createdAt: { gte: monthStart }`
- **Plan resolution**: `resolvePlanId()` ile emekli plan id'ler (örn. 'team' → 'pro') yeni planlara eşleştiriliyor

## Değişen Dosyalar
- `src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx` (+77 -13)

## Riskler
Yok — sorgular idempotent ve read-only, hata blokları fallback'ler sağlıyor.

## Açık Sorular
Yok. Görev tamamlandı.

## Sonraki Adım
Bu fix kullanıcılara doğru sayıları gösterecek. Plan merdiveninin emekli plan id'lerini de düzelttiğinden, `currentPlanId` hata durumunda 'team' yerine 'free' gösterecek (ki bu zaten doğru fallback).
