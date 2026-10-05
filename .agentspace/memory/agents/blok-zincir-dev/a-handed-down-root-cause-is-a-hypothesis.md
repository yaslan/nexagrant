---
name: a-handed-down-root-cause-is-a-hypothesis
description: Devralınan teşhis bir hipotezdir — hem SEBEBİ hem KAPSAMI yanlış olabilir; düzeltmeden önce tek ucuz deneyle ölç
metadata:
  type: feedback
  updatedAt: 2026-09-10
---

## Kural

Bir kart "kök neden zaten bulundu, tekrar arama" dese bile, o teşhisi **düzeltmeye
başlamadan önce tek bir ucuz deneyle ölç**. Devralınan teşhis çoğu zaman önceki
denemelerin *neden başarısız olduğunu* açıklamak için üretilmiş bir anlatıdır.

## Neden

TASK-MTU4AYW5R9DGL'de kart, hatayı bir tema commit'ine (SSR/istemci tema
uyuşmazlığı) bağlıyordu ve iki ajan bu anlatı üzerinde çalışıp başarısız olmuştu.
Kök nedeni "aramamak" için harcanan zaman, aslında yanlış yerde kazmaktı.
İki dakikalık iki deney anlatıyı çürüttü:

1. Root layout'tan `cookies()`/`headers()` çıkar → hata GEÇMEDİ (kötüleşti).
2. ThemeProvider'ın mount `setState`'ini tamamen kaldır → hata GEÇMEDİ.

Gerçek neden bambaşkaydı: rota düzeyindeki `loading.tsx` Suspense sınırı
(bkz. [[fabrika-loading-tsx-duplicates-the-whole-page]]).

## İkinci ölçüm (TASK-MTUI9ZBK7W4JY, 2026-09-09) — bu kez SEBEP *ve* KAPSAM yanlıştı

Kart şöyle geldi: *"`module-gate.spec.ts:20-34` oturumsuz gidiyor ve **d1de9d4**'ten sonra
bu istek 307 veriyor"*. İki ayrı hata çıktı:

- **Sebep yanlış.** Yönlendirmeyi `d1de9d4` (09-09) değil, `(app)/layout.tsx`'teki auth
  kapısı yapıyor ve `git blame` onu **c915bc43 (09-06)** diyor — üç gün önce. Test 1 saattir
  değil, 3 gündür ölüydü.
- **Kapsam yanlış.** Kart tek bir testi (20-34) işaret ediyordu; aynı dosyadaki diğer iki
  test de `h1 ... isVisible()` diyordu ve **giriş sayfasında bir `<h1>` var**. Yani üç testin
  üçü de boştu. Sadece adı geçeni düzeltmek, aynı kusuru "geçen" iki testin arkasında
  bırakırdı.

Genelleme: **bir test çevresel bir önkoşul yüzünden boşsa (oturum yok, yanlış URL, eksik
fixture), o önkoşulu paylaşan KARDEŞ testler de boştur** — "diğerleri geçiyor" bilgi değil,
aynı körlüğün kendisidir. Dosyayı ölç, kartın işaret ettiği satır aralığını değil.

Üçüncü bir düzeltme aynı turda **kendi hafızamdan** geldi: rapora "`default` slug'ı yanlış
kiracıyı gösteriyordu" diye yazmıştım; [[fabrika-workspace-url-segment-is-decorative]] bunun
yanlış olduğunu söylüyor (segment kiracıyı belirlemez, oturum belirler). Yani devralınan
teşhis kadar **kendi ara teşhisin** de hipotezdir.

## Nasıl uygulanır

- Devralınan teşhisi bir **yanlışlanabilir iddiaya** çevir ("X'i kaldırırsam hata
  geçer") ve ÖNCE onu koş. Geçmezse teşhis yanlıştır; anlatıyı bırak.
- Çürüttüğünü raporda AÇIKÇA yaz — bir sonraki ajan aynı çukuru kazmasın.
- "Şu iki denemeyi tekrarlama" talimatı değerlidir; "şurayı arama" talimatı değil.
- Teşhisin **kapsamını** da yanlışlanabilir yaz: "yalnız bu test mi bozuk?" → aynı dosyadaki
  her testi aynı ölçümden geçir.
- Suçlanan commit'i `git blame` ile doğrula; kart tarih/commit verdiğinde bu 10 saniyelik
  kontrol çoğu zaman anlatıyı çürütür.

İlgili: [[an-audits-best-finding-hides-in-a-passing-clause]] ·
[[fabrika-workspace-url-segment-is-decorative]]
