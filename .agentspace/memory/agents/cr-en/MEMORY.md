# Memory Index

- [fabrika-evidence-files-are-write-once-hook](fabrika-evidence-files-are-write-once-hook.md) — docs/agent-results/ altındaki var olan bir kanıt dosyasını değiştiren commit pre-commit hook'uyla reddedilir — kartın yolu TEK ise -2.md değil ALLOW_EVIDENCE_OVERWRITE=1 doğru çıkış
- [fabrika-full-suite-timeouts-are-load-flakes](fabrika-full-suite-timeouts-are-load-flakes.md) — pnpm test'te para/yuvarlama sweep testleri "Test timed out in 5000ms" ile düşerse suçu kendi değişikliğinde arama — izole koşuda geçerler, tetikleyici paralel yük
- [fabrika-i18n-gate-blind-to-src-components-and-ternaries](fabrika-i18n-gate-blind-to-src-components-and-ternaries.md) — pnpm i18n:check yeşilken de gömülü metin olabilir — check 4 yalnız src/app + src/modules tarar ve yalnız jsx-text + 4 attribute sayar, const x = isTr ? 'a' : 'b' görünmez
