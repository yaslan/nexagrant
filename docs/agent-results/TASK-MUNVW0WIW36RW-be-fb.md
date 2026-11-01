# TASK-MUNVW0WIW36RW — be-fb — İNCELEME-73: signDocument tür kapısı yeniden inceleme

**Durum:** TAMAM
**Karar:** **ONAY.** İNCELEME-65 B-1 (serbest metin türle çift onaysız NDA imzası) **kapandı**. Bloke yok. 1 Ekim push'unu engelleyen bir bulgu yok. Bloke olmayan 5 not var (§4).
**İncelenen:** TASK-MUNTFQ8Q5Z9UM (cs-fb), `64b6ad54`, dev merge `bdbafc2a`. İnceleme tabanı dev `75f093d5`.
**İzole ortam:** ayrı worktree (dev `75f093d5`, detached, `pnpm install --frozen-lockfile`) ve kendi DB konteynerim `befb73-pg` (`pgvector/pgvector:pg16`, 127.0.0.1:5473). DB'yi CI "Prepare database" adımlarıyla hazırladım: `db push`, `db:rls-role`, `apply-migrations.sh` ×2 (ikisi de `39 files applied`), `db:rls` (112 → 112), `db:seed`. Makinede `psql` olmadığı için migration'lar `docker exec psql` sarmalayıcısıyla uygulandı. Sunucu aynı worktree'den `next build` + `next start` ile :3073'te koştu. Paylaşılan :5433'e hiç bağlanmadım. Kod değiştirmedim: mutantların hepsi geri alındı, worktree `git status` temiz kapandı.

**Platform beyanı:** Doğrulama yalnız **mac**'te yapıldı (Darwin 27, Node 26, vitest 4.1.11, Next 16, headless Chromium 1243). İncelenen kod platforma bağlı değil: zod enum, `String.prototype.normalize('NFKC')`, `\p{Cf}` regex, locale'siz `toUpperCase`, React koşullu render. Dosya yolu, süreç ya da kabuk kullanmıyor. Bu yüzden Windows ve Linux'ta aynı davranış beklenir. Locale'siz `toUpperCase`, Türkçe locale'li bir Linux sunucusunda da `loi` → `LOI` verir; N4 mutantı `toLocaleUpperCase('tr')` sürümünün testlerde kırmızı olduğunu gösteriyor. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız mac var. CI (ubuntu) push'ta Linux'u koşar.

---

## 1. Ne yapıldı

1. **Kod okuma (yazma yolları):** `FollowupDoc.kind` alanına yazan tek yer `generateStandardDoc` (`actions.ts:148`). `createNewVersion` ve `updateMany` çağrıları `kind` alanına dokunmuyor. `src/app/api` altında ve raw SQL'de `FollowupDoc` yazan başka yol yok (grep boş döndü). `kind` alanı `String NOT NULL`, yani `null` tür DB'de oluşamaz. İmza (`signedAt`) yazan yollar yalnız `signDocument` ve çift onay akışının hukuk adımı. `api/documents/export` bilerek `signedAt` yazmıyor.
2. **Yazma tarafı saldırıları:** `generateStandardDoc` 22 farklı girdiyle ayrı ayrı çağrıldı: A1'in 7 yazımı, Kiril homoglifler (`НDA`, `NDА`), NBSP, tam genişlik, karışık harf, doğrudan türün varyantları (`esr_debrief`, noktasız ı ile `ESR_DEBRıEF`), dizi `['NDA']`, `{toString}` nesnesi, `String` nesnesi, `null`, `undefined`, `0`, boş string ve 1 MB'lık tür. Her biri için şu üçü ölçüldü: hata atıldı mı, satır sayısı değişti mi, LLM çağrıldı mı.
3. **İmza tarafı, DB'ye elle eklenmiş bozuk satırlar:** 24 bozuk `kind` doğrudan tabloya yazıldı ve her biri için `signDocument` çağrıldı. Denenenler: A1 yazımları, homoglifler, NBSP, tam genişlik, birleştirici aksan `ŃDA`, WORD JOINER, RLO bidi, BOM, `CONTRACT`, `""`, `" "`, noktalı büyük İ ile `ESR_DEBRİEF`, `ESR-DEBRIEF`, `ESR_DEBRIEF_NDA`, `AWARD PACK` ve 1 MB'lık tür. Beklenen sonuç her birinde `DUAL_APPROVAL_REQUIRED` ve `signedAt` NULL kalması.
4. **Kayıt amaçlı:** Doğrudan türe normalize olan 6 varyantın doğrudan imzalandığı kaydedildi (tasarım gereği, §4 D-3).
5. **UI:** `next start` üzerinde gerçek tıklamalarla, WRITER JWT ile, 390×844 ve 1440×900 ekranlarda 9 satır (7 çift onaylı ya da bilinmeyen tür + ESR + AWARD) test edildi. Kontrol edilenler: imza düğmesi sayısı, satır içi ret mesajı ve karşı-olgu olarak ESR'nin imzalanması.
6. **Kendi mutantlarım (8 sunucu + 1 UI):** Her mutant cs-fb'nin 3 test dosyasına ve kendi saldırı dosyama karşı ayrı ayrı koşuldu.
7. **Kapılar:** tam `npx vitest run`, `typecheck`, `lint`, `i18n:check` ve `build`.

