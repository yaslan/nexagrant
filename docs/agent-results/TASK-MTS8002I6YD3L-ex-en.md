# TASK-MTS8002I6YD3L — Şema sözleşmesi kapısı yazma gövdesini de okusun

**Ajan:** ex-en (Araştırmacı/Explorer) · **Commit:** `fd58867` · **Dal:** `dev`
**Not:** Bu rapor işin kendisinden sonra (2026-09-08, TASK-MTS9W0C1VC9OS koşusunda) yazıldı —
kod o commit'te bitmişti, sonuç dosyası yazılmamıştı. Aşağıdaki kanıt **bugün yeniden ölçüldü**.

---

## 1. Ne yapıldı

`src/modules/m8/server/schema-contract.test.ts` kapısı yalnızca sorguların **okuma** yarısını
(`where` / `select` / `include` / `orderBy`) geziyordu. Yani her sorgunun yazma yarısı
korumasızdı: `create({ data: { titel } })` gibi bir yazım hatası ve bir ilişki altındaki her
iç içe `create` / `connect` / `connectOrCreate` / `upsert`, `prisma/schema.prisma`'nın
bildirmediği bir sütunu adlandırıp kapıdan geçebiliyordu.

Tarayıcı, `data`'yı "bir alan nesnesi daha" saymak yerine **iç içe yazma gramerini** izleyecek
şekilde genişletildi:

- bir ilişkinin `create`/`update`/`upsert`/`createMany` değeri **ilişkili modele** aittir,
- `connect`/`disconnect`/`set`/`delete` değeri o model üzerinde bir `where`'dir,
- bir skalerin `{ increment: 1 }` değeri **operatördür**, alan nesnesi değil — gezilmez,
- toplu biçimler (`data: [row, row]`) yazma gövdesi listesidir.

Altı fixture bu şekilleri temsil ediyor; hepsi eski tarayıcıda **kaçıyor**, yenisinde
yakalanıyor. Ayrıca `writeBodiesWalked` sayacı, gezilen gövde sayısını 100'ün üstünde
tutmayı zorunlu kılıyor — sessizce hiçbir şey okumayan bir parser "depo temiz" diyemesin.

`src/`'deki 548 yazma-gövdesi alan referansı bu yolla doğrulandı ve **hiçbiri kırık değildi**:
bu commit canlı bir hatayı düzeltmiyor, açık bir deliği kapatıyor. İki bilinen-kırık defteri
(known-broken listeleri) **büyümedi**.

## 2. Kanıt

```
$ git show fd58867 --stat
 src/modules/m8/server/schema-contract.test.ts | 287 +++++++++++++++++++++++++-
 1 file changed, 284 insertions(+), 3 deletions(-)

$ npx vitest run src/modules/m8/server/schema-contract.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Eklenen testler (verbose koşu, 2026-09-08):

```
✓ reads the write body, not just the read arguments
✓ reads nested create, connect and connectOrCreate against the related model
✓ does not read a scalar update operator as a field object
✓ actually walks the write bodies in src/                       140ms
✓ names only models, relations and columns that exist           133ms
✓ keeps the known-broken field list from going stale            131ms
```

Parser'ın gerçekten okuduğunun kanıtı (kaynaktan):

```
expect(writeBodiesWalked).toBeGreaterThan(100);
```

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/modules/m8/server/schema-contract.test.ts` | +284 / −3 — yazma gövdesi yürüyücüsü, 6 fixture, `writeBodiesWalked` sayacı |

Üretim kodu değişmedi; bu yalnızca kapının kapsamını genişletiyor.

## 4. Riskler

- Düşük: değişiklik test dosyasının içinde. Risk, yürüyücünün **yanlış pozitif** üretmesi
  olurdu; `src/`'deki 548 referansın hepsi temiz geçtiği için bu ölçülerek elendi.
- Yürüyücü Prisma'nın iç içe yazma gramerini elle modelliyor; Prisma yeni bir iç içe yazma
  anahtarı eklerse (bugünkü set dışında) o anahtar sessizce gezilmez. Sayaç bunu yakalamaz.

## 5. Açık sorular

- Kapı yalnızca `src/` altını tarıyor: `prisma/seed*.ts` ve `scripts/*.ts` içindeki yazma
  gövdeleri hâlâ korumasız. Kapsam kararı verilmedi.
- İki "bilinen-kırık" defteri hâlâ dolu; bu commit onları büyütmedi ama küçültmedi de.

## 6. Sonraki adım

- Kapsamı `scripts/` + `prisma/`'ya genişletmek ayrı bir kart hak ediyor (küçük iş, ölçülmüş
  tarayıcı hazır).
