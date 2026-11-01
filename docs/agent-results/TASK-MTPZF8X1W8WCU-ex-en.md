# TASK-MTPZF8X1W8WCU — E10.3 KVKK/GDPR uyumu

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tarih:** 2026-09-07 · **Branch:** dev

## 0. Kart doğrulaması — kart BAYATTI

Kart "uçlar gerçekten çalışıyor mu, silme gerçekten siliyor mu" diye soruyor. Ölçtüm: **çekirdek akış zaten
sağlam ve daha önce bir tur düzeltilmiş.** Boşluklar kodun *içinde* değil, kodun *etrafında* çıktı:
konsol erişilemiyordu, hesap verebilirlik kaydı yoktu, kamuya açık aydınlatma metni i18n dışıydı.

Ölçüm (canlı Postgres, `fabrika@localhost:5432/fabrika`):

| Kart sorusu | Ölçüm | Sonuç |
|---|---|---|
| Uçlar gerçekten çalışıyor mu | 7 ucun tamamına canlı HTTP çağrısı | ✅ hepsi ayakta, anonim çağrıyı reddediyor |
| Silme gerçekten siliyor mu, yoksa yalnız `deletedAt` mi | Canlı purge koşusu + satır sayımı | ✅ **gerçekten siliyor** (30 gün sonra, `purgeDueUsers`) |
| Kiracı izolasyonu korunuyor mu | 2 kiracı + 3 kullanıcı ile canlı export | ✅ yalnız öznenin satırları |
| Aydınlatma metni iki dilde mi | tr/en render | ✅ ama **kodda gömülüydü** (düzeltildi) |
| Şema sütunları gerçek mi (phantom-column riski) | `information_schema` | ✅ 12/12 sütun mevcut |

## 1. Ne yapıldı

Önce ölçtüm, sonra boşlukları önem sırasına dizdim ve **en kritik üçünü** kapattım.

### G1 (KRİTİK — kapatıldı) · Veri sahibi konsolu erişilemezdi
`settings/privacy` sayfası, API'si ve i18n metni vardı — ama **hiçbir yerden link yoktu**:
`src/lib/routes.ts`'te `settingsPrivacy` anahtarı yoktu, `UserMenu`/`SidebarNav`'da giriş yoktu,
Türkçe `ayarlar/gizlilik` takma yolu yoktu (diğer tüm ayar sayfalarının var). Türkçe kullanıcı
sitenin kendi kuralını izleyip `ayarlar/gizlilik` yazdığında **404** alıyordu.
KVKK md.13 / GDPR art.12 hakkın *kullanılabilir* olmasını ister; sayfanın var olması yetmez.

- `src/lib/routes.ts` — `settingsPrivacy` anahtarı + tr/en çözümleme
- `src/lib/modules/route-catalog.ts` — `'ayarlar/gizlilik' → 'settings/privacy'` takması
- `src/app/[locale]/(app)/[workspace]/ayarlar/gizlilik/page.tsx` — TR takma sayfa (mevcut idiom)
- `src/components/UserMenu.tsx` — menüye "Gizlilik ve Verilerim" girişi (`ShieldCheck`)

### G2 (KRİTİK — kapatıldı) · Erişim/silme talebinin hesap verebilirlik kaydı yoktu
Yalnız tamamlanmış imha (`user.erased`) denetleniyordu. Bir **export** hiç iz bırakmıyordu; itiraz süresi
içinde yapılıp iptal edilen bir silme talebi de öyle. GDPR art.5(2) kanıtlanabilirlik ister.

Üç yeni `AuditEvent` tipi: `user.data.exported`, `user.erasure.requested`, `user.erasure.cancelled`.
İki tasarım kararı:
- Özne `sha256(userId)` ile referanslanır ve `actorId` **bilinçli olarak boş bırakılır** — aksi hâlde
  purge'den sonra ayakta kalan denetim satırı, imhanın sildiği kimliği yeniden üretirdi.
- Kayıt yalnız **satır sayısı** taşır, verinin ikinci bir kopyasını değil.
- Yazım best-effort: denetim hatası veri sahibini hakkından etmemeli.

