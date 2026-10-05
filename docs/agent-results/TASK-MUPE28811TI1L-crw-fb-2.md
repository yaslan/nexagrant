---
gorev: TASK-MUPE28811TI1L
sprint: FB-GAP-1
ajan: crw-fb
tip: test (T-5 final HEAD timeLeft sabitleme + T-7 yorum, gerçek koşu)
hüküm: ONAY — baseline 22/22 yeşil; M3a ve M3b altında T-5 final HEAD KIRMIZI; Ö-2 yorumu düzeltildi
platform: mac (darwin 27.0.0, arm64); Linux/Windows koşulamadı
dal: crw-fb/t5-timeleft @ 6991fc62 (yerel; push/merge YOK)
tarih: 2026-10-01
onceki_rapor: docs/agent-results/TASK-MUPE28811TI1L-crw-fb.md (KISMÎ: test koşulamamıştı, timeLeft hesabı yanlıştı)
---

# TASK-MUPE28811TI1L — T-5 timeLeft testi, yeniden (gerçek koşu)

## 1. Ne yapıldı

1. **Commit'siz değişiklik kurtarılamadı, yeniden yazıldı.** Görevin verdiği worktree dizini (`/private/tmp/claude-501/-Users-macbook-alan/crw-fb-t5-wt`) diskte yoktu. `git worktree list` onu `prunable` gösteriyordu, yani `/private/tmp` temizlenmiş ve commit'siz değişiklik onunla birlikte gitmişti. Dal (`crw-fb/t5-timeleft`) dev ile aynı commit'teydi (d8451c35). Yalnız bu kaydın admin dizinini sildim (`.git/worktrees/crw-fb-t5-wt`). Başka ajanların prunable kayıtlarına dokunmadım, `git worktree prune` da çalıştırmadım. Dalı scratchpad'de yeniden açtım.
2. **Önceki taslağın hesabı yanlıştı, tasarımı değiştirdim.** Önceki rapor `afterLock 25 s + dbSleep 4.5` ile "timeLeft ≈ 10.5 s" diyordu. `copyTimeLeft()` (actions.ts:131) ise `min(15 s, readSentAt + 20 − 2 − now, txStart + 40 − 5 − 2 − now)` hesaplıyor. Bu kurulumda sonuç ≈ 33 − 29.5 = **~3.5 s** çıkar, 10.5 s değil. Ayrıca mutant altında kopya 40 s'lik transaction sınırını aşardı. Onun yerine Y-3 "idle" kalıbını kullandım:
   - `state.dbPause = { after: 12_000 }` → timeLeft = 20 − 12 − 2 = **~6 s**, 15 s sabitinin belirgin altında.
   - Sınır `took < 12_000 + 6_000 + 2_500` (20.5 s).
   - Retry hızlı koşsun diye `state.dbPause` confirm döndükten sonra `null`'a çekiliyor.
