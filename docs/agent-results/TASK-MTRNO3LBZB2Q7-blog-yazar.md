# TASK-MTRNO3LBZB2Q7 — bağımsız doğrulama: `notFound()` oturumlu istekte HTTP 200

**Ajan:** blog-yazar · **Tip:** bug (doğrulama görevi) · **Tarih:** 2026-09-08
**Karar:** Kart **DOĞRU KAPATILMIŞ**, düzeltme **canlı ve kalıcı**. Orijinal düzeltme
`blok-zincir-denet-i` tarafından yapılmış (commit `02e22be`, rapor
`docs/agent-results/TASK-MTRNO3LBZB2Q7-blok-zincir-denet-i.md`); bu doğrulama o raporu
OKUYUP GÜVENMEK yerine kodu ve testi kendi başıma, sıfırdan koşturarak yaptı.

---

## 1. Ne yapıldı

1. `02e22be` commit'inin `dev` dalının (bu pane'in HEAD'i) ATASI olduğunu doğruladım
   (`git merge-base --is-ancestor 02e22be HEAD` → evet) — yani düzeltme sadece bir raporda
   değil, çalışan kodda.
2. Kök nedenin gövdesini elle inceledim: `src/app/[locale]/(app)/[workspace]/loading.tsx`
   artık **yok** (`ls` → No such file or directory). Onun yerine 18 alt bölüm
   (`dashboard, settings, evidence, panel, reports, ...`) kendi `loading.tsx`'ini taşıyor ve
   hepsi ortak `src/components/WorkspaceLoadingSkeleton.tsx`'i yeniden dışa aktarıyor;
   bakışla (lookup) var/yok kararı verilen 8 bölümün (`opportunities, pipeline, partners,
   relationships, calls, cagrilar, concept-notes, firsatlar`) hiçbirinde `loading.tsx` yok.
   Bu, raporun iddia ettiği düzeltme şekliyle birebir örtüşüyor.
3. Regresyon testini **kendim, canlı `next dev` sunucusuna karşı** koşturdum (raporun
   transkriptine güvenmedim):
   ```
   $ npx playwright test tests/e2e/notfound-status.spec.ts --reporter=line
   [1/3] an unknown id under (app) is 404, and the routes that exist stay 200
   [2/3] signed out, the same URLs redirect and never reach notFound()
   [3/3] both locales render their own copy, and the way home keeps the locale
   3 passed (6.3s)
   ```
   Bu tek koşu, dispatch'in istediği **oturumlu vs oturumsuz yan yana ölçümü** zaten
   sağlıyor: test [1] gerçek giriş (`/tr/giris` formu + submit, sahte JWT değil) ile
   11 lookup-rotasının **404**, 7 gerçek rotanın **200** döndüğünü ağ katmanından
   (`response.status()`, Playwright `Page.goto` yanıtı — render edilen sayfa değil)
   doğruluyor; test [2] AYNI URL'lerin oturumsuz halinin `/giris`'e 307 ile düştüğünü ve
   `notFound()`'a hiç ulaşmadığını kayda geçiriyor — kartın orijinal yanlış kapanışının
   (TASK-MTQYY136Q3CGG, oturumsuz ölçüm) neden aldatıcı olduğunu tam olarak gösteren fark bu.
4. Fixture'ın giriş akışını okudum (`tests/e2e/fixtures/notfound-tenant.ts:94-105`):
   `/tr/giris` sayfasına gidip email doldurup submit ediyor — gerçek oturum çerezi, elle
   üretilmiş JWT/rol değil. [[fabrika-run-unique-session-name-proves-actor]] kalıbına uygun.
5. **404 sayfasının dili** (dispatch madde 3): aynı spec dosyasındaki üçüncü test
   (`LOCALE_CASES`, satır 105-159) hem `tr` hem `en` için lookup-404 ve unrouted-404'ü
   ayrı ayrı ölçüp locale'e göre başlık/CTA/`html[lang]` doğruluyor — bu da PASS.
   Bu test aslında ayrı bir kart olan **TASK-MTS6MMOD8XF3A**'ya ait; `src/app/[locale]/**`
   altındaki 404/not-found dosyalarına DOKUNMADIM, yalnız gözlemledim.
6. **Regresyon nöbetçisi var mı** (dispatch madde 4): EVET — `tests/e2e/notfound-status.spec.ts`,
   yukarıda koşturulan tam da bu dosya. `[workspace]/loading.tsx` geri konursa test [1]
   kırmızı olur (bunu orijinal rapor §2.5'te KIRMIZI→YEŞİL ile kanıtlamış; ben tekrar
   bozup düzeltmedim, kapsam dışı).

## 2. Kanıt

```
$ git merge-base --is-ancestor 02e22be HEAD && echo "YES ancestor"
YES ancestor

$ ls src/app/[locale]/(app)/[workspace]/loading.tsx
ls: ... No such file or directory   ← kök neden dosyası kalıcı olarak kaldırılmış

$ npx playwright test tests/e2e/notfound-status.spec.ts --reporter=line
Running 3 tests using 1 worker
[1/3] ... an unknown id under (app) is 404, and the routes that exist stay 200
[2/3] ... signed out, the same URLs redirect and never reach notFound()
[3/3] ... both locales render their own copy, and the way home keeps the locale
  3 passed (6.3s)
```

Sunucu: bu pane'in zaten çalışan `next dev` (`:3000`, pid dinliyordu — ben başlatmadım,
mevcut oturumdan kullandım). Test kendi geçici kiracısını (`nf-e2e-tenant`) `beforeAll`'da
kurup `afterAll`'da siliyor; DB'de kalıcı iz bırakmıyor.

## 3. Değişen dosyalar
Yok — bu görev salt doğrulama; kod değişikliği yapılmadı. Yalnız bu rapor dosyası eklendi.

## 4. Riskler
Yok. Düzeltme zaten `dev`'de, test canlı sunucuya karşı geçti.

## 5. Açık sorular
- Dispatch metni TASK-MTS6MMOD8XF3A'yı "customer-support'un kartı" olarak tanımlıyordu;
  board'da şu an **`@blok-zincir-denet-i`**'ye atanmış görünüyor (`status: review`). Atama
  dispatch yazıldıktan sonra değişmiş olabilir — dokunmadım, yalnız not düşüyorum.

## 6. Sonraki adım
Yok — kart kapanabilir. Task board'da `done`'a taşıdım.
