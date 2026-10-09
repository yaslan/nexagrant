# TASK-MUPVLWSIPC5WU — entegrasyon dalı tam E2E koşusu (leed-fb)

**Hüküm:** Kısmen bitti: 192 test geçti, 11 kırmızı, 3 atlandı. Önceki koşu 178 geçti / 21 kırmızıydı. Kimlik testlerinde 1 kırmızı kaldı; bunun nedeni ürün kodu değil, merge sırasında teste geri giren bir satır.

**Tip:** ölçüm

**Platform:** macOS (Darwin 27). Dal qae-fb/e2e-integration @0780f95f, E2E DB localhost:5433/fonbridge_e2e, E2E_PORT=3133, workers 1, `next dev`. Dağıtım bağlantısı koptuğu için qae-fb yerine lider koştu. qae-fb-8 raporu yarım kalmıştı (hükümde "[HESAPLANACAK]" yazıyor).

## Merge doğrulaması
```
9992da99 dalda · db5af5c2 dalda · 6a744781 dalda · 56aa5b28 dalda   (git merge-base --is-ancestor)
```

## Sonuç
```
$ E2E_PORT=3133 pnpm exec playwright test --reporter=list,json
  11 failed
  3 skipped
  192 passed (5.6m)
```
- Kimlik spec'leri (identity-honesty, identity-strings, registration-consent, signin-error-messages, invoice-write-path): 20 geçti, 1 kırmızı.
- Plan spec'leri (plan-storefront, plan-entitlement, admin-documents-upload, purge-failure-alert-console, admin-plan-editor): 31 geçti, 0 kırmızı.

## Kırmızı testler
| Test | Sınıf |
|---|---|
| signin-error-messages:48 "OAuthCallbackError … can be dismissed" | **Merge hatası.** Tek başına iki koşuda da kırmızı, yani rastgele değil. be-fb dalında satır 60 yok; qae-fb'nin merge çözümü `await expect(alert(page)).toHaveCount(0);` satırını geri getirmiş (`git diff be-fb/identity-e2e HEAD -- tests/e2e/signin-error-messages.spec.ts`). Kapanmadan sonra sayfada kalan tek `role="alert"` öğesi Next route announcer. Düzeltme: o satırı kaldırmak. Hata kutusunun kaybolduğunu zaten `getByTestId('signin-error')` count 0 ile ölçülüyor. |
| e2e-profile-save:28, :97 (Y-4 Kurumsal Profil) | Daha önce de kırmızıydı (qae-fb-7'nin bilinen-açık listesinde). Denetim bulgusu cae-fb Ö-1 ile aynı alan. |
| m10-audit-identity:169, :267 | Daha önce de kırmızıydı (M10 dört-göz). |
| m10-dual-approval-persistence:129, :171 | Daha önce de kırmızıydı (M10 dört-göz kalıcılığı). |
| theme-no-script-warning /tr, /en | Daha önce de kırmızıydı (tema). |
| theme-paint-timing ×2 | Daha önce de kırmızıydı (tema). |

"Daha önce de kırmızıydı" sınıflaması, testlerin önceki 21 kırmızı arasında olmasına dayanıyor. Bu koşuda her biri ayrıca kök neden analizinden geçmedi.

## Sonraki adım
1. signin-error-messages.spec.ts satır 60 kaldırılacak (merge hatası), ardından bu spec yeniden koşulacak.
2. Ardından entegrasyon dalının dev'e merge edilmesi için patron kararı gerekiyor.
