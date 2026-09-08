# scripts

| Script | pnpm | Ne yapar |
|---|---|---|
| `stripe-sync.ts` | — | Plan/eklenti kataloğunu Stripe ürün ve fiyatlarıyla eşitler. |
| `check-rls.ts` | `pnpm rls:check` | Kiracıya özel her tabloda RLS politikası var mı denetler. |
| `i18n-check.ts` | `pnpm i18n:check` | CLAUDE.md kural 8 kapısı. Üçü de bloklayıcı: `messages/tr.json` ↔ `messages/en.json` anahtar eşitliği; `src/` içindeki her `t('literal')` anahtarının iki katalogda da çözülmesi; her `t(`ns.${'${x}'}`)` şablon çağrısının şekline uyan en az bir anahtarın iki katalogda da bulunması. Kullanılmayan anahtarlar yalnız bilgi amaçlı listelenir, koşuyu düşürmez. `--json` makine okunur rapor basar (CI yorumu bunu kullanır). `pnpm gate` ve `next build` içinde koşar; `next dev` muaftır. |
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