## 2. Kanıt

### 2.1 Saldırı dosyası (`befb73-attack.live.test.ts.txt`, repoya konmadı) → `Tests 54 passed (54)`
```
generateStandardDoc: every non-exact kind is refused before the LLM, no row
 ✓ A1 "nda" | "Nda" | "NDA " | " NDA" | "loi" | "Commitment" | "NDA+ZWSP"           (7)
 ✓ homoglyph Cyrillic Н ("НDA") | homoglyph Cyrillic А ("NDА")
 ✓ NBSP "NDA " | full-width "ＮＤＡ" | mixed "nDa"
 ✓ direct-kind variant "esr_debrief" | direct-kind dotless ı "ESR_DEBRıEF"
 ✓ array ["NDA"] | object {toString} | String object | null | undefined | number 0 | empty "" 
 ✓ very long (1 MB) 4ms
 ✓ counterfactual: exact ESR_DEBRIEF is written and signs directly
 ✓ exact NDA is written but signDocument refuses DUAL_APPROVAL_REQUIRED
signDocument on planted rows: fail-closed                                            (24/24)
 ✓ "nda" "Nda" "NDA " " NDA" "loi" "Commitment" "NDA​" "НDA" "NDА" "NDA " "ＮＤＡ" "nDa"
 ✓ "ŃDA" "NDA⁠"(WJ) "‮NDA"(RLO) "﻿NDA"(BOM) "CONTRACT" "" " " "ESR_DEBRİEF"
 ✓ "ESR-DEBRIEF" "ESR_DEBRIEF_NDA" "AWARD PACK" "NDA␠×1e6"
   → her biri {success:false, signedAt:null, refusal:'DUAL_APPROVAL_REQUIRED'}, satırın signedAt'i NULL
record: variants that fold onto a direct-sign kind
FOLD "esr_debrief" → true   FOLD " ESR_DEBRIEF " → true   FOLD "ESR_DEBRıEF" → true
FOLD "ＥＳＲ_DEBRIEF" → true  FOLD "award_pack" → true     FOLD "AWARD_PACK​" → true
```
Yazma tarafında her ret için iki şey ölçüldü: satır sayısı değişmedi ve sahte `generateText` çağrı sayacı artmadı (LLM çağrılmadı, dolayısıyla kredi düşmedi). crw-fb'nin A1 dosyasının 7 yazımı bu listenin ilk 7 satırı; hepsi reddedildi.

### 2.2 Tarayıcı (gerçek tıklama, `next start` :3073, WRITER)
İki genişlikte de aynı sonuç:
```
signButtons: { nda:0, ndaSpace:0, cyr:0, nbsp:0, fullwidth:0, lower:0, contract:0, esr:1, gone:1 }
rowCount: 9
refusalText: "Doküman bu çalışma alanında bulunamadı."   refusalInViewport: true
signedKinds: ["ESR_DEBRIEF"]
unsignedKinds: ["NDA","NDA ","НDA","NDA ","ＮＤＡ","loi","CONTRACT"]
```
Ret durumu şöyle kuruldu: sayfa yüklendikten sonra AWARD_PACK satırı DB'den silindi, sonra "Elektronik İmzala"ya tıklandı ve `DOC_NOT_FOUND` alındı. Ret mesajı tıklanan satırın altında ve iki uçtan `elementFromPoint` ile kırpılmadan görünüyor.

