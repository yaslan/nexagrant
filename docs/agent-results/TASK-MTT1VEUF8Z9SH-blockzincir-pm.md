# TASK-MTT1VEUF8Z9SH — DualApprovalStep saklaması adıyla beyan edilsin

**Durum:** DONE
**Commit:** `6f09c26` (dev)
**Kapsam:** yalnızca `docs/` — `prisma/schema.prisma`, migration, `src/`, i18n mesaj dosyaları dokunulmadı (bkz. "Kapsam doğrulaması").

## Not — devralınan yarım iş

Bu kart bir kez başarısız olmuştu (pane kayboldu, kanıt yazılmadı) ama çalışma ağacında `docs/legal/processing-register.md` üzerinde yarım kalmış bir §12/§19 taslağı vardı. Sıfırdan başlamadım; `git diff` ile önceki taslağı okudum, üstüne devam ettim ve bitirdim. Nihai commit tek seferde atıldı, önceki yarım hâl commit edilmemişti.

## (a) processing-register.md §12 — 10 alan, adıyla beyan

Patron kararı (A4 brifingi, Seçenek C) uygulandı: `actorUserId` **ve** `actorName` ayrı ayrı, ikisi birlikte beyan edildi — yalnızca id'yi yazıp ekranda duran adı atlamak (brifingde reddedilen Seçenek A) yapılmadı.

10 alan:
1. Sorumlu/işleyen rolü
2. Veri kategorileri — `actorUserId` + `actorName`/`approvalSubmittedByName`, ikisi ayrı ayrı gerekçelendirilmiş
3. İlgili kişi kategorileri
4. Amaç
5. Hukuki sebep (işleme) — KVKK md.5/2-f / GDPR art.6(1)(f)
6. Hukuki sebep (saklama/silinmeme istisnası) — **KVKK md.5/2-e (bir hakkın tesisi, kullanılması veya korunması) / GDPR art.17(3)(e) (establishment, exercise or defence of legal claims)** — bent adıyla
7. Alıcı ve yurt dışı aktarım
8. Saklama süresi — **belirsiz bırakılmadı**: `FollowupDoc.signedAt`'tan itibaren TBK md.146 genel zamanaşımı (10 yıl) esas alındı, açıkça "VARSAYIM — A1 hukuk girdisiyle (TASK-MTSWIFJKGTYC) kesinleşecek" diye işaretlendi (uydurma kesin süre değil, gerekçeli varsayılan)
9. Teknik-idari tedbir (bütünlük kuralı) — hangi koda bağlı olduğu dosya+satır ile gösterildi
10. Aydınlatma metni durumu — TR/EN taslak cümle yazıldı, "A1/TASK-MTSWIFJKGTYC ile yayına alınacak" diye işaretlendi; **i18n dosyalarına eklenmedi**

### Kanıt — actorName gerçekten ekranda görünüyor

```
$ grep -n "actorName" "src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/client.tsx"
427:                  {formatDateTime(entry.timestamp)} · {entry.department} · {entry.actorName}
```
Bu satır onay denetim izi (`approval.auditTrail`) listesinde her satırı tarih · departman · **ad** olarak render ediyor — id değil, ad. Beyanın "ekranda duran adı da kapsaması" gerekçesi budur.

### Kanıt — bütünlük kuralının koda bağlılığı

```
$ sed -n '1247,1268p' prisma/schema.prisma
/// One department sign-off in the M10 dual approval flow (FINANCE or LEGAL).
///
/// The two four-eyes rules are unique indexes, not app-level checks:
///   @@unique([followupDocId, department])  — a department signs a document once
///   @@unique([followupDocId, actorUserId]) — a person signs at most one department
/// `actorUserId` is deliberately not a foreign key: an approval is a signature, and
/// the record must outlive a change to the user row that made it.
model DualApprovalStep {
  ...
  @@unique([followupDocId, department])
  @@unique([followupDocId, actorUserId])
  @@index([tenantId, followupDocId])
}
```
İki bütünlük kısıtı DB benzersiz indeksi (`@@unique`), uygulama kodunda ayrı bir kontrol değil. `actorUserId`'nin FK olmama gerekçesi (satır 1252-1253) doğrudan saklama alanının (madde 6/8) dayanağı: kayıt, kullanıcı satırındaki bir değişikliği (silme dahil) atlatmak üzere tasarlanmış.

## (b) SECURITY_COMPLIANCE.md / dpa-en.md / dpa-tr.md ↔ kod senkronizasyonu

Kendi önceki raporumda (TASK-MTSWKDRJX456I, processing-register.md §19) bildirdiğim çelişki kapatıldı:

- `docs/SECURITY_COMPLIANCE.md` satır 102 (alt işleyen listesi): PostHog ve Sentry listeden çıkarıldı, ikisinin de neden orada olmaması gerektiği (analytics stub, Sentry bilinçli kaldırma — 2026-09-07 patron kararı, gerekçe: veri dışarı çıkmasın) eklendi.
- `docs/SECURITY_COMPLIANCE.md` satır 145: "Sentry PII kapalı" iddiası kaldırıldı (var olmayan bir yapılandırmaya atıfta bulunuyordu), yerine Sentry'nin kullanılmadığı ve gerekçesi yazıldı.
- `docs/legal/dpa-en.md` ve `docs/legal/dpa-tr.md` §7: "error monitoring"/"hata izleme" alt işleyen kategorisi kaldırıldı (bu bir üçüncü tarafa gitmiyor), yerine bunun bugün tamamen iç `SystemAlert` ile yürütüldüğünü ve ileride bir sağlayıcı eklenirse bu bölümün güncelleneceğini açıklayan bir not eklendi.
- `processing-register.md` §19 başlığı ve kapanış paragrafı "düzeltildi" olarak güncellendi, hangi üç belgenin hangi satırlarının değiştiğini ve kanıtı gösteriyor.

### Kanıt — kodda PostHog/Sentry yok

```
$ grep -rn "posthog\|@sentry\|Sentry.init" src/
(sonuç yok)
```

## Kapsam doğrulaması

```
$ git show --stat HEAD
 docs/SECURITY_COMPLIANCE.md       |  4 ++--
 docs/legal/dpa-en.md              |  4 +++-
 docs/legal/dpa-tr.md              |  4 +++-
 docs/legal/processing-register.md | 27 ++++++++++++++++-----------
 4 files changed, 24 insertions(+), 15 deletions(-)
```
Yalnızca 4 dosya, hepsi `docs/` altında. `prisma/schema.prisma`, migration, `src/`, `messages/tr.json`, `messages/en.json` dosyalarına dokunulmadı (bu tur bu dosyalar geli-tirici'nin sahipliğinde).

Paylaşılan worktree kontrolü: commit'e yalnızca bu kartın 4 dosyası girdi, başka bir ajanın dosyası karışmadı.

## Kapsam dışı — dokunulmadı

- `Relationship.ownerUserId` nullable yapılıp imhada koparılması — **ayrı kart TASK-MTT1XL9NP2QYU**, migration kilidi açılınca işlenecek.
- Aydınlatma metninin i18n dosyalarına eklenmesi — **A1/TASK-MTSWIFJKGTYC** ile yayına alınacak, bu kartta yalnızca taslak metin yazıldı.

## Kapı çıktıları

```
$ pnpm lint
✖ 2 problems (0 errors, 2 warnings)   # docs/agent-results/ altında önceden var olan iki uyarı, bu kartla ilgisiz

$ pnpm typecheck
(temiz — hata yok)

$ pnpm test
 Test Files  125 passed | 2 skipped (127)
      Tests  1481 passed | 8 skipped (1489)
```
