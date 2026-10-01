---
sözleşme: 3
görev: TASK-MUPA77EIENLPH
kod: TASK-MUPA77EIENLPH
ajan: crw-fb
motor: claude
tip: araştırma
okur: ekip
hüküm: Bitti: ONAY — be-fb'nin P-1 ve P-5 kod davranışı iddialarının hepsi kaynak kodla tutuyor (yalnız Google OAuth, davette e-posta birebir eşleşmesi, kurum düzeyi dışa aktarma/silme yok, tek sahip silinince yalnız uyarı). Bloke eden bulgu yok; rapor biçimi ve güncelliği için 4 öneri.
platform: mac (Darwin 27.0). Yalnız kaynak okuması (dev 0e834904). Tespit platformdan bağımsız: TS sunucu kodu ve Auth.js yapılandırması. Canlı giriş akışı koşulmadı: Google kimlik bilgisi ve fabrika DB'si yok. Linux/Windows koşulmadı.
sürüm: 1
tarih: 2026-10-01T15:02:59.194Z
---

# FB REVIEW — pilot SSS ürün davranışı P-1/P-5 (be-fb): iddiaların kaynak kod doğrulaması

**İncelenen:** `/Users/macbook/alan/docs/agent-results/TASK-MUPA77EIENLPH-be-fb.md` (kod değişikliği yok, tespit görevi). Kaynak: dev `0e834904`.

## 1. İddia → kaynak doğrulaması
| # | Yazarın iddiası | Kaynak | Sonuç |
|---|---|---|---|
| P-1.1 | Üretimde yalnız Google OAuth; şifre ya da e-posta bağlantısı yok | `src/lib/auth.ts:365-378`: `providers: [Google(...), ...(demoLoginEnabled ? [Credentials(...)] : [])]`. `AuthCard.tsx:156-161`: `showOAuth = oauthProviders.google`, Entra kaldırıldı yorumu. E-posta formu (`:577`) yalnız `demoLoginEnabled` iken | ✅ |
| P-1.2 | Davet kabulünde davet e-postası ile giriş e-postası birebir eşleşmeli, yoksa `email_mismatch` | `src/lib/invitations/accept.ts:125-128` `sameEmail` (trim + lowercase), `:221` `return { ok:false, reason:'email_mismatch' }`, `:296` aynı kontrol (fırlatan yol) | ✅ |
| P-1.3 | Google hesabının e-postası doğrulanmış olmalı (yazar örtük söylüyor) | `auth.ts:369-373`: `allowDangerousEmailAccountLinking: true`. Bağlama yalnız Google adresi doğrulanmış derse yapılır (`providerVerifiedEmail`, `oauth-registration.ts`) | ✅ (rapora eklenmeli, Ö-3) |
| P-5.1 | Kişi düzeyi dışa aktarma bütün kiracıları kapsıyor | `src/actions/user/export-data.ts:44-49` (yorum + tek `withSystemScope`) | ✅ |
| P-5.2 | Kurum düzeyi dışa aktarma/silme kodda yok | `Tenant.deletedAt` yazılmıyor; `tenant.update(` yalnız `profile/actions.ts`, `agency/actions.ts`, `cobrand-store.ts`'te, hiçbiri silme yapmıyor. ADR-0010 §1 aynı taramayı yapıyor (dev `ff8b2db6`) | ✅ |
| P-5.3 | Tek sahip kendini silerse yalnız uyarı, silme engellenmiyor | `src/actions/user/request-deletion.ts:79-101` `soleOwnerOf` "Warn (do not block)" | ✅ |

## 2. Bulgular
B ya da Y yok.

- **Ö-1: Rapor repoda değil ve "Kanıt" bölümü yok.** Dosya `/Users/macbook/alan/docs/agent-results/`'te, FONBRIDGE'de izlenmiyor. Ayrıca biçimin zorunlu "Kanıt" başlığı yok, yalnız satır atfı var; bunları ben doğruladım (yukarıdaki tablo). Entegrasyonda repoya kopyalanmalı.
- **Ö-2: Rapor güncel değil.** P-5 sonucu "patron tarafında el prosedürü olabilir" diyor. Bu arada dev'e ADR-0010 taslağı girdi (kurum dışa aktarma/silme, K-1..K-5 patron kararları), ayrıca U-6 kararı geldi: kişi silme depoya dokunmuyor, dosyalar kurumun (TASK-MUPL2D9B8QWAB). SSS metni bunlara bağlanmalı: "kurum verisi kurum silinince gider; o akış ADR-0010'da, pilot süresince destek ekibi elle yürütür".
- **Ö-3: P-1'e eksik ama önemli bir koşul.** Hesap bağlama yalnız Google'ın doğruladığı adreste çalışıyor. "Kurum adresiyle Google hesabı aç" yolu, Google adresi doğrulayınca işler. SSS'de "Google'ın gönderdiği doğrulama e-postasını onaylayın" adımı yazılmalı.
- **Ö-4:** "Cordis organizations API bu amacı karşılamıyor" maddesi konuyla ilgisiz. Kaldırılabilir.

## 3. DoD kontrolü
| Madde | Durum |
|---|---|
| P-1 ve P-5 için kod davranışı tespiti | ✅ doğrulandı |
| Risk ve açık sorular | ✅ var (tek sahip/yetim kurum ADR-0010 §5 ile örtüşüyor) |
| Rapor repoda ve biçime uygun | ⚠️ Ö-1 |

## 4. Değişen dosyalar
Yalnız bu rapor.

## 5. Sonraki adım
SSS sahibi (cs-fb, TASK-MUOLBW7PZ7HM4) P-1'e Ö-3 adımını, P-5'e ADR-0010 ve U-6 bağlantısını eklemeli. Rapor dosyası entegrasyonda repoya alınmalı.
