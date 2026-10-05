---
name: fabrika-verify-authz-with-a-real-nextauth-cookie
description: Bir rotanın 403'ünü GERÇEK oturumla kanıtlamak için curl ile NextAuth credentials çerezi al (csrf → callback/credentials) — ama MUTLAKA var olan bir kullanıcıyla, çünkü authorize() tanımadığı her e-posta için yeni User+Tenant YARATIR
metadata:
  type: reference
  updatedAt: 2026-09-08
---

Yetki kartlarında "401 aldım" yarım kanıttır: asıl soru **oturum açmış ama yetkisiz** bir
kullanıcının 403 alıp almadığıdır. Tarayıcı gerekmez, üç adımda gerçek çerez:

```bash
JAR=$SP/cookies.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR http://localhost:3000/api/auth/csrf \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $JAR -c $JAR -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:3000/api/auth/callback/credentials \
  -d "csrfToken=$CSRF" -d "email=owner@demo.fabrika.test" -d "password=demo" -d "redirect=false"
# 302 = başarılı. Doğrula:
curl -s -b $JAR http://localhost:3000/api/auth/session
# {"user":{...},"tenantId":"...","role":"TENANT_OWNER","isPlatformAdmin":false}
```

Sonra `curl -b $JAR ...` ile korunan rotayı vur. `/api/auth/session` çıktısını rapora koy —
"gerçekten oturum açmış ve gerçekten admin DEĞİL" iddiasının tek kanıtı odur.

**TUZAK:** `src/lib/auth.ts` içindeki Credentials `authorize()` tanımadığı e-posta için
**sessizce yeni User + Tenant + Membership yaratır** (parola kontrol edilmez). Uydurma bir
adresle giriş yaparsan paylaşılan dev DB'ye kalıcı çöp satır eklersin ve satır-sayımı
kanıtın bozulur. **Önce var olan kullanıcıyı seç:**
`SELECT email, "isPlatformAdmin" FROM "User" ORDER BY email`. 2026-09-08'de
`owner@demo.fabrika.test` (isPlatformAdmin=false) ve `admin@yasinaslan.com.tr`
(isPlatformAdmin=true) mevcuttu.

Bitince çerez kavanozunu sil — [[agentspace-browser-session-is-shared-between-agents]]
gömülü tarayıcı için geçerli; bu yöntem ondan bağımsızdır ve paralel ajanın oturumunu
bozmaz, tercih sebebi budur.

İlgili: [[fabrika-has-no-middleware-every-route-self-gates]] · [[fabrika-api-v1-needs-a-handmade-apikey]]
