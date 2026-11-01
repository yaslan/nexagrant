---
görev: FO-137 — Partner Search özetlerini okuma/gösterim yolunda da maskele (maskContact)
kod: TASK-MVNI1Y0M3C4B2
ajan: se-fb
tip: bug (güvenlik/GDPR, FO-65 §F3 kalan kısmı)
hüküm: TAMAM — dev'de özet okuyan istemciye açık bir yol YOK; ileride kullanılacak okuma yardımcısı `toPublicSummary` + birim test + "maskesiz okuyucu" muhafızı eklendi. FO-61/FO-62 dallarında tüm okuma yolları zaten sunucuda maskeli (kanıt aşağıda). Tarayıcı ekran görüntüsü alınmadı: dev'de gösterim yolu yok.
platform: mac (Darwin) üzerinde doğrulandı
---

# TASK-MVNI1Y0M3C4B2 (FO-137) — Partner Search okuma yolu maskesi — se-fb

**Hüküm:** Dev'de (`origin/dev@86a1a1d0`) `PartnerSearchAnnouncement.description` ya da `RawFetch.payload` özetini istemciye, yanıta ya da dosyaya taşıyan HİÇBİR yol yok. Kart "yeni sayfa/özellik icat etme" dediği için `read.ts` içinde `toPublicSummary(row)` + birim test eklendi. Henüz dev'de olmayan FO-61 (PR #165) ve FO-62 (PR #167) dalları incelendi: üç okuma yolunun (liste, kuruluş, dışa aktarım JSON/CSV) hepsi sunucuda `toAnnouncementDto` → `maskContact` üzerinden geçiyor. Kod yazılmadı o dallara.

**Platform beyanı:** mac (Darwin) üzerinde doğrulandı. Dokunulan kod saf TS (string işleme + dosya tarama testi); süreç öldürme, kabuk, dosya yolu ayrımı ya da ekran/DPI bağımlılığı yok. Test, yol ayracını `path.sep` → `/` çevirerek karşılaştırıyor, Windows'ta da aynı çalışır; Windows/Linux'ta KOŞULMADI (makine yok), kodda platforma bağlı satır yok.

## Ne yapıldı
- `src/modules/m1/server/partner-search/read.ts` (yeni, 24 satır): `toPublicSummary(row: { description: string | null }): string | null` = `maskContact(row.description)`. Kendi regex'i yok; kural yalnız `mask.ts`'te.
- `tests/partner-search-read.test.ts` (yeni): 5 davranış testi + bir kaynak-tarama muhafızı.
- `mask.ts` ve `ingestor.ts` DEĞİŞMEDİ (`git diff origin/dev..HEAD --stat` yalnız 2 yeni dosya).

## Kanıt

### 1. Keşif tablosu — yol · gösterilen alan · maskeli mi

| # | Yol | Dal | Ne okuyor / gösteriyor | Maskeli mi |
|---|---|---|---|---|
| 1 | `ingestor.ts` `writeTopic` (`partnerSearchAnnouncement.findMany` :345) | dev | `description` yalnız yeni taramayla karşılaştırmak için (`announcementChanged`); sunucu içi, çıktıya gitmez | Gerekmiyor (istemciye gitmiyor). Yazarken `maskRow` (:210) maskeliyor |
| 2 | `ingestor.ts` `refreshOrganisationFlags` (:506) | dev | yalnız `lastSeenAt` | Metin yok |
| 3 | `ingestor.ts` `elsewhere` (:375) | dev | yalnız `externalId` | Metin yok |
| 4 | `retention.ts` (:61, SQL DELETE :75-84) | dev | silme; id seçer | Metin yok |
| 5 | `RawFetch.payload` okuyucuları | dev | `ingestor.ts:485` yalnız `hash` okur; `retention.ts` siler. Payload'ı gösteren/dışa veren kod yok | Metin yok (yazarken maskeli: `rows = result.rows.map(maskRow)`) |
| 6 | `PartnerOutreach.tsx` / `outreach.ts` | dev | yalnız dış arama linki; ilan özetini göstermiyor (`sanitizeQueryText` ayrı, URL sorgusu için) | Özet yok |
| 7 | CSV/export (dev) | dev | yok | – |
| 8 | `GET /api/partner-search/announcements`, `/api/v1/…` (liste) | **FO-61 #165, dev'de DEĞİL** | `description` (`http.ts:125-129` `rows.map(toAnnouncementDto)`) | **Evet** — `api.ts:187` `description: maskContact(row.description)` |
| 9 | `GET /api/organizations/:pic/announcements` | **FO-61, dev'de DEĞİL** | aynı `readAnnouncementPage` + `toAnnouncementDto` | **Evet** |
| 10 | `GET /api/partner-search/announcements/export` JSON + CSV | **FO-61, dev'de DEĞİL** | `http.ts:205-215` `found.rows.map(toAnnouncementDto)` → `toExportJson` / `toExportCsv` | **Evet**; CSV hücreleri `csvCell` (api.ts:345); FO-61 testi `csv` içinde ham e-posta yok + `=HYPERLINK` kaçışlı |
| 11 | `GET /api/topics/:id/partner-signal` | FO-61 | yalnız `type, country, organizationType` | Metin yok |
| 12 | FO-62 UI (`AnnouncementCard.tsx:133` `a.description`, `AnnouncementBrowser`, `OrganizationAnnouncements`, `ActiveAnnouncementsBadge`, `PartnerSignalBox`) | **FO-62 #167, dev'de DEĞİL** | özet metni yalnız `fetch('/api/…')` yanıtından (satır tabloda aşağıda); UI'da Prisma yok | **Evet** (yanıt maskeli geliyor; FO-62 dalındaki `api.ts` aynı `toAnnouncementDto`) |

FO-62 UI'nın tüm veri kaynağı (`git grep` çıktısı):
```
ActiveAnnouncementsBadge.tsx:12  fetch(`/api/organizations/${pic}/announcements?page=1`
AnnouncementBrowser.tsx:76       fetch(`/api/partner-search/announcements?${…}`
OrganizationAnnouncements.tsx:42 fetch(`/api/organizations/${pic}/announcements?page=1`
PartnerSignalBox.tsx:55          fetch(`/api/topics/${…}/partner-signal`
(prisma / withTenant içeren UI dosyası: 0)
```
FO-61 ve FO-62'de `partnerSearchAnnouncement` okuyan tüm yerler (`git grep`): `api.ts` 3 okuyucu (:212 liste, :254 sinyal [metin yok], :363 export) + dev'dekiler. Üç dalda da liste ve export `http.ts` içinde `toAnnouncementDto` ile map'leniyor (çıktı yukarıda 8-10). **FO-61/FO-62 API yanıtında maskesiz özet bulunmadı.**

### 2. Tek maske, ikinci kopya yok (grep)
```
$ grep -rn "maskContact" src | grep -v mask.ts
src/modules/m1/server/partner-search/read.ts:14:import { maskContact } from './mask';
src/modules/m1/server/partner-search/read.ts:23:  return maskContact(row.description);
src/modules/m1/server/partner-search/ingestor.ts:15:import { maskContact } from './mask';
src/modules/m1/server/partner-search/ingestor.ts:210:  return { ...row, summary: maskContact(row.summary) };
```
Başka e-posta/telefon regex'leri var ama özet maskelemesi değil: `src/modules/m1/outreach.ts:60,64` (`sanitizeQueryText`, dış arama URL'si için, FO-65 §1; bu kartın kapsamı dışı, dokunulmadı), doğrulama regex'leri (`lead-form.tsx`, `invitations/route.ts` vb.).

