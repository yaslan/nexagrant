# scripts

| Script | pnpm | Ne yapar |
|---|---|---|
| `apply-migrations.sh` | — | `prisma/migrations` altındaki ileri migration'ları `prisma/migrations/apply-order.txt` sırasıyla `psql -v ON_ERROR_STOP=1` ile uygular (TASK-MULU7SAA4EPP8). Sıra kuralı: her dosyanın depoya ilk girdiği commit sırası; yeni migration listenin SONUNA, dosyayı ekleyen commit'te eklenir. Liste ile diskteki dosyalar uyuşmazsa hiçbir şey uygulamadan düşer. Temel tabloları kurmaz: boş veritabanında önce `prisma db push`, sonra `pnpm db:rls-role`, sonra bu betik, sonra `pnpm db:rls`. İki kez koşmak da 0 döner; CI bunu her koşuda ölçer. `--list` yalnız sırayı basar. Geri alma: her dosyanın `.down.sql`'i ters sırayla, elle. |
| `stripe-sync.ts` | — | Plan/eklenti kataloğunu Stripe ürün ve fiyatlarıyla eşitler. |
| `check-rls.ts` | `pnpm rls:check` | Kiracıya özel her tabloda RLS politikası var mı denetler. |
| `i18n-check.ts` | `pnpm i18n:check` | CLAUDE.md kural 8 kapısı. Dördü de bloklayıcı: `messages/tr.json` ↔ `messages/en.json` anahtar eşitliği; `src/` içindeki her `t('literal')` anahtarının iki katalogda da çözülmesi; her `t(`ns.${'${x}'}`)` şablon çağrısının şekline uyan en az bir anahtarın iki katalogda da bulunması. Dördüncüsü kural 8'in diğer yarısı: `src/app/**` ve `src/modules/**` altındaki `.tsx` dosyalarında JSX metin düğümü ya da `title`/`label`/`placeholder`/`aria-label` olarak yazılmış **gömülü kullanıcı metni**. Ölçüt: Türkçe karakter taşıyan ya da 2+ kelimelik literal; `className`, `data-testid`, rota, import yolu gibi teknik dizeler sayılmaz. Bu kontrol **cırcır (ratchet)**: kök dizindeki `i18n-baseline.json` (`"<dosya>": <ihlal sayısı>`) mevcut borcu tutar, kapı yalnız bir dosyanın sayısı BÜYÜRSE ya da baseline'da olmayan bir dosya ihlal taşırsa kırmızı olur. Borç ödendiğinde koşu yeşil kalır ve "baseline güncellenmeli" uyarısı basar; ledger'ı `pnpm i18n:check --update-baseline` ile tazele ve metni taşıyan commit'le birlikte gönder (baseline yalnız küçülmeli). Kural neden baseline'lı devreye alındı: doğrudan açmak kapıyı 325 literal / 37 dosya ile anında kırmızıya çevirirdi ve kırmızı doğan kapı kapatılır (TASK-MTU64MMEQC0WV §B-01). Kullanılmayan anahtarlar yalnız bilgi amaçlı listelenir, koşuyu düşürmez. `--json` makine okunur rapor basar (CI yorumu bunu kullanır). `pnpm gate` ve `next build` içinde koşar; `next dev` muaftır. |
| `i18n-hardcoded.ts` | — | Yukarıdaki dördüncü kontrolün tespit motoru; `i18n-check.ts` içe aktarır. Tek başına koşturulmaz. Kuralların sınırı `tests/i18n-hardcoded-detector.test.ts` içinde çiviyle sabitlenmiştir — kapıyı yeşile almak için tespiti gevşetmek yasak. |
| `cordis-import.ts` | — | CORDIS dökümünü içe aktarır. |
| `create-superadmin.ts` | — | Platform yöneticisi kullanıcısı oluşturur. |
| `beta-onboarding.ts` | `pnpm beta:onboard` | E11 beta ortaklarını açar (kiracı, davet, ICS). Varsayılan **dry-run**; yazmak için `--apply`, göndermek için `--send`. Geri alma: `pnpm beta:rollback --apply`. |
| `beta-pricing-survey.ts` | `pnpm beta:pricing` | E11.4 fiyat anketini üretir (tr/en soru formu, Google Forms betiği, yanıt CSV şablonu, davet e-postaları) ve yanıt CSV'sinden `docs/E11-PRICING-FEEDBACK.md` raporunu yeniden üretir. Hiçbir şey göndermez; `--send` yalnız gerçek adres **ve** yayımlanmış form URL'i ile çalışır. |

## beta-pricing-survey.ts

```bash
pnpm beta:pricing                                          # her şeyi üret, hiçbir şey gönderme
pnpm beta:pricing --send --form-tr=<url> --form-en=<url>   # Resend ile dağıt (RESEND_API_KEY gerekir)
pnpm beta:pricing --analyze --responses=<csv>              # raporu yeniden üret
```

Yanıt CSV'sinin başındaki `# STATUS: FIXTURE|REAL` satırı raporun uyarı bandını belirler: gerçek
olmayan veriyle üretilmiş bir rapor kendini gerçekmiş gibi sunamaz.
