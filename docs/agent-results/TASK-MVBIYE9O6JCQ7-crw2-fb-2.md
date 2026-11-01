# TASK-MVBIYE9O6JCQ7 (FO-20#review) — PR #76 inceleme eki (crw2-fb)

İlk rapor: `docs/agent-results/TASK-MVBIYE9O6JCQ7-crw2-fb.md` (değiştirilmedi).

## Ek (2026-10-17) — m4 düzeltmesi ve açılan kartlar

**m4 daraldı.** İlk raporda "uçtan uca akış varsayılan kapıda koşmuyor" demiştim; yeniden kontrolde durum farklı çıktı:
- `.github/workflows/ci.yml:52` mailpit servisini tanımlıyor; e2e adımı `SMTP_HOST`, `SMTP_PORT` ve `E2E_MAILPIT_URL` değişkenlerini veriyor. Yani CI'da bu spec koşacak biçimde ayarlı.
- Yerel `pnpm gate`'teki FO-20 dışı kırmızılar (`theme-*` testlerindeki sabit `:3000` portu, `team-members-ui` cooldown) FO-22 / PR #77 ile giderildi.

**Asıl sorun:** GitHub Actions job'ları başlamıyor. PR #76'nın check'leri 2–3 sn'de, adım çalışmadan düşüyor:
```
$ gh pr checks 76
build-and-test   fail  2s
i18n-audit       fail  3s
lighthouse-a11y  fail  2s
$ gh api repos/yaslan/fonbridge/check-runs/117242851926/annotations --jq '.[].message'
The job was not started because recent account payments have failed or your spending limit needs to be increased. ...
```
`dev`'deki son merge koşuları (#75, #71, #77) da aynı şekilde düşmüş. CI şu an hiçbir PR'ı korumuyor. Bunu düzeltmek ofis sahibinin işi (Billing & plans).

**Açılan kartlar:**
- **FO-28 · TASK-MVC30JGOJTXJW** (fe-fb): M1, combobox odak + Enter.
- **FO-29 · TASK-MVC328LPDUWMM** (be-fb): m1, imzalı doğrulandı sonucu; m3'teki ölü kodu da siliyor.
- **FO-31 · TASK-MVC35ULM2X2D0** (fe-fb): m2, 100 ve 24 saat sabitlerinin BE sabitlerine bağlanması.
- **FO-32 · TASK-MVC36EFDB7VX8** (devop-fb, backlog): m4, faturalama düzelince CI'ı yeniden koşma ve sessiz skip koruması.
