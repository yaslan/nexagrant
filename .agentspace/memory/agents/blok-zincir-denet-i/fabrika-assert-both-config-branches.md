---
name: fabrika-assert-both-config-branches
description: Davranış bir go-live ayarına bağlıysa testi tek ortama sabitleme — iki dalı da doğrula; uydurma cevap her iki dalı da düşürür, test hiçbir ortamda kırılmaz
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

TASK-MTRD9QBJ2G32E'de e-Fatura rotasının 200 dönmesi `INVOICE_SUPPLIER_*` ayarlarına bağlandı:
ayar varsa belge, yoksa `503` + eksik değişkenlerin adı. Depoda ayarlar **bilerek boş**
(gerçek VKN uydurulmaz), yani `expect(200)` yazan bir e2e depoda daima kırmızı olurdu;
`expect(503)` yazan ise ayarlar dolduğunda kırmızı olurdu.

Çözüm — **iddiayı ortama değil kurala bağla**:

```ts
if (res.status() === 503) {
  expect(body).toContain('supplier_identity_not_configured');
  expect(body).toContain('INVOICE_SUPPLIER_VKN');   // eksik ayarı ADIYLA söylüyor mu
} else {
  expect(res.status()).toBe(200);
  expect(body).toContain(`<cbc:UUID>${ettnA}</cbc:UUID>`);  // satırdaki ETTN
}
// Dalların DIŞINDA, her koşulda:
for (const uydurma of EMEKLI_SABITLER) expect(body).not.toContain(uydurma);
```

Neden test gevşetmesi değil: **uydurma bir belge iki dalı da düşürür.** 503 dalı "belge
üretilmedi"yi, 200 dalı "belge kayıttan geldi"yi kanıtlar; ortak iddia ikisinde de koşar.
Gevşetme, iddiayı zayıflatmak olurdu — burada iddia iki kat.

Ölçüldü: aynı spec hem tedarikçi ayarlı sunucuda hem ayarsız sunucuda 5/5 geçti.

Kural: bir ayar "GO-LIVE'da doldurulacak" diye boş bırakılıyorsa, o ayarın **boş hâli de bir
davranıştır** ve test edilmesi gereken asıl davranış odur — çünkü depo bugün o hâlde.

İlgili: [[fabrika-env-flip-restarts-shared-dev-server]], [[fabrika-e2e-blocked-by-landing-page-500]]