3. **Ö-2 (T-7 yorumu):** "HEAD has no timeout and hangs" ifadesi gerçeği anlatmıyordu. Mutant altında HEAD askıda kalmıyor: 4 s'lik tutmayı bekliyor, sonra çağrı geç ama `ok: true` dönüyor. Yorum buna göre düzeltildi.
4. Commit: `6991fc62` (yalnız `tests/evidence-confirm-store-faults.live.test.ts`, `git commit -- <yol>` ile). minio-data/, pgdata/, minio.log, minio.pid, pglog.txt commit'e girmedi. Hepsi scratchpad'de, repo dışında.
5. **Ortam (crw2-fb §1 yöntemi, Docker'a dokunulmadı):**
   - Homebrew `postgresql@16` izole küme: initdb scratchpad'de, port 55492, yalnız TCP. Scratchpad yolu Unix soketi için 103 baytı aşıyordu, bu yüzden `-k ''` verildi.
   - CI sırası: `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 ("41 files applied" ×2) → `db:rls` (28 → 112 politika) → `db:seed`. `db:seed` öncesinde `prisma generate` gerekti, çünkü taze worktree'de client yoktu.
   - `prisma migrate reset` **kullanılmadı**. Rıza değişkeni de ayarlanmadı.
   - MinIO: brew ikilisi, `127.0.0.1:59402`, bucket `evtest`.
6. Her mutant tam dosyada koşuldu ve ardından `git checkout --` ile geri alındı. Geri alma sonrası T-5/T-7 yeniden koşuldu.

## 2. Kanıt (kopyalanmış çıktı)

### 2.1 Baseline: tam dosya, 6991fc62, `git status --short` boş

```
✓ … > T-5: a store that holds the HEAD of the staging object is given up on within the deadline
✓ … > T-5: a store that holds the GET of the staging object is given up on within the deadline
[T-5 final HEAD] held 12011 ms in; confirm answered after 18071 ms
✓ … > T-5 (final key HEAD): a confirm whose store holds the HEAD of the copied object answers stor…
✓ … > T-7: a store that holds the HEAD of the final object after the copy is given up on within th…
 Test Files  1 passed (1)
      Tests  22 passed (22)
   Duration  169.18s
```
22 testin 22'si koştu, atlanan (↓) yok, yani S3 ve DB gerçekten bağlıydı. T-5 final HEAD 18071 ms'de cevap verdi; sınır 20500 ms, pay ~2.4 s.

### 2.2 M3a: `storage.ts:250` Math.min kaldırıldı

```
-    const opts = { abortSignal: AbortSignal.timeout(Math.min(deadlineMs, EVIDENCE_COPY_DEADLINE_MS)) };
+    const opts = { abortSignal: AbortSignal.timeout(EVIDENCE_COPY_DEADLINE_MS) };
EXIT 1
 × … > Y-3: the copy ends before a connection idle through it could be closed …
 × … > Y-3: the copy ends before the transaction’s own timeout …
 × … > T-5: a store that holds the HEAD of the staging object …
 × … > T-5: a store that holds the GET of the staging object …
[T-5 final HEAD] held 12017 ms in; confirm answered after 27154 ms
 × … > T-5 (final key HEAD): a confirm whose store holds the HEAD of the copied object answers stor…
 × … > T-7: …
      Tests  6 failed | 16 passed (22)

 FAIL … T-5 (final key HEAD) …
-   "error": "storage_unavailable",
+   "error": "save_failed",
 ❯ expectNothingLost tests/evidence-confirm-store-faults.live.test.ts:191:15
 ❯ tests/evidence-confirm-store-faults.live.test.ts:781:11
```

### 2.3 M3b: `actions.ts` timeLeft geçirilmiyor

```
-        const copied = await copyIncomingObject(objectKey, finalKey, timeLeft);
+        const copied = await copyIncomingObject(objectKey, finalKey);
EXIT 1
 × … > Y-3: the copy ends before a connection idle through it could be closed …
 × … > Y-3: the copy ends before the transaction’s own timeout …
[T-5 final HEAD] held 12010 ms in; confirm answered after 27077 ms
 × … > T-5 (final key HEAD): a confirm whose store holds the HEAD of the copied object answers stor…
      Tests  3 failed | 19 passed (22)

-   "error": "storage_unavailable",
+   "error": "save_failed",
```

crw2-fb'nin raporunda T-5 final HEAD **M3a ve M3b altında YEŞİL** kalıyordu (15213 / 15235 ms). Şimdi ikisinde de **KIRMIZI**. Ö-1 kapandı.

Neden `save_failed` dönüyor: mutant kopyaya 15 s veriyor. Bağlantı okumadan sonra 12 + 15 = 27 s boşta kalıyor. Postgres `idle_in_transaction_session_timeout` (20 s) dolunca bağlantıyı kapatıyor ve transaction'ın commit'i düşüyor. Test bu yüzden önce cevap kodunda kırılıyor. Kod geçse bile süre sınırında kırılırdı: 27 s > 20.5 s. İki sinyal de mutantı yakalıyor.

### 2.4 Geri alma sonrası (`git status --short` ve `git diff HEAD --stat` boş)

```
[T-5 final HEAD] held 12012 ms in; confirm answered after 18194 ms
 Test Files  1 passed (1)
      Tests  4 passed | 18 skipped (22)        (-t 'T-5|T-7')
```

### 2.5 Statik kapılar

```
pnpm exec eslint tests/evidence-confirm-store-faults.live.test.ts → LINT-OK
pnpm typecheck (tsc --noEmit) → exit 0
```

### 2.6 Temizlik

```
pg_ctl stop -m fast → server stopped
kill 10218 (minio server --address 127.0.0.1:59402 …) → minio-stopped
rm -rf pgdata minio-data minio.pid
lsof -nP -iTCP:55492 -iTCP:59402 -iTCP:59403 -sTCP:LISTEN → çıktı yok, exit 1 (dinleyen yok)
```
Yalnız kendi başlattığım iki süreç durduruldu. `brew uninstall minio` yapılmadı, çünkü ikili bu görevden önce de kuruluydu.

## 3. Değişen dosyalar

- `tests/evidence-confirm-store-faults.live.test.ts`: commit 6991fc62, dal `crw-fb/t5-timeleft`, yerel. 10 satır eklendi, 3 satır silindi. Üretim kodu değişmedi.
- Bu rapor.

## 4. Riskler

- **Zamanlama payı.** Baseline'da iki koşu yapıldı: 18071 ve 18194 ms. Sınır 20500 ms, yani pay ~2.3 s. Mutant ile pay ~6.5 s (27 s). Yüklü bir makinede baseline'ın 2.3 s gecikmesi gerekir, flake riski düşük. Gerekirse sınır 21_500 ms'ye çekilebilir; mutant tarafında yine 5.5 s pay kalır.
- **Test süresi.** Test ~12 s uzadı (~18 s + retry). Dosya CI'da zaten atlanıyor (`EVIDENCE_S3_TEST_*` yok), bu yüzden CI süresi etkilenmez.
- **Y-3 idle ile örtüşme.** Bu test Y-3 idle ile aynı mekanizmayı (idle sınırı) kullanıyor, ama farklı çağrıyı tutuyor: copy yerine final HEAD. Kasıtlı bir örtüşme.
- Doğrulama MinIO 2025-10-15 ile yapıldı. R2'nin abort'a tepkisi birebir aynı olmayabilir.

## 5. Açık sorular

- Yok. Push/merge kararı lider/patronda; bu görevde push/merge yapılmadı.

## 6. Sonraki adım

- `crw-fb/t5-timeleft` (6991fc62) dev'e alınmak üzere inceleme/merge kuyruğuna verilebilir.
- Scratchpad'deki worktree (`…/f03fae95-…/scratchpad/wt`) ve loglar (baseline/m3a/m3b/revert.log) duruyor. Dal commit'li olduğu için worktree güvenle kaldırılabilir.

## 7. Platform beyanı

- **mac** (darwin 27.0.0, arm64): koşuldu.
- Dokunulan kod yolu (`AbortSignal.timeout`, AWS SDK, Postgres `idle_in_transaction_session_timeout`, in-process HTTP proxy) platformdan bağımsız. Testte platforma özel bir dal yok.
- **Linux** (CI ubuntu-latest): koşulamadı, çünkü CI işinde S3 servisi yok ve dosya orada atlanıyor.
- **Windows**: koşulamadı, çünkü makine yok. Proje Windows'u hedeflemiyor.
