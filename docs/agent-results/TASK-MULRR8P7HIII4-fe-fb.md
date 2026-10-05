# TASK-MULRR8P7HIII4 — FB KAMU B6: karne sonucunun hesaba bağlanması (fe-fb)

Commit: `897d3608` (dev, push yok). Şema değişikliği yok.

## 1. Ne yapıldı

- **Kayıt linki** (`src/lib/readiness/share.ts`): "Ücretsiz hesap aç" artık `/tr/kayit?kaynak=fon-hazirlik&il=<il>&karne=<kurumTürü>.<15 cevap>` açıyor. `encodeReadinessCode` / `decodeReadinessCode` eklendi. Tam olarak çözülmeyen kod `null` döner, yani elle bozulmuş kod hiçbir şey taşımaz. Karne sayfası sunucuya hâlâ hiçbir şey yazmıyor, sonuç yalnız URL'de.
- **Kayıt formu** (`AuthCard.tsx`): link geçerli bir `karne` taşıyorsa "Karne sonucumu hesabıma ekle" kutusu çıkar. Kutu **varsayılan olarak işaretsiz** gelir ve hiçbir yerde saklanmaz. İpucu satırı puanı gösterir ve ajansın bu bilgiyi yalnız toplu sayı olarak göreceğini söyler. Kod sunucuya yalnız kutu işaretliyse ve kayıt sekmesindeyse gönderilir (`readinessToSend`).
- **Sunucu** (`src/lib/auth.ts`, `src/lib/actions/auth.ts`):
  - Credentials: yeni `readiness` alanı var ve yalnız **yeni kullanıcı dalında**, `tenant.create` içinde `settings: readinessSettings(...)` olarak yazılır. Mevcut hesaba giriş hiçbir şeyi değiştirmez.
  - OAuth: il çerezinin ikizi olan httpOnly `fabrika_registration_readiness` çerezi (`src/lib/registration-readiness-cookie.ts`) her OAuth başlangıcında ya yazılır ya silinir. Onay yoksa silinir. Kiracı `events.createUser` içinde bu çerezden okunan değerle açılır.
- **Saklama** (`src/lib/readiness/account.ts`): `Tenant.settings.readiness = { code, importedAt }`. Bu, mevcut bir JSON kolonu, o yüzden şema kilidine dokunulmadı ve leed-fb'ye şema önerisi gerekmedi. Puan, seviye ve eksikler saklanmıyor. Her okumada `scoreReadiness` ile yeniden hesaplanıyor, böylece kart karnenin kendi kural ve metinleriyle hep aynı. Okuma da `decodeReadinessCode`'dan geçiyor.
- **Pano kartı** (`dashboard/readiness-card.tsx`, `Dashboard.tsx` içinde `aside` yuvası): "Hazırlık durumu" kartında kurum türü, eklenme tarihi, puan / 100, seviye, ilk 5 eksik adım (+ "N eksik adım daha var"), "Ayrıntılı sonucu gör" (paylaşım linki) ve "Karneyi yeniden yap" (`/tr/fon-hazirlik`) var. Sonuç yoksa ya da okuma hata verirse kart hiç çizilmez ve KPI panosu bundan etkilenmez.
- **Ajans hunisi** (`src/lib/agency/funnel.ts`): `readiness` artık ölçülen bir adım. Kohort sorgusu (`Tenant.agencyId`, silinmemiş) `settings` alanını da okuyor ve geçerli sonucu olan kurumlar sayılıyor. Ajans ayarları görmez, yalnız maskelenmiş sayı sunucudan çıkar. `NESTED_STEPS`'e `registered ⊇ readiness` eklendi, bu yüzden <5 maskesi, tamamlayıcı gizleme ve 5'e yuvarlama bu adımı da kapsıyor. SQL fonksiyonuna (`agency_funnel_counts_by_province`) dokunulmadı. Çeviri ipucu "Karne ile hesap henüz bağlı değil" yerine "Karne sonucunu hesabına ekleyen kurum" oldu.

