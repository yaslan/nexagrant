---
name: fabrika-env-ts-cannot-be-read-from-a-client-component
description: src/lib/env.ts safeParse'i TÜM ortam nesnesini okur — tarayıcı paketinde o nesne yok, bu yüzden bir client component'te env.X her zaman şema varsayılanını döndürür; NEXT_PUBLIC_* değeri sunucu bileşeninden PROP olarak geçir
metadata:
  type: project
  updatedAt: 2026-09-10
---

`src/lib/env.ts` şemayı `envSchema.safeParse(process.env)` ile **bir kez, import anında** çalıştırır —
tekil değişkenleri değil, **tüm ortam nesnesini** okur. Next.js istemci paketinde böyle bir nesne yoktur:
derleyici yalnızca kodda **gördüğü** `process.env.NEXT_PUBLIC_X` üye ifadelerini gömer, çıplak `process.env`
referansını değil. Sonuç: `'use client'` başlıklı bir dosyada `import { env } from '@/lib/env'` yaparsan
şema hiçbir şey ayrıştıramaz ve **ortam nasıl yapılandırılırsa yapılandırılsın her zaman kendi
`.default()` değerini** döndürür. Hata vermez, sessizce yanlış değer verir.

Bu yüzden depoda `env.ts`'i okuyan **tek bir client component yok** — ölçüm:

```
for f in $(grep -rl "from '@/lib/env'" src/); do echo "$(head -3 "$f" | grep -c 'use client')  $f"; done
```

(2026-09-10'da 12 dosyanın hepsi `0`.)

**Doğru desen:** değeri `env.ts`'i zaten sunucuda okuyan sayfa/layout'ta oku ve client component'e **prop**
olarak geçir; prop'a varsayılan koyma, varsayılan yalnız zod şemasında yaşasın.

```tsx
// page.tsx (server component)
import { env } from '@/lib/env';
<SmtpSettingsForm fromAddress={env.NEXT_PUBLIC_SMTP_FROM_ADDRESS} />

// smtp-form.tsx ('use client')
export function SmtpSettingsForm({ fromAddress }: { fromAddress: string }) { … }
```

`process.env`'e geri dönmek CLAUDE.md "Yapma" listesini çiğner; `?? 'literal'` yedeği eklemek de
varsayılanı ikinci bir yere kopyalar — ayrıştıklarında hangisinin kazandığı sessiz bir hataya dönüşür
(TASK-MTV8WPLBFQNAO: aynı adres bileşen + şema + `request-deletion.ts` olmak üzere ÜÇ yerde yaşıyordu).

Bir varsayılanı tek yere indirdiğini `grep -rn "<varsayılan>" src/` ile ölç — kaldırdığını sandığın
kopyanın üçüncüsü genelde bambaşka bir dosyadadır.

İlgili: [[fabrika-dotenv-after-imports-never-reaches-env-ts]] · [[fabrika-use-client-exports-are-client-references]] ·
[[fabrika-env-flip-restarts-shared-dev-server]]
