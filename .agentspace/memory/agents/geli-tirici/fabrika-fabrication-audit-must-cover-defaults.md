---
name: fabrika-fabrication-audit-must-cover-defaults
description: Uydurma veri avında yalnız uydurulmuş DEĞERLERİ arama — bir şey İDDİA EDEN varsayılanlar (`@default("VALID")`, `status || 'VALID'`, hardcoded `status: 'VALID'`) de uydurmadır; ayrıca doğrulama kolonu çoğu zaman ZATEN vardır, kimse okumuyordur
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

## Kök neden
TASK-MTRH86RCGVEGC'de kanıt modülünün uydurma sertifika metinlerini (rastgele belge no,
"TÜRKAK", kaynaksız claim'ler) temizledim ve iş bitti sandım. Bitmemişti: modül hâlâ
HİÇ KİMSENİN doğrulamadığı belgeye yeşil ✓ "Doğrulanmış Geçerli" rozeti basıyordu.

Fark şu: birinci grup uydurma **değer**di (grep'le bulunur). İkinci grup uydurma
**varsayılan**dı ve grep'e takılmaz:

- `prisma/schema.prisma`: `status String @default("VALID")`
- `actions.ts`: yükleme sırasında elle `status: 'VALID'`
- `evidence-client.tsx`: CSV'de `${i.status || 'VALID'}`
- `getStatusBadge()`: `status`'a hiç bakmıyor, yalnız `validUntil`'e bakıyordu
- `evidence-health.ts`: "1 Geçerli Belge" sayacı da yalnız tarihe bakıyordu

Her biri "doğrulandı" DİYORDU, hiçbiri bir kayda dayanmıyordu — CLAUDE.md §7 ihlali,
tıpkı uydurma belge numarası gibi.

## İki kalıcı ders

**1. Şema zaten doğru kolonu taşıyor olabilir.** Yeni alan icat etmeden önce bak:
`Evidence.status` `UNVERIFIED | VALID | EXPIRING_SOON | EXPIRED | REJECTED` olarak
ZATEN tanımlıydı; kimse okumuyordu. Düzeltme "yeni doğrulama alanı ekle" değil,
"var olan kolonu OKU" oldu. `awk '/^model X /,/^}/' prisma/schema.prisma` ile bak.

**2. Bilinmezlik güvenli tarafa düşmeli.** Saf kararı tek yere koy
(`src/lib/evidence-status.ts` → `evidenceBadge()`), ve eksik/tanınmayan durumu
olumlu değil OLUMSUZ tarafa yaz:

```ts
if (!isVerifiedStatus(item.status)) return { kind: 'UNVERIFIED' };
```

"Bilmiyoruz"u "doğrulandı" saymak hatanın ta kendisiydi. Aynı fonksiyonu hem rozet
hem skor çağırsın, yoksa başlık "1 Geçerli Belge" derken liste "Doğrulanmamış" der.

## Denetim komutu yetmez
Kartın verdiği `grep -rn "TÜRKAK\|TSE\|doğrulan\|verified"` bu ikinci grubu BULMAZ.
Uydurma avında ayrıca şunları ara: `|| 'VALID'`, `@default(`, `status:` hardcode,
ve "kullanıcıya gösterilen sayıyı üreten fonksiyon hangi alanlara bakıyor".

İlgili: [[fabrika-photograph-degraded-state-by-renaming-function]]