## 2. Kanıt

**Gerçek etkileşimli e2e** (http://localhost:3000, leed-fb'nin sunucusu, sistem Chrome'u + Playwright ile gerçek tıklama ve yazma; betik `TASK-MULRR8P7HIII4-screenshots/b6-e2e.mjs`): karne doldurulur (belediye, Samsun) → "Ücretsiz hesap aç" → kayıt → pano.

```
A CTA href: /tr/kayit?kaynak=fon-hazirlik&il=Samsun&karne=municipality.012120201012120
A register URL: ...&karne=municipality.012120201012120 | box checked by default: false
A email: b6-a-1790651777164@example.com | dashboard: http://localhost:3000/tr/default/dashboard | readiness-card: 1 | score: 50 / 100
A retake href: /tr/fon-hazirlik | gaps: 5
B CTA href: /tr/kayit?kaynak=fon-hazirlik&il=Samsun&karne=municipality.012120201012120
B register URL: ...&karne=municipality.012120201012120 | box checked by default: false
B email: b6-b-1790651781610@example.com | dashboard: http://localhost:3000/tr/default/dashboard | readiness-card: 0
```

**DB'de doğrudan kontrol** (iki yeni kiracının `Tenant.settings` alanı):

```
b6-a-1790651777164@example.com Samsun {"readiness": {"code": "municipality.012120201012120", "importedAt": "2026-09-29T03:16:17.837Z"}}
b6-b-1790651781610@example.com Samsun {}
```

Onaylı akışta sonuç taşındı. Onaysız akışta hiçbir şey taşınmadı.

**Ekran görüntüleri** (`docs/agent-results/TASK-MULRR8P7HIII4-screenshots/`): `1-karne-sonuc.png`, `2A-kayit-onay-isaretli.png`, `2B-kayit-onay-isaretsiz.png`, `3A-pano-kartli.png`, `3B-pano-kartsiz.png`, `4A-pano-mobil.png` (390 px; kart tek sütuna düşüyor, yatay kaydırma yok).

**Kapılar:**

```
npm run typecheck   → tsc --noEmit, çıktı yok (temiz)
npm run lint        → eslint, çıktı yok (temiz)
npm run i18n:check  → ✅ i18n check passed
set -a; source .env; set +a; npm test
 Test Files  191 passed | 2 skipped (193)
      Tests  2216 passed | 8 skipped (2224)
```

i18n kapısı gerçek bir hata yakaladı: `readiness.score_out_of`, `{score}` değeri olmadan çağrılıyordu. Commit'ten önce düzeltildi.

**Saldırgan kapısı karne adımını kapsıyor:**

- `funnel.attack.test.ts`: `STEPS` sonuna `readiness` eklendi (sabit örneklerin konumsal satırları anlamını koruyor) ve `SUBSETS`'e `registered ⊇ readiness` girdi. Rastgele tablolar karne sayısını kendi akışından çekiyor (`stream(seed+2000)`), böylece öteki adımlar eski kapının gördüğü tabloların aynısı.
- **Mutasyon kanıtı:** `funnel.ts` içinden `{ parent: 'registered', child: 'readiness' }` geçici olarak silinince saldırgan testinde 8 tohum/mod kırmızıya döndü (`× seed 7, D ≥ 0, random codes …`, `× seed 42 …`). Dosya yedekten geri yüklendi, `git checkout` kullanılmadı.
- `funnel.test.ts`: karne sayılıyor, yuvarlanıyor, <5 maskeleniyor. `registered 12, readiness 10` durumunda 2'lik fark ele vereceği için karne maskeleniyor.
- `tests/agency-funnel.live.test.ts` (gerçek DB, `fabrika_app` rolü): A'nın 8 kurumuna geçerli sonuç tohumlandı, beklenti `readiness = 10` (8'in yuvarlanmışı). B'nin sonucu olan kurumu A'ya sızmıyor. 13/13 geçti.

