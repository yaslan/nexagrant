# NG-347 — FO-392 e2e yük altı kararsızlığı (coe-gnd)

**Hüküm: DONE:st1** — yük altında 80/80 yeşil, tam gate yeşil. Eski hâl aynı koşulda 18/80 kırmızıydı.

**Ajan:** coe-gnd · **Kart:** TASK-MWTBWAHJC3BIX (NG-347) · **Dal:** `task/ng-347` · **Base:** `se-fb/fo392-invite-code-limits`
**Platform beyanı:** Yalnız WSL2 Ubuntu-24.04 üzerinde koşuldu. Windows ve macOS'ta koşulmadı: bu iş WSL worktree'si ve WSL'deki izole Postgres (`fabrika_test_ng347`, 127.0.0.1:5650) üzerinde yürütüldü; ayrı bir Windows/mac ortamı kurulmadı.

## Ne yapıldı

Kök neden: "panelin kendi formundan yeni kod" adımında server action POST `/ajans` yanıtı tarayıcıdan `response.text()` ile okunuyordu. Create işlemi sayfayı navigate ettiği için Chromium gövdeyi düşürüyordu (`Protocol error (Network.getResponseBody): No data found`).

Düzeltme (yalnız `tests/e2e/fo392-invite-code-limit.spec.ts`):
1. Gövde tarayıcıdan okunmuyor. `page.route` POST `/ajans` isteğini `route.fetch({ maxRedirects: 0 })` ile Node tarafında alıyor, gövdeyi okuyup aynı yanıtı `route.fulfill({ response })` ile tarayıcıya geri veriyor.
2. Panel aynı URL'ye bildirim poll'u için de POST atıyor; yük altında bu poll ilk gelip create yerine yakalanıyordu. Bildirim yanıtları (`"notifications"` içerenler) geçirilip ilk gerçek action POST'u yakalanıyor.
3. Assertion'lar gevşetilmedi (useLimit/usedCount yok, exact limit yok, "en az N", Sınıra ulaştı aynen).

Ara adım: yalnız (1) uygulanınca yük altında 17/80 kalıyordu; hata artık "No data found" değil, satır 331 assertion'ıydı (yakalanan POST gövdesi create yanıtı değil bildirim poll'uydu). (2) ile düzeldi.

## Kanıt (ham çıktı)

Eski hâl (düzeltme yok), `--repeat-each=20 --workers=4`, `~/ng347-before.log`:
```
  18 failed
  62 passed (1.9m)
run_rc=1
```
Hata dağılımı: 17 × `Error: response.text: Protocol error (Network.getResponseBody): No data found for resource with given identifier`, 1 × assertion. 18/18 hata satır 228 (test gövdesi).

Ara hâl (yalnız route.fetch, bildirim filtresi yok), `~/ng347-after.log` (silindi, koşu çıktısı transkriptte):
```
17 failed
63 passed (1.9m)
run_rc=1
```
Hepsi `spec.ts:331` → `expect(actions.some((b) => b.text.includes('code'))).toBe(true)`. Tanılama: 18 × 105 baytlık `{"ok":true,"notifications":[]...}` gövdesi yakalanmış (create değil).

Son hâl (düzeltilmiş spec, aynı koşul), `~/ng347-after2.log`:
```
  80 passed (1.8m)
run_rc=0
NO_DATA=0
```
(`--repeat-each=20 --workers=4`, dört test × 20 = 80 koşu.)

Lint ve typecheck: `pnpm lint` → `lint_rc=0`, `pnpm typecheck` → `tc_rc=0`.

Tam gate (`E2E_PORT=3148`, `DATABASE_URL` → `fabrika_test_ng347`, log `~/ng347-gate.log`):
```
720 passed (26.7m)
Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant’ı gösteriyor.
gate_rc=0
```
Gate, makine çapı kilidinde `ng-339` gate'i bittikten sonra başladı (~25 dk bekleme).

## Değişen dosyalar

- `tests/e2e/fo392-invite-code-limit.spec.ts` (tek ürün-dışı, yalnız test dosyası)
- `docs/agent-results/NG-347-coe-gnd.md` (bu rapor)

Geçici `tests/e2e/fo392-ng347-before.spec.ts` ve `tests/e2e/fo392-ng347-dbg.spec.ts` silindi, commit'e girmedi. Ürün kodu değişmedi.

## Riskler

- `WebServer` loglarında yük altında `ECONNRESET: aborted` uyarıları görüldü (route.abort/sayfa kapanışı kaynaklı görünüyor). Testler geçti; bunların kaynağı ayrıca izole edilmedi.
- Bildirim poll filtresi `"notifications"` metin eşleşmesine dayanıyor. Panel bu anahtarı değiştirirse filtre bozulur ve test yine create'i bulamaz (satır 331 kırmızı olur, yanlış yeşil vermez).
- Base'de CI e2e koşmuyor; kanıt yalnız yerel gate ve yukarıdaki yük koşusu.

## Açık sorular

- Yok.

## Sonraki adım

Draft PR (`task/ng-347` → `se-fb/fo392-invite-code-limits`), birleştirme yok. Kart `review`'a alınır.