### 3. Birim test (hedefli)
```
$ vitest run tests/partner-search-read.test.ts tests/partner-search-mask.test.ts
 Test Files  2 passed (2)
      Tests  42 passed (42)
$ vitest run (read, mask, core, ingestor, adapter, where-guard-src)
 Test Files  6 passed (6)
      Tests  98 passed (98)        skipped: 0
```
Davranış testleri (`tests/partner-search-read.test.ts`):
- e-posta + telefon: `'Contact jane.doe@example-org.eu or +32 2 123 45 67.'` → `'Contact [email] or [phone].'`
- **maskesiz eski satır:** `'Kontakt: m.mueller(at)tu-x.de, Tel. 030 / 1234567'` → `'Kontakt: [email], Tel. [phone]'`
- zaten maskeli satır olduğu gibi kalır (çift maskeleme yok); tarih/bütçe/PIC değişmez; `null` → `null`.

**Mutant (muhafız gerçekten ısırıyor):** `src/modules/m1/server/tmp-mutant-leak.ts` ile `prisma.partnerSearchAnnouncement.findMany({select:{description:true}})` eklendi, test kırmızı:
```
FAIL … announcement readers mask on the server (FO-137) > src/modules/m1/server/tmp-mutant-leak.ts
AssertionError: … reads partnerSearchAnnouncement but never calls maskContact / toPublicSummary
Tests  1 failed | 8 passed (9)
```
Dosya silindi, `git status` temiz (yalnız iki yeni dosya).

Muhafız kuralı: `partnerSearchAnnouncement.find*` çağıran her üretim dosyası `maskContact` ya da `toPublicSummary` içermeli; istisna yalnız `ingestor.ts` ve `retention.ts` (istemciye satır göndermezler). FO-61 merge olunca `api.ts` `maskContact` import ettiği için geçer (FO-61 dalında okundu).