## 3. Değişen dosyalar

- `src/lib/readiness/share.ts`, `share.test.ts`
- `src/lib/readiness/account.ts` (yeni)
- `src/lib/registration-readiness-cookie.ts` (yeni)
- `src/lib/auth.ts`, `src/lib/actions/auth.ts`
- `src/app/[locale]/login/AuthCard.tsx`
- `src/app/[locale]/fon-hazirlik/readiness-check.tsx`
- `src/app/[locale]/(app)/[workspace]/dashboard/page.tsx`, `readiness-card.tsx` (yeni)
- `src/modules/m5/ui/Dashboard.tsx` (`aside` yuvası)
- `src/lib/agency/funnel.ts`, `funnel.test.ts`, `funnel.attack.test.ts`
- `tests/agency-funnel.live.test.ts`
- `messages/tr.json`, `messages/en.json`
- `docs/agent-results/TASK-MULRR8P7HIII4-screenshots/*` (kanıt)

Dokunulmayanlar: `prisma/schema.prisma`, `package.json`, `.env.example` (devop-fb), `docs/legal/*` (cs-fb).

## 4. Riskler

- **Hukuk metni:** `docs/legal/agency-channel-notice-addendum.md` B6 maddelerini "[B6 — commit'i ile doğrulanacak]" diye önceden yazmış. Karşılaştırdım ve metin kodla uyuşuyor: kurum türü + cevaplar + eklenme zamanı saklanıyor, kutu varsayılan işaretsiz, onaysızsa hiçbir şey kaydedilmiyor, ajansa cevap ya da puan değil yalnız sayı gidiyor. İşaretleri kaldırmak, dosya:satır eklemek ve envanter §18c'yi güncellemek cs-fb'nin işi. HUKUK-12 (kutunun niteliği, saklama süresi) hâlâ açık.
- **Analitik:** kayıt sayfasının URL'si `karne=` taşıyor. Sayfa görüntüleme analitiği tam URL gönderiyorsa kurumun cevapları (kişisel veri değil, kurum verisi) analitik sağlayıcısına gidebilir. Bunu doğrulamadım.
- **OAuth yolu** gerçek Google/Microsoft ile koşulamadı (bu ortamda kimlik bilgisi yok). Çerez modülü, test edilmiş il çerezinin birebir ikizi ve akış koddan okunarak doğrulandı. Canlı kanıt yalnız credentials (demo) yolu için var.
- Ajans hunisi canlı sunucuda bir ajans hesabıyla ekranda görülmedi. Bunun yerine canlı DB testi (`getAgencyFunnel`) ile doğrulandı.
- Test kullanıcıları `b6-a-…@example.com` ve `b6-b-…@example.com` yerel DB'de duruyor.

## 5. Açık sorular

- Kayıtlı bir kurum karneyi yeniden yaparsa yeni sonuç hesaba yazılmıyor, çünkü taşıma yalnız kayıt anında ve kart kapsamı buydu. "Sonucu güncelle" ayrı bir kart mı olsun? (leed-fb)
- "Ortalama karne puanı" (addendum §2.2, madde 9) kapsam dışı bırakıldı.

## 6. Sonraki adım

- cs-fb: addendum'daki B6 işaretlerini `897d3608` ile kapatsın ve §18c'ye ekleme yapsın.
- crw-fb: B6 incelemesi (özellikle `funnel.ts` NESTED_STEPS ve saldırgan testindeki `readiness` eklentisi).

**Platform beyanı:** Doğrulama macOS'ta (Darwin 27, sistem Chrome'u, Node 26) yapıldı. Dokunulan kod yolları platformdan bağımsız: URL parametresi, sunucu tarafı çerez, Prisma JSON yazımı, React bileşeni. Dosya yolu, süreç ya da kabuk kullanılmıyor. Windows ve Linux'ta koşulamadı çünkü bu makinede yalnız macOS var. Koddan bakınca davranış farkı beklenmiyor.
