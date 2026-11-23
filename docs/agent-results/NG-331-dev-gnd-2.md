# NG-331 (TASK-MWS7QB4VG7U7E) — ek sonuç: PR #414 inceleme düzeltmesi

---

## PR #414 inceleme düzeltmesi (B1 / O1 / O2 / açık soru 1)

hüküm: Bitti: B1, O1, O2 kodda düzeltildi ve test/mutant ile kanıtlandı; tam kapı `417d554b` için yeşil (`PUSH-EXIT=0`); uzak head `417d554b`; PR #414 CI tüm işlerde yeşil (`build-and-test`, `cordis-worker`, `e2e (1..3)`, `e2e-gate`). Birleştirme yapılmadı; PR draft.
tip: hata
platform: Windows 11 + WSL2 Ubuntu-24.04 (mac/Linux'ta koşulmadı)

### Ne yapıldı
1. **B1 (bloke): push edilen ref kontrolü.** `githooks/pre-push` stdin'den `<yerel-ref> <yerel-sha> <uzak-ref> <uzak-sha>` satırlarını okur. Yerel sha `HEAD` değilse kapıdan önce fail-closed çıkar (kapı yalnız HEAD'i sınar). Silme push'u (yerel sha `0…0`) muaftır; lider kararı, `docs/GATE.md`'de yazılı.
2. **O1: çıkış kodu testleri.** `tests/gate-cache-exit-code.test.ts` (yeni, 4 test): belge-yalnız yol kırmızı lint'te `3` döner; `kill -9` ile ölen adım `137` döner; önbellek kaydı yolu `0` döner ve kapıyı yeniden koşturmaz. Testler gerçek alt süreç ve geçici git fixture'ı kullanır.
3. **O2: sinyal kodu.** `scripts/gate-lock.mjs` `runSteps`: sinyalle ölen adım `128 + os.constants.signals[sinyal]` döner (SIGKILL → 137).
4. **Açık soru 1: kanca paylaşılan DB'yi ele alıyor mu?** Ölçüm aşağıda; kod değiştirilmedi, karar lidere bırakıldı.
5. **Hook dosya modu.** Düzeltme sırasında `githooks/pre-push` 100644 ile commit'lendi (`33f5a677`); git kancayı sessizce yok saydı (`hint: ... was ignored because it's not set as executable`), bu push kapısız geçti. Düzeltme: `chmod +x` ve `417d554b` (`git ls-tree` ile `100755` doğrulandı). Yani `33f5a677` uzakta kapısız durumda; asıl kanıt `417d554b`.

### Değişen dosyalar
- `githooks/pre-push` (100755)
- `scripts/gate-lock.mjs`
- `tests/pre-push-hook.test.ts` (HEAD eşleşmiyor → 1; silme → 0; HEAD → kapı kırmızısı 4; toplam 6 test)
- `tests/gate-cache-exit-code.test.ts` (yeni)
- `docs/GATE.md` (ref kontrolü, silme muafiyeti, ölçülen davranış, çıkış kodları)
- `CLAUDE.md` (`pnpm hooks:install` satırı: HEAD dışı push durur, silme muaf)
- `docs/agent-results/NG-331-dev-gnd.md` (bu bölüm)

### Kanıt (ham çıktı)
Mutant (eski kod + yeni testler): 2 test kırmızı, geri yükleme `RESTORED-OK`. Yani testler eski davranışı yakalıyor.

Tam kapı, push `417d554b` (log `scratchpad/push2-ng331.log`):
```
önbellek kaydı yazıldı: 857b11695643d4c23512683ecf55ac91869abc80
✅ Öksüz alarm yok: her açık alarm ya bir tenant adı taşımıyor ya da yaşayan bir tenant'ı gösteriyor.
To https://github.com/yaslan/nexagrant.git
   33f5a677..417d554b  task/ng-331 -> task/ng-331
PUSH-EXIT=0
```
Vitest: `Tests 8628 passed | 75 skipped` (önceki koşudan alındı); log'da `KAPI KIRMIZI` yok.

Uzak ve yerel head: `git ls-remote origin refs/heads/task/ng-331` → `417d554b2dbe628d549e229f2da797135683db3a`; `git rev-parse HEAD` → aynı.

CI (`gh pr checks 414`, son durum):
```
build-and-test  pass  9m32s
cordis-worker   pass  1m30s
e2e (1)         pass  21m7s
e2e (2)         pass  23m20s
e2e (3)         pass  17m42s
e2e-gate        pass  4s
```

Atlanan e2e satırları (`-`): en az `evidence-scan.spec.ts:91` ("against a real clamd"). Atlanmanın nedeni bu raporda doğrulanmadı (test tanımını ve clamd ortamını kontrol etmedim); kapı yine de geçti. Sunucu logundaki `Error: aborted` / `destination stream errored` satırları, log'da başarısız test olarak görünmedi; kaynakları ayrıca incelenmedi.

### Açık soru 1: kanca paylaşılan DB'yi nasıl ele alıyor?
Ölçüm (`scratchpad/shared-db-probe.sh`, pnpm stub'ı kapıyı koşmaz, yalnız çağrıyı kaydeder):
- `DATABASE_URL=...:5433/fabrika` (paylaşılan): kanca çıkış `0`; hedef yazılır, engel yok.
- `DATABASE_URL=...:5572/fabrika_test_ng331` (izole): çıkış `0`.

Sonuç: kanca paylaşılan `fabrika` DB'sini **engellemiyor**; yalnız hedefi yazıyor. Gerçek tehlike kapının o DB'yi yazmasıdır (testler `fabrika` adında DB'de kendini atlar, ama diğer canlı testler yazar).

Öneri (lider kararı, kod değişmedi): kanca `DATABASE_URL` veritabanı adı `fabrika` ise dursun (`exit 1`, "izole DB kullan: CLAUDE.md Worktree'de gate"). Geri alma: tek satır silme. Onaylanırsa ayrı bir değişiklik olarak yapılır.

### Riskler
- Bu bölümün commit'i yeni bir push gerektirir: kapı tam koşar (~25 dk), CI yeniden koşar. Bu rapor commit'i `417d554b`'nin üstüne gelir.
- `33f5a677` uzakta kapısız durumda; kalıcı kanıt `417d554b`. Birleştirmeden önce draft dışarı alınırsa son head'in CI'ı yeşil olmalı.
- Yalnızca Windows+WSL2 koşuldu; mac/Linux'ta koşulmadı.
- Commit yazarı `DEV-NG (dev-gnd)`; kişisel kimlik kullanılmadı.

### Açık sorular (lider)
1. Açık soru 1 önerisi (`fabrika` adlı DB'de kanca dursun) onaylansın mı?
2. Draft PR #414 birleştirme için hazır mı; yoksa önce bu rapor commit'i de CI'dan geçsin mi?

### Sonraki adım
1. Bu rapor commit'i `task/ng-331`'e eklenir ve push edilir (kapı + CI yeniden).
2. Yeni head'in `gh pr checks 414` yeşili izlenir.
3. Birleştirme yapılmaz; lider onayı beklenir.
