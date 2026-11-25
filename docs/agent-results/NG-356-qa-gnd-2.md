# NG-356 (tur 2) — fo392 exact-limit taraması düzeltmesi (B1, Ö1, Ö2) — qa-gnd

**Kart:** TASK-MWT6RBRAEFSUV (board başlığı NG-346; brief NG-356 / PR #436 olarak tanımlıyor — kullanıcı düzeltmenin `task/ng-356` dalında yapılmasını açıkça istedi)
**Dal:** `task/ng-356` · **Commit:** `1f11d1d8` · **Değişen dosya:** yalnız `tests/e2e/fo392-invite-code-limit.spec.ts`
**Platform:** Linux (WSL Ubuntu-24.04, Node v26.5.0, pnpm 11.25.0) · Windows/macOS: koşulamadı, kart kapsamı Linux; kod yolu platforma bağlı değil (HTTP yanıt metni taraması).

## HÜKÜM

Bitti: B1, Ö1 ve Ö2 düzeltildi; M2 ve M1 mutantları spec'i kırmızı yapıyor; mutantsız spec 40 tekrarda 160/160 yeşil. Push henüz doğrulanmadı (aşağıda).

## Ne yapıldı

1. **B1 (exact-limit taraması):** Tarama yeniden tüm toplanan gövdelerde (`bodies`: create yanıtı + revalide sayfa, liste yenileme, bildirim poll). Tek bilinen yanlış pozitif olan `(503 Service Unavailable` literali (`messages/tr.json` `CALENDAR_ENCRYPTION_NOT_CONFIGURED`) taramadan önce ayıklanıyor; başka hiçbir şey ayıklanmıyor. Rastgele aralık daraltılmadı.
2. **Ö1:** Düşen gövde kopyaları artık sessizce atılmıyor: `dropped` sayacı tutuluyor ve `[fo392] collected bodies=N droppedCopies=M` olarak loglanıyor. Mutantsız koşuda `droppedCopies=2` görüldü (bkz. kanıt).
3. **Ö2:** Her zaman doğru olan `expect(actions.length).toBeGreaterThan(0)` kaldırıldı.

## Kanıt (ham çıktı)

### Mutantsız, düzeltilmiş spec (tek koşu) — `/tmp/ng356-base.log` (WSL)
```
[fo392] collected bodies=8 droppedCopies=2
  ✓  233 [chromium] › tests/e2e/fo392-invite-code-limit.spec.ts:155:5 › a code with 2 places: ... (3.6s)
  ✓  234 [chromium] › tests/e2e/fo392-invite-code-limit.spec.ts:182:5 › the last place, pressed by two people ... (2.7s)
  ✓  235 [chromium] › tests/e2e/fo392-invite-code-limit.spec.ts:219:5 › a code from before FO-392 has no limit ... (1.6s)
  ✓  236 [chromium] › tests/e2e/fo392-invite-code-limit.spec.ts:228:5 › the agency panel: "Sınıra ulaştı" ... (2.4s)
```
Not: bu log tam paket çalıştırmasının ortasında SIGTERM ile kesildi (`pnpm test:e2e -- <dosya>` dosya filtresini uygulamadı; tam paket başladı). Özet satırı yok; bu yüzden "tüm paket yeşil" iddiasında bulunmuyorum. Kanıt yalnızca fo392 satırlarıdır.

### M2 — `cap: c.useLimit` `inviteCodeRow`'da (liste + revalide sayfa) — `/tmp/ng356-m2.log`
```
  ✘  4 [chromium] › tests/e2e/fo392-invite-code-limit.spec.ts:228:5 › the agency panel: ... (3.7s)
    Error: POST action http://localhost:3163/tr/ajans carries the exact limit 501
    > 349 |  expect(b.text.replaceAll(KNOWN_503, ''), `${b.kind} ${b.url} carries the exact limit ${exact}`).not.toMatch(exactRe);
  1 failed
  3 passed (19.3s)
```
→ **KIRMIZI** (sızıntı yakalandı). Not: log'daki `rc=0` satırı playwright'ın `1 failed` ile çelişiyor; pnpm sarmalayıcısının çıkış kodu güvenilir değil, hüküm test özet satırlarına dayanıyor.

### M1 (düzeltilmiş) — limit create sonucuna sızar (`codes.ts` dönüşüne `useLimit`, `actions.ts`'te `cap`) — `/tmp/ng356-m1b.log`
```
  ✘  4 [chromium] › ... the agency panel ... (3.7s)
    Error: POST action http://localhost:3163/tr/ajans carries the exact limit 507
  1 failed
  3 passed (19.7s)
```
→ **KIRMIZI** (sızıntı yakalandı).

Önceki M1 denemesi (yalnız `actions.ts`'te `cap: created.useLimit`) **yeşil kaldı**; sebep mutantın kendisiydi: `createInviteCodeIn` `useLimit`'i dönmüyor (`src/lib/agency/codes.ts:164-197`), `cap` `undefined` oluyor ve JSON'dan düşüyor. Bu bir spec zayıflığı değil, hatalı mutanttı; düzeltilmiş mutantla yeniden koşuldu.

### Mutantsız, 40 tekrar — `/tmp/ng356-repeat40.log`
```
  160 passed (7.4m)
rc=0
```
(40 × 4 test = 160; başarısız 0.)

### Geri alma kontrolü
Her mutant koşusundan sonra ilgili dosyalar `git checkout --` ile geri alındı; son durum:
```
 M tests/e2e/fo392-invite-code-limit.spec.ts   (commit'lendi: 1f11d1d8)
```
`src/` temiz.

### Sır kontrolü (brief madde 4)
Dosya `tests/e2e/agency-report-retention.spec.ts` (bu dalda izlenen, 186 satır) el ile okundu:
- 32+ karakterli sabit literal: **yok**.
- URL içinde parola: **yok**.
- Sır kaynağı: `const SECRET = e2eAuthSecret();` (`./fixtures/auth-secret`) — çalışma zamanında üretilir/okunur.
- Sonuç: **hayır, dosyada sabit sır değeri yok.** Dosyaya dokunulmadı.

### Commit
```
1f11d1d8 test(e2e): FO-392 exact-limit scan covers every body (NG-356 B1)
 tests/e2e/fo392-invite-code-limit.spec.ts | 24 +++++++--------
 1 file changed, 16 insertions(+), 8 deletions(-)
```
Kanca (eslint + tsc, staged kapsam): `✓ Kapı temiz (staged kapsamı).`

### Push (durum: bekliyor)
`ls-remote` (push öncesi): `1fec3795… refs/heads/task/ng-356` (eski). Push `setsid -f` ile başlatıldı; pre-push tam gate, makine çapı gate kilidinde sırada: `Gate sırası: #6 (önünde 5 iş) … Tahmini başlama: ~132 dk (≈ 03:27)`. `--no-verify` kullanılmadı. Push sonucu `ls-remote` ile doğrulanacak.

## CI / PR durumu

`gh pr view 436`: **`state: MERGED`**, `headRefOid: 1fec3795…`, base `se-fb/fo392-invite-code-limits`. Birleşmiş PR'daki CI (run 45489247591): `build-and-test` pass, `cordis-worker` pass, `e2e (1|2|3)` pass, `e2e-gate` pass.

**Bu, B1 açığının birleşmiş olduğu anlamına gelir.** Yeni commit `task/ng-356`'da; PR zaten kapalı, CI'ı bu commit için yeniden koşmak için yeni bir PR gerekir. Yeni PR açmadım (dış etkili adım; onay bekliyor).

## Riskler
- PR #436 birleşmiş: zayıf M2-kör tarama birleşmiş taban dalda (`se-fb/fo392-invite-code-limits`) duruyor. Düzeltme hâlâ `task/ng-356`'da.
- Push, makine çapı gate kuyruğunda ~2 saat bekleyebilir.
- `pnpm` exit kodu güvenilmez göründü (M2 logunda `1 failed` + `rc=0`).
- Kart kodu NG-346 (kart açıklaması: kararsız public-lead testleri, dal `task/ng-346`); brief NG-356. Kart başlığıyla brief'in çakıştığı lidere bildirilmeli.

## Açık sorular
- Düzeltilmiş `task/ng-356` için yeni bir PR açılsın mı (base `se-fb/fo392-invite-code-limits` ya da `dev`)? Birleşmiş PR'a eklenemez.
- Kart TASK-MWT6RBRAEFSUV için `review` geçişi: push doğrulanınca mı, yoksa şimdi mi?

## Değişen dosyalar
- `tests/e2e/fo392-invite-code-limit.spec.ts` (commit `1f11d1d8`)
- `docs/agent-results/NG-356-qa-gnd-2.md` (bu rapor)

## Sonraki adım
1. Push tamamlanınca `git ls-remote origin refs/heads/task/ng-356` = `1f11d1d8` doğrulaması ve bu rapora eklenmesi.
2. Yeni PR kararı (kullanıcı onayı).
3. Kart `review` / `merge_state=review`.

## Definition of Done
- [x] B1 düzeltildi (tüm gövdelerde tarama, yalnız bilinen 503 literali ayıklandı)
- [x] Ö1: düşen kopyalar raporlandı (`droppedCopies`)
- [x] Ö2: anlamsız assertion kaldırıldı
- [x] M2 kırmızı (ham çıktı)
- [x] M1 kırmızı (ham çıktı; ilk M1 denemesinin no-op olduğu açıklandı)
- [x] Mutantsız 40 tekrar yeşil (160/160)
- [x] Sır kontrolü: sabit sır yok (kanıt yukarıda)
- [x] Her koşudan sonra geri alma doğrulandı
- [ ] Push `ls-remote` ile doğrulandı — **bekliyor** (gate kuyruğu)
- [ ] CI yeşil (yeni commit için) — PR #436 birleşmiş; yeni PR gerekiyor
