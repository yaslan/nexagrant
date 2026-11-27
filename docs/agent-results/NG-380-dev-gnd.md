# NG-380 — #299 kurtarma: e2e supervisor yetim stand-in temizliği

**Ajan:** dev-gnd · **Kart:** TASK-MWXZ64B7AHXG · **Tip:** bug (test altyapısı) · **PR:** #457 (draft, base `dev`, "#299'un yerini alır")

## Hüküm

#299'un kodu olduğu gibi alınmadı: sızıntı dev'de **NG-260 (#381)** ile zaten kapatılmış, ölçümle doğrulandı. Bu PR temizliği değiştirmez; bir regresyon kapısı ekler (`tests/e2e-server-supervisor.test.ts`). Hüküm: **kapı yeşil, PR açık, kanıt tam.** #299 bu PR birleşince kapatılır (şimdi kapatılmadı).

## Ne yapıldı

1. `origin/dev` (`6714b880`) üzerinden `task/ng-380`, izole worktree `be-gnd-ng380`.
2. #299 (`ef31901e5b`) ile dev'i karşılaştırdım: #299'un 16 satırı dev'de yok. Ama dev'in NG-260 temizliği aynı işi farklı yöntemle yapıyor: `killPidFromFile` yalnız komut satırı pid dosya yolunu içeren süreci öldürür; sunucu test süreç grubunda kalır (bilinçli). #299'un `detached` süreç grubu bu tasarımla çelişir → alınmadı.
3. Ölçüm (aşağıda): #299 öncesi test dosyası → 2 yetim; dev → 0 yetim.
4. Regresyon kapısı eklendi: tüm testlerden sonra, bu koşunun yazdığı pid dosyalarından gelen her stand-in hâlâ yaşıyor ve komut satırı pid dosyasını içeriyorsa, öldürür ve suite'i pid'leriyle kırar.
5. Kapının iki yönlü doğrulaması (aşağıda).

## Kanıt (ham çıktı)

### A. #299 öncesi test dosyası (temizlik yok) — sızıntı yeniden üretildi

```
=== [leak-repro] AFTER run: orphans=2
2133649 2133434       00:10 node -e const s=require('http').createServer((q,r)=>r.end('ok'));s.listen(43723,()=>require('fs').writeFileSync("/tmp/fo385-049S1q/server-pid",String(process.pid)));setTimeout(()=>s.close(),1200);s.on('connection',c=>c.destroy());setInterval(()=>{},1000);
2133741 2133434       00:07 node -e const s=require('http').createServer((q,r)=>r.end('ok'));s.listen(38157,()=>require('fs').writeFileSync("/tmp/fo385-tglAeE/server-pid",String(process.pid)));
```
İki yetim: closed-port ve wall-clock-jump vakaları (#299 commit mesajıyla aynı). Ölüm sonrası ikisi de WSL'de `kill -9` ile elle temizlendi; sonra `left: 0`.

### B. Dev temizliği (NG-260), bu PR öncesi

```
=== [before-fix] BEFORE run: orphans=0
vitest rc=0
 ✓ tests/e2e-server-supervisor.test.ts (13 tests) 9109ms
 Test Files 1 passed (1)  Tests 13 passed (13)
=== [before-fix] AFTER run: orphans=0
```

### C. Bu PR: kapı iki yönlü

Temizlik açık (kapı yeşil):
```
=== [guarded-fixed] AFTER run: orphans=0
 ✓ tests/e2e-server-supervisor.test.ts (13 tests) 9133ms
 Test Files 1 passed (1)  Tests 13 passed (13)
```

Temizlik devre dışı (`killPidFromFile(serverPidFile)` yorumlandı; kapı kırmızı):
```
=== B: cleanup disabled
106:  // disabled for negative check
 FAIL  tests/e2e-server-supervisor.test.ts [ tests/e2e-server-supervisor.test.ts ]
AssertionError: expected [ 2139469, 2139576 ] to deeply equal []
- Expected  + Received   [ 2139469, 2139576 ]
=== [guarded-broken] AFTER run: orphans=0   (kapı pid'leri öldürdü)
restored OK
```

### D. Lint, typecheck, kapı

```
lint rc=0 (eslint)
typecheck rc=0 (tsc --noEmit, errors: 0)   [önce db:generate; ilk koşuda Prisma client yoktu → 991 hata, ilgisiz]
commit: 1232f352  "test(e2e): guard against stand-in servers left by the supervisor test (NG-380)"
  staged hook: eslint + tsc temiz
push: E2E_PORT auto  → git push -u origin task/ng-380 → push rc=0
  pre-push tam gate: e2e 736 passed (28.2m); öksüz alarm kapısı temiz
  ✓ "[new branch] task/ng-380 -> task/ng-380"
```
Gate kilidi: makine çapı kilit `ng-371` gate'iyle ~1 saat bekledi (kuyrukta); kilit öldürülmedi.

## Değişen dosyalar

- `tests/e2e-server-supervisor.test.ts` (+41 / −3, commit `1232f352`)
- `docs/agent-results/NG-380-dev-gnd.md` (bu dosya)

## Platform beyanı

- **Doğrulandı:** Windows 11 Pro host; işlem WSL Ubuntu-24.04 (Linux).
- **mac:** koşulmadı. Kod yolu `ps -ww -o command= -p <pid>` kullanıyor; mac'te `ps` vardır, davranış beklenen aynı, ama koşulmadı.
- **Windows (koddan):** `ps` yok ve süreç grubu yok; `killPidFromFile` ve kapı `win32`'de no-op. Belgelenmiş davranış: `killPidFromFile` yorumu ve `afterAll` koruması.

## Riskler

- Kapı Linux'ta doğrulandı; mac'te sadece `ps` çıktı biçimi farkı riski var (kapı pid'in komut satırını okur).
- Gate kuyruğu uzun (~1 saat, makine çapı kilit). Bu PR'daki düzeltme yeniden push'ta tekrar gate koşturur.

## Açık sorular

1. #299'u kapatma onayı: bu PR birleşince mi, yoksa şimdi mi? Kart "#299 kapatma" demiyor; ben kapatmadım.

## Sonraki adım

PR #457 teslim incelemesi; birleşince worktree `be-gnd-ng380` ve `ng380-pg` konteyneri silinir, #299 kapatılır.

## Hafıza

Yeni kalıcı bilgi: dev'de NG-260 temizliği #299'un sızıntısını zaten kapatıyor (ölçümle). Hafıza kaydı yazılacak.
