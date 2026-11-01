---
name: fabrika-measure-a-transaction-boundary-at-the-wire
description: Bir fonksiyonun kaç SQL transaction açtığını pg_stat_database.xact_commit ile ÖLÇEMEZSİN (aralıklı flush, hep 0 okur) — pg.Client.prototype.query'yi yamayıp BEGIN/COMMIT'i tel seviyesinde kaydet
metadata:
  type: reference
  updatedAt: 2026-09-10
---

"Bu handler bugün kaç transaction açıyor, hangi yazmalar aynısının içinde?" sorusunu ölçerken `pg_stat_database.xact_commit` deltası **çalışmaz**: sayaç aralıklı flush ediliyor, milisaniyelik bir çağrıda delta hep 0 çıkar. `stats_fetch_consistency='none'` de kurtarmıyor. Bu yöntemle "0 transaction" sonucu alırsan bu ölçüm değil, ölçüm hatasıdır — ve gerçekten 0 transaction olan bir kodda doğru cevabı yanlış sebeple vermiş olursun, ki fark edemezsin.

Çalışan yöntem — Prisma'nın gerçekten gönderdiği her ifadeyi kaydet:

```ts
import pg from 'pg';
const sql: string[] = [];
let recording = false;
const raw = (pg as any).Client.prototype.query;
(pg as any).Client.prototype.query = function (...args: any[]) {
  if (recording) {
    const f = args[0];
    sql.push(String(typeof f === 'string' ? f : f?.text).replace(/\s+/g, ' ').slice(0, 90));
  }
  return raw.apply(this, args);
};
// sonra: recording = true; await handler(); recording = false;
// BEGIN / COMMIT / set_config('app.tenant_id' / INSERT|UPDATE sayıları buradan
```

Havuz tembel kurulduğu için yamayı `@/lib/db` import edildikten SONRA uygulamak yeterli; singleton import anında yalnız `pg.Pool` nesnesini kuruyor, istemciyi ilk sorguda alıyor.

**Why:** Transaction sınırı bir tasarım kararıdır ve "kodda `$transaction` aramak" onu yalnızca kabaca cevaplar (başka modüldeki bir yardımcı transaction açıyor olabilir). Tel kaydı hem sayıyı hem SIRAYI verir — hangi yazmanın hangi `[BEGIN … COMMIT]` bloğunun içinde/dışında kaldığını gösteren tek şey bu, ve değişiklik öncesi/sonrası birebir karşılaştırılabilir tek çıktı.

**How to apply:** İfadeleri `[BEGIN`, `COMMIT]`, `SET-TENANT`, `VERB:Tablo` gibi tek jetonlara indirip tek satırda yazdır — bütün handler bir satıra sığar ve öncesi/sonrası göz kararı karşılaştırılır. Sondayı `.qa-scratch/` altına koy (gitignore'lu) ama çıktısını rapora KOPYALA; sonda commit edilmez, kanıt edilir. Node modül çözümlemesi script'in kendi dizininden yapıldığı için scratchpad'e değil repo içine yaz, yoksa `Cannot find module 'pg'` alırsın. Bkz. [[fabrika-no-bare-client-inside-a-withtenant-callback]].
