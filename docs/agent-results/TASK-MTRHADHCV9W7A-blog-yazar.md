# TASK-MTRHADHCV9W7A — Onay Merkezi i18n

**Durum: DONE**

## Kapsam

Yalnız dokunulan dosyalar (görev talimatına uygun):
- `src/app/[locale]/(app)/[workspace]/approvals/client.tsx`
- `messages/tr.json` (`Approvals` namespace)
- `messages/en.json` (`Approvals` namespace)

`src/modules/m10/*`, `src/lib/dual-approval.ts`, evidence-ai, m8, billing, `scripts/`, `eslint.config.*` dosyalarına dokunulmadı.

## Yapılan

`client.tsx` içindeki **her** sabit Türkçe/İngilizce metin `useTranslations('Approvals')` (`t(...)`) ile değiştirildi — lider taramasının işaret ettiği satırlar (86/111/129/161 hata mesajları, 118 `confirm()`, 143 JSON uyarısı, 189/191/193 rozet etiketleri) dahil, dosyanın tamamı satır satır tarandı:

- Durum rozetleri (PENDING/APPROVED/REJECTED/CANCELLED/EXPIRED — emoji sabit kaldı, metin `t()`)
- İşlem türü rozetleri (G4/Bütçe/Hukuki/Yetki/Hassas Ayar)
- 3 tab başlığı + "Yeni Çift Onay Talebi" butonu
- 3 boş-durum mesajı (actionable / my_requests / history)
- Maker rozeti, "Gereken Rol", "Talep Eden", "Tarih", "Hash", "Red Gerekçesi" alan etiketleri
- Detay/Payload, Onayla, Reddet, İşleniyor..., Talebi Geri Çek butonları
- Reddet modalı (başlık, ipucu metni, placeholder, İptal, Reddi Kaydet)
- Detay modalı (Talep ID, Kriptografik Doğrulama Hash'i, Kapat)
- Yeni Talep modalı (tüm alan etiketleri, 5 select seçeneği, placeholder'lar, İptal/Talebi Başlat)
- 5 hata mesajı (`onaylama/reddetme/iptal/geçersiz payload/oluşturma hatası`) ve `confirm()` diyalog metni
- Payload textarea'nın varsayılan örnek JSON'undaki Türkçe not metni (`payloadSampleNote`) — form içeriği ama kullanıcının göreceği ilk değer olduğu için çevrildi

**Rozet etiketlerinde ham enum sızdırılmıyor** — `getActionTypeLabel`/`getStatusBadge`'in `default` dalları yalnız gerçekten bilinmeyen (yeni eklenecek) enum değerleri için fallback, mevcut 5 aksiyon tipi + 5 durum tam çevrili.

`messages/tr.json` ve `messages/en.json`'daki `Approvals` namespace'i **60/60 anahtarla birebir eşleşiyor** (script ile doğrulandı, aşağıda).

## Kanıt

### Ölçüm komutları

```
$ pnpm typecheck
$ tsc --noEmit
(temiz, hata yok)

$ pnpm i18n:check
⚠️  Missing in Turkish/English (21): hepsi Consortium/Pipeline/billingPanels/callsPage/m6 — Approvals'a ait DEĞİL, önceden var olan dinamik-şablon-anahtarı sorunları (bu görevin kapsamı dışı, dokunulmadı).
Approvals.* "Missing" listesinde YOK.
```

```python
tr['Approvals'] keys == en['Approvals'] keys  → 60 == 60, fark yok
```

### Gerçek tıklama kanıtı — `docs/agent-results/TASK-MTRHADHCV9W7A-screenshots/`

Playwright ile gerçek tarayıcıda, gerçek girişle (alice@fabrika.test, magic-email login), gerçek tıklamalarla üretildi:

| Dosya | Ne gösteriyor |
|---|---|
| `tr-01-list.png` | TR: boş liste, 3 tab başlığı çevrili |
| `tr-02-error.png` | TR: Yeni Talep modalı açık + **geçersiz JSON hata mesajı** (`Payload geçerli bir JSON formatında olmalıdır.`) gerçek submit sonucu |
| `tr-03-my-requests.png` | TR: geçerli payload ile oluşturulan talep "Taleplerim (Maker)" sekmesinde |
| `tr-04-detail-modal.png` | TR: Detay/Payload modalı — "Talep ID:", "Kapat" |
| `tr-05-cancelled.png` | TR: **gerçek `confirm()` diyaloğu kabul edilip** "Talebi Geri Çek" tıklandı → rozet "İptal Edildi", "Sizin Talebiniz (Maker)", "Gereken Rol: TENANT_ADMIN", "Talep Eden:", "Tarih:" hepsi çevrili |
| `tr-06-actionable.png` | TR: farklı gerçek kullanıcı (admin@yasinaslan.com.tr) girişiyle "Onayımı Bekleyenler" sekmesi |
| `en-01-list.png` … `en-05-cancelled.png` | Aynı akışın `/en` locale karşılığı — tab'lar "Pending My Approval / My Requests (Maker) / Audit Trail & History", rozet "Cancelled", "Your Request (Maker)", buton "Details / Payload" vb. |

## DoD dışı iki bulgu (kapsam dışı, düzeltilmedi — sadece rapor ediliyor)

1. **`src/app/[locale]/(app)/[workspace]/approvals/page.tsx` i18n dışı kaldı.** Sayfa başlığı ("Kurumsal Onay Merkezi"), breadcrumb ("Kurumsal Güvenlik • 4-Eyes İlkesi") ve alt açıklama server component'te sabit Türkçe string. `messages/*.json`'da zaten `Approvals.title` ve `Approvals.subtitle` anahtarları var ama hiç kullanılmıyor (i18n:check'in "unused" listesinde çıkıyorlar). Görev talimatı yalnız `client.tsx`'e dokunmama izin verdiği için düzeltmedim — ekran görüntülerinde (`en-05-cancelled.png` vb.) EN locale'de bile başlığın Türkçe kaldığı görülebilir.
2. **`src/lib/dual-approval.ts`daki `createApprovalRequest` / `approveApprovalRequest` / `rejectApprovalRequest` / `cancelApprovalRequest` DB'ye hiç yazmayan stub'lar.** Her biri sabit `{success:true, ...}` döndürüyor, gerçek Prisma yazımı yok (rol kontrolü de yok). Bu yüzden bir talebi farklı bir gerçek kullanıcı (checker) oturumunda "Onayımı Bekleyenler" sekmesinde görüp Onayla/Reddet'i gerçek tıklamayla tetiklemek bu ortamda mümkün değil — oturum kapatılıp farklı kullanıcı ile girildiğinde SSR yeniden prisma'dan okuyor ve hiçbir şey kalıcı olmadığı için liste boş geliyor (`tr-06-actionable.png` bunu gösteriyor). Bu, benim i18n değişikliğimden kaynaklanmıyor — dosyaya dokunmam yasaktı, sadece keşfedildi ve rapor ediliyor. Onayla/Reddet butonlarının ve reddet modalının `t()` kullanımı statik kod incelemesiyle doğrulandı (aynı `t` fonksiyonu, dosyanın geri kalanındaki zaten-kanıtlanmış desenle birebir aynı çağrı şekli).

## Not: dosyalar zaten commit'e girdi

Çalışma dizini paralel SPRINT-S12 dalgasında birden fazla ajan tarafından paylaşılıyor. `client.tsx`, `messages/tr.json`, `messages/en.json` değişikliklerim `git status`'ta görünmüyordu çünkü başka bir ajanın ilgisiz commit'i (`02474a8 fix(next-auth): ...` ve `fdb127e test(m8): ...`) `git add -A` ile bunları da süpürüp commit'lemiş. İçerik doğrulandı: HEAD'deki dosyalar benim tüm değişikliklerimi (60/60 anahtar, `useTranslations` importu) eksiksiz içeriyor — veri kaybı yok, ayrıca commit atmama gerek kalmadı.