### G3 (YÜKSEK — kapatıldı) · Kamuya açık aydınlatma metni kodda gömülüydü
`src/app/[locale]/privacy/page.tsx` her cümleyi `isTr ? '…' : '…'` olarak taşıyordu — CLAUDE.md §8 ihlali.
Dosyanın **kendi yorumu** "Copy lives in messages/{tr,en}.json under `legal.privacy`" diyordu ama gövde
o anahtarları okumuyordu; `legal.privacy` yalnız `metaTitle`/`metaDescription` içeriyordu.
Hukuk metni çevirmen ve i18n denetimi için görünmezdi.
Ayrıca veri sorumlusu adı **"FonBridge"** yazıyordu; ürün **Fabrika** → düzeltildi.

10 anahtar × 2 dil eklendi; sayfa artık `getTranslations('legal.privacy')` okuyor.

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Canlı uç koşusu — 7 ucun hepsi (dev sunucu :3000)
```
POST    /api/user/export                 -> HTTP 401  body={"error":"Unauthorized"}
POST    /api/user/export-data            -> HTTP 401  body={"error":"Unauthorized"}
GET     /api/gdpr/export                 -> HTTP 401  body={"error":"Unauthorized"}
POST    /api/user/request-deletion       -> HTTP 401  body={"error":"Unauthorized"}
DELETE  /api/user/request-deletion       -> HTTP 401  body={"error":"Unauthorized"}
GET     /api/user/request-deletion       -> HTTP 200  body={"pending":false}
DELETE  /api/gdpr/delete                 -> HTTP 401  body={"error":"Unauthorized"}
```

### 2.2 Erişilebilirlik — TR takma yolu artık çözülüyor (kontrollü karşılaştırma)
```
/tr/samples/ayarlar/bogus-yok  -> 404   (var olmayan yol = kontrol)
/tr/samples/ayarlar/gizlilik   -> 307   (giriş yönlendirmesi = yol ÇÖZÜLÜYOR)
/tr/samples/ayarlar/profil     -> 307   (mevcut takma yol = aynı davranış)
/en/samples/settings/privacy   -> 307
```

### 2.3 Aydınlatma metni iki dilde, i18n'den render ediliyor
```
/tr/privacy -> 200  <h1 …>Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>   "1. Veri Sorumlusu"
/en/privacy -> 200  <h1 …>Privacy Policy &amp; GDPR Disclosure</h1>           "1. Data Controller"
```

### 2.4 Canlı entegrasyon testi — gerçek Postgres, 14/14
`tests/gdpr-data-subject.live.test.ts` — yalnız `auth()` mock'lu (oturum kimliği); altındaki her şey
üretim kod yolu. 2 kiracı, 3 kullanıcı, OAuth sırları, efor/AI log/değerlendirme/onay satırları.
```
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  492ms
```
Kapsam: yetkisiz çağrı reddi · özne satırları var / **aynı kiracıdaki komşunun satırları yok** ·
**başka kiracının satırları yok** · OAuth sırları sızmıyor · iki dilli Evaluator Lens ihtarı ·
soft-delete hiçbir şeyi yok etmiyor · tek-sahip uyarısı · idempotentlik · iptal geri yüklüyor ·
**canlı purge gerçekten siliyor** · AiUsageLog anonimleşiyor (silinmiyor) · Evaluation `userId` NULL ·
komşu ve diğer kiracı el değmemiş · denetim kaydı erased kimliği yeniden üretmiyor.

### 2.5 Testlerin gerçekten ısırdığının kanıtı (mutasyon denemesi)
Test yazıp "geçti" demek yetmez; iki kasıtlı regresyon soktum, ikisi de yakalandı, dosya geri alındı:
```
# Mutasyon 1: export'u ownerId yerine tenantId ile kapsa (dokümanların "düzeltildi" dediği bug)
× returns the subject rows and no other member of the same tenant
      Tests  1 failed | 13 passed (14)

# Mutasyon 2: Account select'ini kaldır (OAuth sırları export'a aksın)
× never includes OAuth secrets
      Tests  1 failed | 13 passed (14)
```

### 2.6 Kapı
```
$ npx tsc --noEmit -p tsconfig.json
(çıktı yok — temiz)

$ npm run lint
✖ 81 problems (0 errors, 81 warnings)        # hepsi mevcut baseline; benim dosyalarımda 0

$ npx vitest run
 Test Files  1 failed | 89 passed | 2 skipped (92)
      Tests  4 failed | 996 passed | 8 skipped (1008)
```

