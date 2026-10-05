# TASK-MUMH7OISNJ5OV — FB hukuk soru paketi (pilot kapısı d) — cs-fb

**Kart:** TASK-MUMH7OISNJ5OV (FB-KAMU-2) · **Dal:** `dev` · **Kod tabanı:** `858c139a` · **Tarih:** 29.09.2026

Kart açıklaması worker pane'inden okunamıyor (`list_tasks` yalnız başlığı döndürüyor). Kapsam, kartın başlığından, pane görev metninden ve kaynak belgelerden alındı: ROADMAP "Pilot kapıları" satır d, `agency-channel-notice-addendum.md` §7 (HUKUK-1…12), `processing-register.md` §18c, `privacy-notice-gap-analysis.md` §6.

## 1. Ne yapıldı

`docs/legal/HUKUK-SORULARI-2026-09.md` yazıldı. Belge, hukukçunun okuyacağı sade Türkçeyle yazılmış tek bir soru paketidir:

- **§1 Özet tablo:** HUKUK-1…12, ana metin boşlukları ve KVKK dışı sorular, öncelik önerisiyle (HUKUK-5 = pilot kapısı d, "pilottan önce şart").
- **§2 Bugünkü durum:** koddan çıkan ve eski belgelerde yanlış ya da eksik olan dört konu (aşağıda §4 Riskler).
- **§3 Ana sorular:** HUKUK-5, HUKUK-11 ve HUKUK-12. Her birinde bağlam, bugünkü uygulama (numaralı ve koddan doğrulanmış), alt sorular (5a-5d, 11a-11d, 12a-12d) ve "cevaba göre ne değişir" tablosu var.
- **§4:** HUKUK-1, 2, 3, 4, 6, 7, 8, 9 ve 10 aynı iskeletle, bugünkü koda göre güncellendi. HUKUK-6 ve HUKUK-10 esaslı olarak değişti, çünkü B3 raporu ve kayıt ekranı onayı artık kodda.
- **§5:** ana aydınlatma metninin açık `<<HUKUK: …>>` alanlarının başlık özeti (gap analizi §6'ya işaret eder).
- **§6:** KVKK dışı sorular (OKA S1/S2, İlkadım S1 22/d).
- **§7:** hukukçunun dolduracağı cevap tablosu.
- **§8:** ürün ekibi için kod-belge farkları.

## 2. Kanıt

Her teknik iddia `dev` `858c139a` üzerinde kaynak koddan okundu. Belgede her bölümün "Kanıt" satırında dosya:satır var. Öne çıkan doğrulamalar:

```
src/lib/agency/funnel.ts:61      export const SMALL_CELL_THRESHOLD = 5;
src/lib/agency/funnel.ts:168     export function roundToFive(value: number)
src/lib/agency/funnel.ts:453     // NULL = no date window
src/lib/inngest/jobs/agency-monthly-report.ts:26   triggers: [{ cron: '0 6 1 * *' }, …]   ("No e-mail: the agency downloads it")
src/lib/legal/consent-documents.ts:95   export const AGENCY_CHANNEL_ADDENDUM … version: '2026-09-29.1'
src/lib/oauth-registration.ts:228       name: `${input.userName || 'My'} Organization`,
src/lib/oauth-registration.ts:231       orgType: 'SME',
src/app/[locale]/login/AuthCard.tsx:129 const [importReadiness, setImportReadiness] = useState(false);
prisma/migrations/add-tenant-province.sql:54  … Organisation data, not personal data.
```

- `grep "tenant.update" src`: yalnız il (`settings/profile/actions.ts:39`), ajans türü, ortak marka ve SSO alanı güncelleniyor. Kurum adını ya da türünü değiştiren bir kod yok.
- `grep "auditEvent.deleteMany|agency.invite.rejected" src`: denetim kaydını silen kod yok. Reddedilen kod satırları hiçbir ekranda gösterilmiyor (yalnız `funnel.ts:44` yorumunda geçiyor).
- `messages/tr.json` `legal` altında "ajans", "kalkınma", "karne", "hazırlık" geçiş sayısı: 0 (python sayımı).
- Gizleme kuralı testleri:

```
$ npx vitest run src/lib/agency/funnel.test.ts src/lib/agency/funnel.attack.test.ts src/lib/province.test.ts src/lib/agency/report.test.ts
 Test Files  4 passed (4)
      Tests  64 passed (64)
```

- `npx prettier --write docs/legal/HUKUK-SORULARI-2026-09.md` → temiz.

## 3. Değişen dosyalar

- `docs/legal/HUKUK-SORULARI-2026-09.md` (yeni)
- `docs/agent-results/TASK-MUMH7OISNJ5OV-cs-fb.md` (bu rapor)

Kod değişmedi. Ek taslağı ve envanter bilerek **değiştirilmedi**; kapsam yalnız soru paketi.

## 4. Riskler (koddan bulundu, belgenin §2 ve §8'inde yazılı)

1. **Ek taslağı bayat.** `agency-channel-notice-addendum.md` B3 raporunun (`d091cf72`) ve kayıt ekranındaki ek onayının (`9fbc81f8`) kodda olmadığını söylüyor. İkisi de kodda. Soru paketi bugünkü koda göre yazıldı. Ekin ve envanter §18c'nin güncellenmesi ayrı bir iş.
2. **Kurum türü her kayıtta KOBİ** (`oauth-registration.ts:231`). Belediye pilotunda ajansın "kurum türü" kırılımı anlamsız çıkar. Bu bir ürün hatası, kart açılmalı.
3. **Kurum adı = "<kişi adı> Organization"** (`:228`), ürün içinde değiştirilemiyor. Bu, HUKUK-4 ve HUKUK-11'in "kurum verisi / kişi verisi" ayrımını her kurum için gündeme getiriyor. Soru olarak 11a ve HUKUK-4'e eklendi.
4. **Kayıt ekranı kısa metni** ajansın gördüğü sekiz adımdan yalnız üçünü sayıyor; kırılım, yuvarlama ve rapordan söz etmiyor. Soru olarak HUKUK-10 (c)'ye eklendi.
5. **İl açıklaması kodsuz kayıtta** "ajans raporlarında kullanılır" diyor. Soru olarak 11c'ye eklendi.
6. **Aylık rapor dosya olarak ajansta süresiz kalıyor.** Bu, zaman kanalını besliyor. Soru olarak 5d'ye ve HUKUK-6'ya eklendi.

## 5. Açık sorular

- Öncelik sütunu bir **öneri**. Pilot kapısı (d) resmî olarak yalnız HUKUK-5. HUKUK-11, HUKUK-12, HUKUK-10 ve HUKUK-1'in de pilottan önce gerekip gerekmediğine ürün sahibi karar vermeli.
- Belgenin hukukçuya kimin, hangi kanaldan göndereceği belli değil (patron işi).

## 6. Sonraki adım

- Patron ya da ürün lideri belgeyi hukukçuya gönderir. Cevaplar §7 tablosuna işlenir.
- Kart açılması önerilenler: (a) ek taslağını ve envanter §18c'yi B3 ve ek onayıyla hizalamak (cs-fb); (b) kayıtta kurum türü ve adı (be-fb/fe-fb, §8 madde 2-3); (c) `Auth.provinceHint` kodsuz metni (fe-fb).

## Platform beyanı

Doğrulama **macOS**'ta (Darwin 27.0.0) yapıldı: kaynak kodu okuma, `grep` ve vitest birim testleri. Değişiklik yalnız belge (Markdown); platforma bağlı kod yolu yok. Windows ve Linux'ta çalıştırılmadı, çünkü çalıştırılacak kod değişikliği yok. Vitest testleri saf TypeScript olduğu için CI'da (Linux, `pnpm test`) da aynı sonucu verir.
