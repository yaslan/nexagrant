# TASK-MTQUX5IZ9I5VP — Bağımsız doğrulama: M9 brief kaydı + var olmayan fırsatta uydurma veri

**Ajan:** blog-yazar (independent verification, not the implementer)
**Tarih:** 2026-09-08
**Rol:** İddiayı çürütmeye çalış, doğrulamaya değil.

## 1. Ne yapıldı

İki ayrı iddiayı gerçek tarayıcı + gerçek DB ile, kendi izole tenant/kullanıcı fixture'ımla (mevcut
`tests/e2e/` dosyalarına dokunmadan — çakışma uyarısına uyuldu) ölçtüm:

- **(a) "Brief hiç kaydedilmiyor"** — `blog-yazar-verify-tenant` adında taze bir tenant/workspace/
  opportunity/kullanıcı kurdum (`scripts/_blog-yazar-verify-setup.ts`, iş bitince silindi), gerçek
  giriş formundan (`/tr/giris`, e-posta ile şifresiz oturum) oturum açtım, M9 Brief formunu
  (Ortak Adı + Tarih + Saat) doldurup **Yapay Zeka Brief Oluştur**'a gerçek tıklama ile bastım,
  brief ekranda göründü, **sayfayı yeniden yükledim (`navigate` ile aynı URL)** ve brief hâlâ
  ekrandaydı. Ardından doğrudan Postgres'e Prisma ile sorgu attım.
- **(b) "Var olmayan fırsat id'sinde uydurma veri gösteriliyor"** — aynı tenant altında var olmayan
  bir opportunity id'siyle (`blog-yazar-hayali-firsat-99`) `/briefs` yoluna hem tarayıcıdan hem de
  oturum açmış bir Playwright script'iyle (HTTP status okumak için) gittim.
- Doğrulama sonunda test verilerini temizledim (`scripts/_blog-yazar-verify-teardown.ts`) ve tüm
  geçici script dosyalarını sildim — repoda kalıcı iz bırakılmadı.

Kod tarafında da okudum: `src/app/[locale]/(app)/[workspace]/opportunities/[id]/briefs/page.tsx`
(commit `eda71f8`, 2026-09-07 11:20) `notFound()` çağırıyor, demo/fallback verisi yok; `src/modules/
m9/server/actions.ts` (`generateMeetingBrief`) DB yazımını `withTenant` içinde `try/catch` ile
sarmış, hata durumunda `{ success: false, error: 'BRIEF_NOT_PERSISTED' }` döndürüyor ve
`client.tsx` bunu `generateError` state'ine bağlayıp ekranda gösteriyor (sessiz yutma yok).

## 2. Kanıt

**(a) Persist + reload — DB kaydı:**
```
ROW_COUNT 1
{
  "id": "cmtsilh90000by0xkq72xx5lj",
  "tenantId": "blog-yazar-verify-tenant",
  "interactionId": "int-1788862585057",
  "partnerName": "Blog Yazar Kalicilik Testi",
  "meetingScheduledAt": "2026-10-24T11:00:00.000Z",
  "meetingScheduledTz": "Europe/Brussels",
  "createdAt": "2026-09-08T10:16:26.004Z",
  "content": "<!-- fabrika:template-draft -->\n### 1. Partner Background & EU Track Record\n- **..."
}
```
Ekranda "GÖRÜŞME KAYITLARI (1)" ve brief içeriği, sayfa `navigate` ile yeniden yüklendikten SONRA
da aynı şekilde görünüyordu (React state değil, sunucudan gelen veri — `page.tsx` her istekte DB'den
okuyor). Ekran görüntüsü: `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/blog-yazar-01-after-reload.png`

Not: Bu ölçümde LLM çağrısı dev ortamında başarısız oldu ("Yapay zekaya şu anda ulaşılamadı") ve
brief şablon-taslak (`aiGenerated=false`) yoluna düştü — bu, `actions.ts`'teki tasarlanmış fallback
davranışı (AI kredisi düşülmedi, `TASLAK` etiketiyle işaretlendi) ve TASK-MTQUX5IZ9I5VP'nin kapsamı
dışında bir ortam kısıtı; kayıt/reload iddiasını etkilemiyor çünkü her iki yol da aynı
`withTenant(...).create/update` + `try/catch` bloğundan geçiyor.