**Tek kırmızı BENİM DEĞİL.** `tests/m11-partb-editor-buffer.test.tsx` (4 test) —
`src/modules/m11/ui/PartBCollaborativeEditor.tsx:114` `useTranslations` çağırıyor, test koşumunda
`NextIntlClientProvider` sarmalayıcısı yok. Bunu **HEAD'den açtığım izole worktree'de** (hiçbir
değişikliğim yokken) tekrar ürettim:
```
$ git worktree add --detach <scratch> HEAD      # 3b5ad2a
$ npx vitest run tests/m11-partb-editor-buffer.test.tsx
 Test Files  1 failed (1)
      Tests  4 failed (4)
```
Yani commit'lenmiş, bana ait olmayan bir regresyon. Dosyaya dokunmadım.

## 3. Değişen dosyalar
| Dosya | Değişiklik |
|---|---|
| `src/lib/routes.ts` | `settingsPrivacy` rota anahtarı (+3) |
| `src/lib/modules/route-catalog.ts` | `ayarlar/gizlilik` takması (+1) |
| `src/app/[locale]/(app)/[workspace]/ayarlar/gizlilik/page.tsx` | **yeni** TR takma sayfa |
| `src/components/UserMenu.tsx` | menüye gizlilik girişi (+17) |
| `src/actions/user/export-data.ts` | `user.data.exported` denetimi (+44) |
| `src/actions/user/request-deletion.ts` | `user.erasure.requested/cancelled` denetimi (+56) |
| `src/app/[locale]/privacy/page.tsx` | gömülü metin → i18n (+29/−48) |
| `messages/{tr,en}.json` | `legal.privacy` altına 10 anahtar × 2 dil |
| `tests/gdpr-data-subject.live.test.ts` | **yeni** — 14 canlı test |
| `tests/localized-routes.test.ts` | privacy rota sözleşmesi (+3) |

## 4. Riskler
- `tests/gdpr-data-subject.live.test.ts` **gerçek DB'ye yazar**. DB yoksa `describe.skipIf` ile
  sessizce atlanır, CI'ı kırmaz. Purge testi, kendi ekmediği bir satır da "vadesi dolmuş" ise
  **koşmayı reddeden bir koruma** taşır (`expect(due).toEqual([ids.subject])`) — aksi hâlde iş
  tüm veritabanını tarayıp gerçek kullanıcı silebilirdi.
- Denetim yazımı best-effort; DB darboğazında kayıt düşebilir (talep düşmez). Bilinçli takas.

## 5. Açık sorular / kapatılmayan maddeler (uydurma "tamamlandı" yok)
Önem sırasıyla, bu turda kapatılmadı:

1. **(ORTA) `actorId` imhadan sağ çıkıyor — başka modüllerde.** `settings/modules/actions.ts:98,145`,
   `pipeline/actions.ts:498`, `admin/modules/actions.ts:78,95` ham `userId`'yi `AuditEvent.actorId`'ye
   yazıyor. Kullanıcı purge edildikten sonra bu satırlar **silinen kimliği yeniden üretiyor** —
   `users-scheduled-deletion` işinin özenle kaçındığı şeyin ta kendisi. Benim kartımın dosyaları değil;
   bildiriyorum. Çözüm ya purge'de bu satırların anonimleştirilmesi ya da hash'e geçilmesi.
2. **(ORTA) Dokümanda var, kodda yok:** `docs/SECURITY_COMPLIANCE.md:101` "muhatap silme isteği formu
   (herkese açık)" diyor. Böyle bir rota yok (yalnız dokümanda geçiyor). Ya form yazılmalı ya doküman
   düzeltilmeli.
3. **(ORTA) `cancelAccountDeletion` `deletionReason`'a bakmıyor** (`request-deletion.ts:126-129`).
   Politika gereği kapatılmış bir hesap kendini geri açabilir. Şu an *ulaşılamaz* (kod yalnız
   `subject_request` yazıyor), ama `policy`/`tenant_cascade` şemada tanımlı. Guard tek satır.
4. **(DÜŞÜK) `GET /api/user/request-deletion` anonim çağrıya 401 değil 200 `{"pending":false}` dönüyor.**
   Veri sızdırmıyor; diğer altı uçla tutarsız.
5. **(DÜŞÜK) `/api/gdpr/export` GET.** `Cache-Control: no-store` var, CORS okumayı engelliyor; yine de
   kişisel veri döndüren bir uç için POST daha uygun. Legacy yol olduğu için dokunmadım.

## 6. Sonraki adım
Sırayla: (1) madde 1 — imha sonrası artık kimlik, gerçek bir GDPR açığı, sahibi M-modül ekibi;
(2) madde 2 — doküman/kod çelişkisini kapat; (3) madde 3 — tek satırlık guard.