### 4. lint / typecheck
```
pnpm lint       → ✖ 4 problems (0 errors, 4 warnings)   (uyarılar dokunmadığım test dosyalarında: settings-profile-update, …)
pnpm typecheck  → tsc --noEmit, çıktı yok, exit 0
```
(Taze worktree'de önce `pnpm db:generate` gerekti; üretilmeden typecheck 2 kodlu hata veriyordu.)

### 5. Tam gate (makinede tek başına, izole DB)
İzole Postgres 16 (`fo137-pg`, 127.0.0.1:55137, db `fabrika_gate`), MinIO 9137; ortak 5433 kullanılmadı. Kapı kilidi (`gate-lock`) başka bir ajanın gate'ini bekletti, benimki sırayla tek başına koştu.
```
GATE_EXIT=0
 Test Files  410 passed | 3 skipped (413)
      Tests  5385 passed | 57 skipped (5442)
e2e: 406 passed, 4 skipped (8.8m)
```
**Skipped sayısı: vitest 57 test (3 dosya), e2e 4.** Bu kartın testlerinde skipped 0.

İlk koşu GATE_EXIT=1 idi (2 e2e kırmızı: `expert-prereg.spec.ts:193`, `team-members-ui.spec.ts:130`, ikisi de posta). Sebep kod değil ortam: `playwright.config.ts:61` SMTP'yi `localhost:1025`'e sabitliyor, ben mailpit'i 1137'de açmıştım. `E2E_MAILPIT_URL`'i paylaşımlı `fabrika-mailpit` (8025) yaptım ve gate'i baştan koştum → exit 0. Testi gevşetmedim.

### 6. Tarayıcı kanıtı
**Alınmadı.** Kart "gösterim yolu varsa" diyor; dev'de özet gösteren sayfa/endpoint yok (yukarıdaki tablo). FO-62 (#167) merge olunca ağ yanıtı + TR/EN ekran görüntüsü doğrulaması FO-62 kartının işi; aşağıda takip önerisi.

## Değişen dosyalar
- `src/modules/m1/server/partner-search/read.ts` (yeni)
- `tests/partner-search-read.test.ts` (yeni)
- `docs/agent-results/TASK-MVNI1Y0M3C4B2-se-fb.md` (bu rapor)

## Riskler
1. **Arama oracle'ı (düşük, varsayım):** FO-61 `announcementWhere` `q` filtresini ham saklı `description` üzerinde `contains` ile yapıyor. Maskesiz eski bir satır varsa, `q=jane@example.org` gibi bir sorgu o satırı döndürür (metin maskeli gelse de "bu e-posta bir ilanda geçiyor" bilgisi sızar). Eski maskesiz satır olup olmadığı ÖLÇÜLMEDİ (canlı DB'ye bakılmadı). Hafifletici: ingestor her taramada satırı maskeli yeniden yazıyor (`update` her seferinde), yani açık ilanlar bir sonraki taramada iyileşir; kapalı konular retention ile silinir.
2. **İki giriş noktası:** FO-61 `toAnnouncementDto` doğrudan `maskContact` çağırıyor, `toPublicSummary` değil. Davranış aynı; ileride biri bir yola unutursa muhafız testi yakalar. Tek kapı isteniyorsa FO-61'e tek satırlık değişiklik (aşağıda öneri).
3. **`mask.ts` dev'de eski sürüm:** FO-61 round 3 `mask.ts`'e LinkedIn profili ve " dot " kalıbını ekliyor (diff okundu). Dev'de bu iki desen henüz yok; FO-61 merge ile gelir. Bu kartta `mask.ts` değişmedi.
4. Muhafız yalnız `partnerSearchAnnouncement.find*` çağrılarını görür. Ham SQL (`$queryRaw … "PartnerSearchAnnouncement"`) ile okuyan yeni bir yolu görmez; bugün böyle bir yol yok (grep boş).

## Açık sorular
- Canlıda (ya da dev) maskesiz yazılmış satır var mı? FO-120 öncesi ingestor çalıştıysa evet olabilir. Tek seferlik SQL sayımı (`description ~ '@'`) ayrı kartta yapılabilir; bu kart canlı DB'ye dokunmadı.

## Sonraki adım
- **Takip kartı önerisi 1 (be-fb, FO-61 #165):** `toAnnouncementDto` içinde `maskContact(row.description)` yerine `toPublicSummary(row)`; `q` filtresi için karar: eski satır yoksa dokunma, varsa tek seferlik maskeleme backfill'i.
- **Takip kartı önerisi 2 (fe-fb, FO-62 #167 merge sonrası):** gerçek tarayıcıda e-posta/telefonlu eski satır ile TR+EN ekran görüntüsü + ağ yanıtında ham iletişim bilgisi olmadığının gösterimi.
- Bu PR dev'e draft açılır, merge edilmez.
