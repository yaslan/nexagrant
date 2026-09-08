# TASK-MTR60M5ESB5PZ — M10 çift onay: denetim kaydına uydurma isim yazılıyor mu?

**Sonuç: KART BAYAT.** İddia edilen kusur zaten düzeltilmiş ve bağımsız olarak doğrulanmıştır.

## 1. Ne yapıldı

Kart, M10 çift onay akışında denetim kaydına sabit `'Dr. Mehmet Yılmaz'` yazıldığını iddia
ediyordu. Bu, önceki dalgada (`0139656 fix(m10): dual approval audit trail takes its actor
from the session, never a default name`, sonra `a2b1816` ile durable hale getirildi) zaten
düzeltilmiş görünüyordu. Görevim bunu kendi ölçümümle bağımsız teyit etmekti — mevcut testin
kendi assertion'larına güvenmek yerine.

Adımlar:
1. `src/modules/m10/server/actions.ts` ve `src/lib/dual-approval.ts` okundu — `requireApprovalActor()`
   aktörü yalnız `auth()` oturumundan okuyor (`session.user.name` → email local-part → `userId`
   fallback zinciri), hiçbir yerde sabit isim yok.
2. `git log` ile geçmiş doğrulandı: `0139656` commit'i tam olarak "default'u kaldır, oturumdan oku"
   değişikliğini yapmış (diff'te eski `actorName: string = 'Dr. Mehmet Yılmaz'` satırı görüldü).
3. `grep -rn "Dr. Mehmet Yılmaz" src/` çalıştırıldı → **8 eşleşme, hepsi yorum satırı**
   (regresyonu açıklayan doküman yorumları — `blog.ts`, `auth.ts`, `document-exporter.ts`,
   `user-display.ts`, `admin/blog/page.tsx`, `login/AuthCard.tsx`, `m11/types.ts`,
   `m11/PartBCollaborativeEditor.tsx`). Kod yolunda (string literal, default parametre) **0** eşleşme.
4. Mevcut e2e testi (`tests/e2e/m10-audit-identity.spec.ts`, `503c7ec`'te eklenmiş) gerçek
   tarayıcıda çalıştırıldı: iki farklı oturum (A: gerçek tenant kullanıcısı, B: testin seed'lediği
   ikinci üye), her run'da rastgele üretilen görüntü adlarıyla (`E2E Approver A/B <run>`) —
   böylece kodda önceden yazılmış bir isim testi geçemez. Sonuç: **3/3 test PASS**.
5. Bağımsız DB kanıtı için teste **geçici** bir debug bloğu eklendi (`DualApprovalStep` ve
   `FollowupDoc` tablolarını ham okuyup `console.log` ile bastıran, ardından `git checkout --`
   ile geri alınan — repoda kalıcı değişiklik YOK), tek testi tekrar çalıştırdım:

   ```
   RAW_VERIFY_DOC   {"approvalSubmittedById":"plan-e2e-ultra-user","approvalSubmittedByName":"E2E Approver A mtsi0b26"}
   RAW_VERIFY_STEPS [{"department":"FINANCE","actorUserId":"plan-e2e-ultra-user-b","actorName":"E2E Approver B mtsi0b26"},
                      {"department":"LEGAL","actorUserId":"plan-e2e-ultra-user","actorName":"E2E Approver A mtsi0b26"}]
   ```

   Bu satırlar doğrudan Postgres'ten (`prisma.dualApprovalStep.findMany` / `prisma.followupDoc.findUnique`)
   okundu — uygulamanın UI'da türettiği state değil, kalıcı tabloların kendisi. `actorUserId`/
   `actorName` çiftleri, o run için mint edilen gerçek oturum kimlikleriyle birebir eşleşiyor;
   `Dr. Mehmet Yılmaz` hiçbir satırda yok.
6. İlgili birim testleri de çalıştırıldı: `tests/dual-approval.test.ts`,
   `tests/m10-dual-approval-action.test.ts`, `tests/modules/m10.test.ts` → **48/48 PASS**.

## 2. Kanıt

```
$ npx playwright test tests/e2e/m10-audit-identity.spec.ts --reporter=list
  ✓ the approval record names the session that acted, and each step names its own actor (975ms)
  ✓ an identity-less visitor never reaches the approval surface (437ms)
  ✓ an unauthorised write is refused by the action itself — measured on a LIVE action id (599ms)
  3 passed (3.0s)

$ npx playwright test tests/e2e/m10-audit-identity.spec.ts -g "names the session" --reporter=list
  RAW_VERIFY_DOC   {"approvalSubmittedById":"plan-e2e-ultra-user","approvalSubmittedByName":"E2E Approver A mtsi0b26"}
  RAW_VERIFY_STEPS [{"department":"FINANCE","actorUserId":"plan-e2e-ultra-user-b","actorName":"E2E Approver B mtsi0b26"},{"department":"LEGAL","actorUserId":"plan-e2e-ultra-user","actorName":"E2E Approver A mtsi0b26"}]
  ✓ 1 passed (1.7s)

$ grep -rn "Dr. Mehmet Yılmaz\|requireApprovalActor" src/
  → 8 hits, all inside /** ... */ or // comment lines documenting the past bug; 0 in
    executable code (string literals / default parameters)

$ npx vitest run tests/dual-approval.test.ts tests/m10-dual-approval-action.test.ts tests/modules/m10.test.ts
  Test Files  3 passed (3)
       Tests  48 passed (48)
```

`git status --short` sonunda `tests/e2e/m10-audit-identity.spec.ts` temiz görünüyor —
doğrulama amaçlı geçici debug satırları commit edilmedi, `git checkout --` ile geri alındı.

## 3. Değişen dosyalar

**Yok.** Bu görev salt doğrulamaydı; kalıcı hiçbir dosya değiştirilmedi. (Doğrulama sırasında
`tests/e2e/m10-audit-identity.spec.ts`'e geçici bir debug bloğu eklenip hemen `git checkout --`
ile geri alındı — repoda iz bırakmadı.)

## 4. Riskler

Yok — kart bayat, kod tabanında düzeltilmemiş bir açık bulunmadı.

## 5. Açık sorular

- Yok (bu görev kapsamında). Devir notundaki ayrı konu (blog gövdesinin `/en/blog`'da hâlâ
  sabit Türkçe göstermesi, `src/lib/blog.ts`) bu göreve ait değil, dokunulmadı.

## 6. Sonraki adım

Task Board'da bu kartı **"kart bayat / zaten düzeltilmiş, bağımsız doğrulandı"** notuyla
kapatılabilir olarak işaretle.