**(b) Var olmayan opportunity — gerçek 404, uydurma yok:**
```
SIGNED_IN_STATUS 404
HAS_FABRICATED_BRIEF_TEXT false
BODY_SNIPPET 404
Sayfa Bulunamadı

Aradığınız sayfa veya geçerli bağlantı mevcut değil ya da kaldırılmış olabilir.

Ana Sayfaya Dön
```
Oturum açmış bir Playwright oturumuyla gerçek HTTP status 404 doğrulandı (curl'ün çerezsiz isteği
307→/tr/giris döndürdüğü için status'u anonim olarak ölçmek yanıltıcı olurdu — bu yüzden oturum açık
bir tarayıcıdan ölçtüm). Ekranda hiçbir brief/ortak/sayı görünmüyor, yalnız 404 sayfası. Ekran
görüntüsü: `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/blog-yazar-02-unknown-opportunity-404.png`

## 3. Kaydı olmayan durumda ekranda ne yazıyor (birebir)

Boş durumda (0 brief), form üstünde:
> GÖRÜŞME KAYITLARI (0)
> Henüz kayıtlı bir görüşme bulunmuyor.
> Lütfen sol panelden bir görüşme seçin veya yeni bir AI Brief oluşturun.

Var olmayan opportunity id'sinde (sayfa hiç render olmuyor, `notFound()` App Router'ın 404'üne
düşüyor):
> 404
> Sayfa Bulunamadı
> Aradığınız sayfa veya geçerli bağlantı mevcut değil ya da kaldırılmış olabilir.
> Ana Sayfaya Dön

İkisinde de uydurma ortak adı, sayı veya içerik yok.

## 4. Hüküm (iki iddia ayrı ayrı)

- **(a) "Brief hiç kaydedilmiyor" → KAPATILABİLİR.** Brief gerçek tıklamayla üretildi, DB'de
  `MeetingBrief` satırı olarak doğrulandı, sayfa yenilendikten sonra da aynı satırdan geliyor.
  Düzeltme `fa0d5fd` (post-meeting notes) ve daha genel olarak `605863e`/`actions.ts`'teki
  `try/catch` + `BRIEF_NOT_PERSISTED` yapısı ile örtüşüyor; bugün de canlı.
- **(b) "Var olmayan fırsatta uydurma veri" → KAPATILABİLİR.** Signed-in istekte gerçek HTTP 404,
  ekranda hiçbir icat edilmiş içerik yok. Düzeltme `eda71f8` (2026-09-07) bugün de canlı; ayrıca
  bugün aynı günde başka bir görevde (`TASK-MTRNO3LBZB2Q7`, commit `fb561dc`) `notFound()`'ın genel
  olarak gerçek 404 döndürdüğü bağımsız doğrulandı — bu, benim M9-özel ölçümümle tutarlı.

Kırık bir şey bulunmadı; kod değişikliği yapılmadı.

## 5. Değişen dosyalar

Kaynak kodda değişiklik yok (mevcut düzeltmeler zaten doğru). Eklenenler:
- `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/blog-yazar-01-after-reload.png`
- `docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/blog-yazar-02-unknown-opportunity-404.png`
- Bu rapor.

Geçici doğrulama script'leri (`scripts/_blog-yazar-verify-*.ts`) test verisiyle birlikte silindi,
repoda iz bırakmıyor.

## 6. Riskler

- Bu ölçümde LLM sağlayıcısına gerçek çağrı başarısız oldu (dev ortam kısıtı — API anahtarı/ağ),
  yani "AI tarafından gerçekten yazılmış" brief'in persist edilmesi bu oturumda test EDİLEMEDİ;
  yalnızca template-fallback yolu test edildi. Kod okuması, iki yolun da aynı DB yazım bloğundan
  geçtiğini gösteriyor, ama bu gerçek-AI yolu için ayrı bir kanıt değil.
- `resolveMeetingSchedule` doğrulaması (tarih+saat ikisi de dolu olmalı) formda var ama ilgisiz bir
  kusur değil — kapsamın parçası olarak zaten çalıştığı gözlendi (yarım doldurulmuş form reddedildi).

## 7. Açık sorular

- Kalıcı bir e2e spec'i (`tests/e2e/m9-brief-persistence.spec.ts`) zaten var ve bu görevin iki
  iddiasını tam olarak kapsıyor (`persist-01..05` ekran görüntüleri, bugün 08:02'de üretilmiş).
  Görev talimatı gereği `tests/e2e/` altına dokunmadım (blok-zincir-dse orada çalışıyor); o dosya
  zaten mevcut ve doğru kapsamda olduğu için ek bir spec önerilmiyor.
- Gerçek LLM çağrısının persist yolunu ayrıca doğrulamak isteyen biri, `ANTHROPIC_API_KEY`/ilgili
  sağlayıcı anahtarının dev ortamda tanımlı olduğu bir oturumda aynı adımları tekrarlayabilir.

## 8. Sonraki adım

Kart `review`den `done`a alınabilir; iki iddia de bağımsız olarak KAPATILABİLİR bulundu.
