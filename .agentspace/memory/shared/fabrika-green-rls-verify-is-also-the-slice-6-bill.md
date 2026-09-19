---
name: fabrika-green-rls-verify-is-also-the-slice-6-bill
description: pnpm rls:verify yeşili ile "fabrika_app'e geçince 11 ürün yolu 0 satır döner" AYNI ölçümdür — yeşili "sorun yok" diye okuma
metadata:
  type: project
  updatedAt: 2026-09-10
---

`pnpm rls:verify` şunu yazıyor ve doğru yazıyor:

```
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false)
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
✅ 46 kiracıya özel tabloda ... izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

**Aynı cümle iki şey söylüyor.** "app.tenant_id yokken 0 satır" hem izolasyonun çalıştığının
kanıtı, hem de **sarmalayıcısız her çağrının o rolde boş döneceğinin** kanıtı. Uygulama bugün
`fabrika` rolüyle bağlanıyor (`rolbypassrls=true`), o yüzden üretimde bugün hiçbir şey kırık
değil — kırılma `fabrika_app`'e geçildiği gün toplu olur.

TASK-MTVRAZSUVLL9R (de-fb, 2026-09-10) bu eşlemeyi çıkardı: `fabrika_app` altında 0 dönen
her dolu tablonun hangi ÜRÜN yoluna bağlı olduğu. En ağır dördü:

| Yol | Çağrı yeri | `fabrika_app` altında sonuç |
|---|---|---|
| API anahtarı doğrulama | `src/lib/api-auth.ts:41` `prisma.apiKey.findUnique` | her istek 401 |
| Veri sahibi dışa aktarımı | `src/actions/user/export-data.ts:67` | BOŞ dosya (15 üyelik, 9 kullanım, 28 fırsat → 0) |
| Silme talebi | `src/actions/user/request-deletion.ts:135` | hiçbir şey silmeden "başarılı" — KVKK/GDPR'da en ağırı |
| Platform-admin konsolları | ModuleState / Feedback / Subscription | boş ekran |

**Why:** bu çağrılar `withTenant`'a **alınamaz** — kiracı ya sorgunun cevabı (API anahtarından
kiracıyı bul) ya da sorusu bütün estate'i kapsıyor (GDPR dışa aktarımı). Yani "Dilim 1-4'ü
bitirdik, sarmalama işi bitti" YANLIŞ; bu 11 çağrı için **yaptırımlı bir çapraz-kiracı yolu**
gerekiyor.

**How to apply:** `rls:verify` yeşilini bir go-live onayı gibi sunma. Kart:
**TASK-MTVTPVTEBCF5Z** (Dilim 6) — DoD'si sınıf başına mekanizma + ADR + bu tablonun yeniden
ölçülmesi. Rol geçişi bu kart kapanmadan yapılamaz. Bkz. [[fabrika-bypass-check-is-a-live-backlog-ledger]].
