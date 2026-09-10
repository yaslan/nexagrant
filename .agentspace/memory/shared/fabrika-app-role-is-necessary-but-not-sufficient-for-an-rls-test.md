---
name: fabrika-app-role-is-necessary-but-not-sufficient-for-an-rls-test
description: fabrika_app rolüyle ölçmek RLS testi için YETMEZ — sonuç-iddiası (satır doğru kiracıya düştü mü) sarmalayıcısız kodda da yeşil geçer; kapsamı KAYDEDEN yapısal iddia ekle
metadata:
  type: feedback
updatedAt: 2026-09-10
---

`fabrika_app` (NOBYPASSRLS) üzerinden ölçmek GEREKLİ ama **YETERLİ DEĞİL**
([[fabrika-local-green-is-worthless-under-a-bypassrls-role]] bir sonraki adımı söylemiyor).

Tuzak: fixture'ı superuser ile yazıp, işi RLS rolünden koşup, sonucu RLS rolünden geri
okuyan bir test yazarsın — "her satır kendi kiracısına düştü" yeşil. Kod `withTenant`'ı
tamamen atıp çıplak `prisma`'ya dönse **bu test yine yeşil kalır**: yereldeki singleton
SUPERUSER olduğu için satır zaten doğru `tenantId` ile yazılır, RLS okuması da onu doğru
yerde görür. Sonuç doğru; sarmalayıcının varlığı hakkında hiçbir şey söylenmemiş olur.

TASK-MTVR8KK92G0GA'da bunu canlı yakaladım: mutant (bare `prisma`'ya dönüş) ilk halinde
testi kırmadı.

**Nasıl uygulanır:** sarmalayıcıyı enjekte edilebilir yap (`TenantRunner` = `withTenant`'ın
imzası, testte `withTenantOn(rlsClient, …)`) ve açılan her kapsamın `tenantId`'sini
KAYDET; sonra sırayı da iddia et:
`expect(runner.scopes).toEqual([A, B])` · alerts'te arama başına iki kapsam `[A, A, B, B]`.
Sarmalayıcısız kod hiç kapsam açamaz → kırmızı. Kapanış-hatası (closure capture) mutantı
da aynı iddiaya takılır.

Aynı fikrin mock'lu muadili: [[a-mock-that-omits-an-export-is-a-structural-guard]] —
`@/lib/db` mock'undan `withTenant`'ı çıkarınca sarmalanmamış çağrı tip/çalışma düzeyinde
görünmez olur. İkisi de "kuralı yorumla değil, süitle bağla" ailesinden.

Doğrulama reçetesi: her yeşili, o yeşili kırmızıya çeviren bir mutantla eşle — ve mutantı
TEST DOUBLE'a değil ÜRETİM DOSYASINA uygula, sonra geri al ve geri aldığını `diff -q` ile
kanıtla. Bkz. [[a-handed-down-root-cause-is-a-hypothesis]].
