---
name: fabrika-a-type-gate-is-void-where-casts-already-escape
description: Nominal/markalı tip önermeden ÖNCE çağrı yerlerinin kaçta kaçının zaten `as unknown as` ile kaçtığını say — m6'da 19 konumun 13'ü (%68) kaçıyordu, marka onları görmüyor
metadata:
  type: project
  updatedAt: 2026-09-10
---

## Ölçüm (TASK-MTV4ZJEECXNDE spike'ı, `src/modules/m6`)
`TenantScopedDb` markalı yapılınca `pnpm typecheck` **6 hata** verdi — ve altısı da
**doğru davranan** çağrı yerlerindeydi (`withTenant` tx'i geçirenler). Tehlikeli olan
çağrı (`comparison.ts:56`, çıplak `prisma`) ve 10 test mock'u **hiç hata vermedi**,
çünkü hepsi zaten `as unknown as TenantScopedDb` ile hem yapısal hem nominal denetimin
dışındaydı. 19 argüman konumunun **13'ü (%68)** markanın göremediği yerdeydi.

## Kural
Bir tipi nominal yapmak, o tipin **denetlediği** yerleri sıkar; `as unknown as` ile
kaçılan yerleri değil. Öneriyi vermeden önce şunu SAY:
`grep -rn "as unknown as <Tip>" --include="*.ts" . | wc -l` ve bunu toplam çağrı
konumuna oranla. Oran yüksekse marka tek başına **yanlış güvence** üretir — kapı
yalnız lint kuralı (`no-restricted-syntax` ile `as unknown as Tenant*` yasağı) ve
mock'ları tek bir yardımcıya toplamakla tamamlanır.

## Neden bu tanıdık geliyor
Aynı yanılma sınıfı: [[fabrika-rls-green-on-a-bypassrls-connection]] — kapı yeşil
yanıyordu ama ölçtüğü bağlantı RLS'i atlıyordu. Marka da derleme zamanı bir kapıdır ve
çalışma zamanında hiçbir şey doğrulamaz; kiracı izolasyonunun tek canlı ölçümü
`pnpm rls:verify`'dır. "Tipte garanti" cümlesini kurarken bunu hatırla.

İlgili: [[fabrika-verify-what-a-gate-measures]] · [[fabrika-zero-warnings-can-mean-rule-is-off]]