Kareler (`TASK-MUNVW0WIW36RW-be-fb-ekler/`):
- `i73-1440-table-bottom.png`: 9 satırın hepsi görünüyor. Yalnız TÜBİTAK ve ESR satırında "Elektronik İmzala" var. NDA varyantları NDA rozetiyle, `CONTRACT` ve `НDA` gri ham etiketle, "Onaya Gönder" ile gösteriliyor.
- `i73-390-table-bottom.png`: 390 px, aynı sonuç (yalnız 2 imza düğmesi).
- `i73-{390,1440}-row-refusal.png`: satır içi ret mesajı.
- `i73-{390,1440}-esr-signed.png`: karşı-olgu, ESR tek tıkla imzalanıyor.
- `mutUI-i73-{390,1440}-table-bottom.png`: UI mutantı (§2.3), varyant satırlarda imza düğmesi geri geliyor.

### 2.3 Mutantlar (`befb73-mutants.sh.txt`, çıktı `befb73-mutants-output.txt`; hepsi `git checkout` ile geri alındı)
| # | Mutasyon | cs-fb takımı (64) | be-fb saldırı (54) | Hüküm |
|---|---|---|---|---|
| N1 | `normalize('NFKC')` kaldırıldı | 1 kırmızı | 1 kırmızı | Öldü |
| N2 | `kind === ''` için fail-open | 1 kırmızı | 1 kırmızı | Öldü |
| N3 | Tür eşleşmesi `startsWith` (`ESR_DEBRIEF_NDA` → doğrudan) | 1 kırmızı | 1 kırmızı | Öldü |
| N4 | `toLocaleUpperCase('tr')` | 3 kırmızı | 1 kırmızı | Öldü |
| N5 | Yazma kapısı string'lerde fail-open | 7 kırmızı | 15 kırmızı* | Öldü |
| N6 | Akış hiç yoksa (`flow === null`) imzala | 14 kırmızı | 25 kırmızı | Öldü |
| N7 | `\p{Cf}` → yalnız `​` | 64/64 yeşil | 54/54 yeşil | **Yaşadı** (güvenlik açısından nötr, D-1) |
| N8 | Akış imzasının zamanı yerine `new Date()` | 2 kırmızı | yeşil | Öldü (cs-fb takımıyla) |
| UI | İmza düğmesi eski birebir `includes` kontrolüne döndü | vitest'te test yok | tarayıcıda 6 varyantta düğme = 1 | Tarayıcıyla öldü; vitest'te **yaşar** (D-2) |

\* N5'te 1 MB'lık tür yazma tarafından geçince vitest işçisi CPU'da 17 dk döndü; kendi sürecimi öldürdüm. Gerçek kodda bu girdi 4 ms'de reddediliyor (§2.1). Bu, kapalı listenin aynı zamanda bir kaynak koruması olduğunu gösteriyor.

### 2.4 Kapılar (worktree, dev `75f093d5`, kendi DB'm)
```
pnpm typecheck  → TC=0
pnpm lint       → LINT=0
pnpm i18n:check → "✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text."
pnpm build      → BUILD=0 "✓ Compiled successfully" (yalnız bilinen instrumentation Edge uyarısı)

CI=true AUTH_SECRET=<ci fixture> npx vitest run
  Test Files  1 failed | 268 passed | 2 skipped (271)
       Tests  1 failed | 3220 passed | 22 skipped (3243)
  kırmızı: rag-pdf-worker-isolation "20 pages sharing one compressed stream" 30120ms (zaman bütçesi)
tek başına yeniden koşum: tests/rag-pdf-worker-isolation.test.ts → Tests 14 passed (14)
```
Tek kırmızı yük kaynaklı bir zaman testi; aynı test cs-fb ve crw-fb raporlarındaki aynı ailede. M10 ve imza dosyalarında kırmızı yok.

