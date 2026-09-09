---
name: fabrika-a-refactor-docstring-claims-work-that-may-not-exist
description: "Bu kural artık tek yerde / N kopya birleştirildi" diyen docstring bir İDDİADIR — kaldırdığını söylediği kalıbı grep'le doğrula; ayrıca sayısal olarak ÖZDEŞ bir kopyayı hiçbir değer testi yakalayamaz
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

## Ne oldu
TASK-MTT1WUUS7MN7R'de `src/lib/money.ts` içindeki `vatOnNetMinor` docstring'i şunu
diyordu: *"Bu kural daha önce üç yerdeydi — `invoice-writer.ts`, `efatura.ts` ve
`invoice-list.ts` — ve tesadüfen aynı sonucu veriyorlardı."* Geçmiş zaman kipi işin
bittiğini söylüyordu. Gerçekte **yalnız biri** dönüştürülmüştü; `efatura.ts` (filelenen
belge) ve `invoice-list.ts` (fatura paneli) hâlâ kendi
`Math.round((net * rate) / 100)` kopyasını taşıyordu.

Bu, [[fabrika-fabrication-audit-must-cover-defaults]] ile aynı aile: orada bir şey
İDDİA EDEN **varsayılan** uydurmaydı, burada bir şey İDDİA EDEN **düzyazı**.
Kod hakkında iddia içeren yorum da denetlenmesi gereken bir iddiadır.

**Why:** Bir refactor'ün kendi docstring'i o refactor'ün kanıtı değildir — çoğu zaman
niyeti anlatır, çıktıyı değil. "Tek kaynak" diyen bir dosyaya güvenip aramayı bırakırsan
N-1 kopya sessizce yaşamaya devam eder; mali bir yolda bu, aynı satış hakkında iki
farklı vergi rakamı demektir.

## How to apply

1. **İddiayı grep'le.** Docstring "artık tek yerde" diyorsa, kaldırdığını söylediği
   kalıbı ara — dosya adlarını değil, KALIBI:
   ```bash
   grep -rn "Math.round((.*rate.*) / 100)\|\* rate) / 100" src --include=*.ts
   ```
   İsim isim sayan bir docstring, o isimleri kontrol listesi olarak kullan.
2. **Tekliği çağrı noktası sağlar, test değil.** Dönüştürmeden önce guard'ların
   patlamayacağını YUKARIDAN kanıtla (burada: `totalsForLines`'a yalnız
   `invoiceLinesSchema`'dan geçmiş satır ulaşıyor; şema `vatRate`'i 0-100'e,
   `unitPriceMinor`'ı negatif-olmayan int'e zaten bağlıyor → `vatOnNetMinor` fırlatamaz).

## Sayısal olarak özdeş kopya testle YAKALANMAZ — bunu vaat etme
`Math.round(x)` ile `Math.floor(x + 0.5)` negatif olmayan x için **birebir aynıdır**.
Yani "kopya geri konarsa test kırılır" diye yazarsan yalan söylemiş olursun.
Mutasyonla ölç, ne yakaladığını öğren ([[fabrika-verify-a-memory-notes-data-before-shipping-it]]):
- kırpma (`Math.floor`) → test **kırıldı**: `panel @ 17% on 3: expected +0 to be 1` ✅
- düz `Math.round` kopyası → test **geçer**, fark yok ❌

Raporda bu sınırı açıkça yaz. Test farklı bir yuvarlama kuralını yakalar; kuralın
tek kaynaktan geldiğini ise yalnız çağrının kendisi garanti eder.

## Güncelleme (2026-09-09, TASK-MTTUSEJFOSPI): dosya YARIM dönüşmüş olabilir
Aynı docstring'e ikinci kez döndüm. Bu sefer iddia *yanlış* değil, **eksik**ti:
birleştirme `efatura.ts`'e ULAŞMIŞTI — `invoiceTotalsMinor` gerçekten
`vatOnNetMinor`/`withholdingOnVatMinor` çağırıyordu. Ama **aynı dosyanın 150 satır
aşağısındaki `generateUblTrXml`**, belgenin SATIRLARINI hâlâ major-unit float +
`toFixed(2)` ile basıyordu. Yani tek belgede: toplamlar birleşik kural, o toplamları
oluşturan satırlar ayrı kural.

**Ders:** "şu dosya dönüştürüldü mü" yanlış soru. Bir modülde **hesaplayıcı**
(`invoiceTotalsMinor`) ile **basıcı/render** (`generateUblTrXml`, HTML şablonu) ayrı
yerlerdir ve refactor genelde ilkinde durur. Grep'i dosya adıyla değil kalıpla ve
DOSYA İÇİNDE yap:
```bash
grep -n "toFixed(2)\|/ 100" src/lib/efatura.ts   # şablon içindeki para hesabını görürsün
```
Yapısal çare (bunu uyguladım): hesaplayıcı satır kırılımını da döndürsün
(`TaxTotalsMinor.lines`), render onu OKUSUN — yeniden hesaplamasın. O zaman
"satır toplamı = alt toplam" iki hesabın tesadüfen anlaşması değil, inşa gereği olur.

İlgili: [[fabrika-fabrication-audit-must-cover-defaults]] · [[fabrika-photograph-degraded-state-by-renaming-function]] · [[fabrika-20-percent-vat-hides-rounding-bugs]]
