# TASK-MVIB70K677R5M (FO-116) — ikinci geçiş: kırmızı testin kaynağı, rebase ölçümü

**Hüküm:** Kısmen bitti: kırmızının kaynağı bulundu (`api-error-body-guard`, dalın kendi dalındaki `interreg` admin eylemi; dev'de yok), ama önerilen düzeltme guard'ı geçmedi; push ve düzeltme kararı beklemede. Rebase ölçüldü: 108 commit dalda, 211 commit dev'de, ilk commit'te çakışma var.

**Platform:** mac (darwin, bu makine). Testler saf dosya okuyan statik tarama + vitest; platforma bağlı yol yok. Windows ve Linux koşulmadı (bu makinede yok).

## Ne yapıldı
- Kırmızı test üç yerde koşuldu: dalın şu anki commit'i (`37efa245`), taban commit (`0a654b99`), `origin/dev` (`0125d91f`).
- Kırmızının kaynağı tarandı: test dosyası dev ile dal arasında yalnız bir satır değişik (yol adı `(public)` grubu). Kırmızıyı üreten dosyalar `src/app/[locale]/admin/interreg/actions.ts` ve `src/lib/keep-eu-sync.ts`; bunlar yalnız dalda var, dev'de yok.
- Düzeltme adayı (`handleRunKeepEuSyncAction` içinde try/catch, hata durumunda sabit kod) geçici bir kopyada denendi: guard hâlâ kırmızı, sızıntı satır 20'den 23'e kaydı. Commit atılmadı.
- Dalın `origin/dev`'e göre rebase ihtiyacı geçici bir worktree'de ölçüldü ve iptal edildi.
- Geçici worktree'ler temizlendi (`git worktree list` ile doğrulandı).

## Kanıt (ham çıktı)

**Taban `0a654b99`** (`vitest run tests/api/api-error-body-guard.test.ts`, çıkış 1):
```
FAIL  tests/api/api-error-body-guard.test.ts > server action error returns > no server action returns what it caught (beyond the known list)
AssertionError: expected { …(1) } to deeply equal {}
 Test Files  1 failed (1)
      Tests  1 failed | 21 passed (22)
```

**Dal `37efa245`** (aynı komut, çıkış 1): aynı hata, aynı sayılar (`1 failed | 21 passed`).

**`origin/dev` `0125d91f`** (aynı komut, çıkış 0):
```
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

Sızıntı (dalda):
```
"src/app/[locale]/admin/interreg/actions.ts": [
  "line 20 ← src/lib/keep-eu-sync.ts#syncKeepEuData ← fetchKeepEuOpenData() (line 435)"
]
```

Düzeltme adayı denemesi (`0a654b99` üstünde geçici kopya, çıkış 1):
```
+ "line 23 ← src/lib/keep-eu-sync.ts#syncKeepEuData ← fetchKeepEuOpenData() (line 435)"
Tests  1 failed | 21 passed (22)
```

**Rebase ölçümü:**
```
git rev-list --left-right --count origin/dev...HEAD  →  211  108
```
(211 = dev'de olup dalda olmayan, 108 = dalda olup dev'de olmayan.)

Geçici kopyada `git rebase origin/dev` ilk commit'te durdu:
```
Could not apply 0d7e7ea7... # chore(tooling): exclude .claude/worktrees from tsconfig
UU tsconfig.json
```
`git rebase --abort` ile geri alındı; dal `37efa245`'te, `origin/dev` karşılaştırması `211 108` olarak kaldı.

## Kök neden (bulgu)
- Test, action'ın döndürdüğü değerin bir `catch` yakalamasından gelip gelmediğini statik tarar ve import'ları `src/` içinde izler. Kırmızıyı üreten şey dalda eklenmiş, dev'de olmayan `interreg` admin eylemi ve onun servisi (`keep-eu-sync.ts`). Test dosyasının dev ile farkı yalnız bir yol satırı; yani kırmızı testten değil, dalın içeriğinden geliyor.
- Eylemi bir try/catch ile sarmak yetmiyor: tarayıcı servisin dönüş değerini de izliyor. Servis içindeki `fetchKeepEuOpenData` (satır 435 civarı), yakalanan `errorMessage` değerini `error` alanında döndürüyor (satır 507). Düzeltme servis tarafında olmalı: `syncKeepEuData`'nin fetch hatasını sabit bir koda çevirmesi ya da `fetchKeepEuOpenData`'nin dış çağrılara ham hata metni vermemesi.
- Bu dosyalar FO-113 / keep.eu işine ait (`c5e38741`, `da9368da` gibi commit'ler); FO-116'nın izinli dosya listesinde değil. Sahibi bu düzeltmeyi yapmalı.

## Rebase
- Dal 108 kendi commit'iyle `origin/dev`'in 211 commit gerisinde. İlk commit (`0d7e7ea7`, `tsconfig.json`) dev ile çakışıyor. Diğer çakışmalar ölçülmedi: ilk çakışmada durduruldu.
- Push öncesi rebase gerekiyor. Hangi 108 commit'in FO-116 dışında olduğu (FO-113, FO-114 vb.) ayrıca ayrılmalı; bu kart yalnız `37efa245`'i kapsıyor.

## Değişen dosyalar
- Bu geçiş için repo'da değişiklik yok (düzeltme adayı yalnız geçici kopyada denendi ve atıldı).
- Önceki commit: `37efa245` (`match-pic.ts`, `match-pic.test.ts`, `docs/DATA_MODEL.md`).

## Riskler
- Düzeltme yapılmadan push edilirse guard kırmızı kalır ve gate düşer.
- Rebase'in çakışmaları tam ölçülmedi.

## Açık sorular
- Kırmızının düzeltmesini kim yapacak: FO-113/keep.eu sahibi mi, yoksa FO-116 kapsamı mı genişletilecek? (İzinli dosya listesi nedeniyle burada yapılmadı.)
- Push, CRW-FB onayından sonra ayrı iş olarak gelecek (delegasyon metninde yazılı); şimdilik push yapılmadı.

## Sonraki adım
1. Lider: servis tarafındaki düzeltmenin sahibini belirlesin ve kapsamı onaylasın.
2. Rebase: `origin/dev` üstünde çakışmaları çözmek için ayrı bir iş.
3. CRW-FB onayı gelince push (`uptime` kontrolü ve izole port ile gate).