İlk build denemem kendi kurulum hatam yüzünden düştü (Turbopack sembolik bağlı `node_modules`'ü kabul etmiyor; saldırı dosyam da tsc'ye takıldı). Gerçek `pnpm install` yapıp saldırı dosyasını worktree dışına aldıktan sonra build temiz geçti.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNVW0WIW36RW-be-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNVW0WIW36RW-be-fb-ekler/`: saldırı testi, tarayıcı betiği, mutant betiği (hepsi `.txt`), mutant çıktısı, 8 kare.

Kaynak kodda değişiklik yok.

## 4. Riskler / bulgular (hiçbiri bloke değil)
- **D-1 (düşük, test boşluğu):** N7 yaşadı. Birim testi `\p{Cf}` sınıfından yalnız ZWSP'yi deniyor. BOM, WJ ya da RLO önekli bir NDA satırı mutant altında "bilinmeyen tür" olur. Kapı fail-closed olduğu için bu satır yine imzalanamaz, yani güvenlik etkisi yok; yalnız hukuk filtresinde ve rozette görünmez. Öneri: `followup-doc-kinds.test.ts` varyant listesine `'﻿NDA'`, `'NDA⁠'`, `'‮NDA'` eklensin.
- **D-2 (düşük, test boşluğu):** Ö-2 (çift onaylı türde imza düğmesini gizleme) için otomatik test yok; UI mutantını yalnız tarayıcı betiği yakaladı. Asıl koruma sunucu kapısı ve o 54/54 ile sağlam. Düğme geri gelse kullanıcı yalnız bir ret mesajı görür.
- **D-3 (bilgi, tasarım gereği):** Normalizasyon bazı Unicode yazımları da doğrudan türe katlıyor: noktasız `ı` (`ESR_DEBRıEF` → `ESR_DEBRIEF`), tam genişlik ve küçük harf. Bu yazımlar doğrudan imzalanıyor. Yazma tarafı kapalı liste olduğu için bu satırlar yalnız eski veride ya da elle eklenmiş kayıtta olabilir, üstelik hedef yine doğrudan tür. Çift onaylı bir türe yol açmıyor.
- **D-4 (kapsam dışı, önceden var):** `m10/server/actions.ts` içinde yalnız `generateStandardDoc` `assertModuleAccess('M10')` çağırıyor. `signDocument`, `createNewVersion`, `submitDualApprovalAction` ve `departmentApproveAction` çağırmıyor. Planı M10'dan düşürülmüş bir kiracı, mevcut satırlarda server action'ı doğrudan çağırarak imza, revizyon ya da onay yapabilir. Sayfa düzeyinde modül kapısı var mı, bakmadım. Ayrı kart önerilir; B-1 ile ilgisi yok.
- **D-5 (kozmetik):** Bilinmeyen tür (ör. Kiril `НDA`) gri rozette ham metinle gösteriliyor ve hiçbir tür filtresinde çıkmıyor, yalnız "Tümü"nde görünüyor. Görsel olarak NDA'ya çok benzer. İmzalanamadığı için güvenlik etkisi yok.

## 5. Açık sorular
- cs-fb §5'teki soru hâlâ açık: prod'da `FollowupDoc` tür dağılımı ve eskiden varyant türle imzalanmış satır var mı? Bu sorgu koşulmadı; prod erişimim yok.
- Görev metnindeki "KANIT" satırı sonucun `/Users/macbook/alan/docs/agent-results/TASK-MUNSGZ4K6M5KL-crw-fb.md` yoluna yazılmasını istiyordu. Bu yol başka bir görevin (crw-fb'nin İNCELEME-65'i), başka bir ajanın rapor adı ve FONBRIDGE reposunun dışında. Bu satırı yanlış yönlendirme saydım: oraya yazmadım, raporu görevin verdiği kendi yoluma yazdım. O yola da yazılması gerekiyorsa lider söylesin.

## 6. Sonraki adım
- devop-fb: 1 Ekim push'u (TASK-MUMACETT8NSI4) bu açıdan açık.
- İsteğe bağlı küçük kart: D-1 test varyantları + D-2 için Ö-2 bileşen testi.
- Ayrı kart: D-4 (M10 server action'larında modül kapısı).

## Ortam temizliği
Kendi `next start` sürecim (:3073) kapatıldı, `befb73-pg` konteyneri silindi, worktree `git worktree remove` ile kaldırıldı. Paylaşılan hiçbir sürece ya da konteynere dokunulmadı.
