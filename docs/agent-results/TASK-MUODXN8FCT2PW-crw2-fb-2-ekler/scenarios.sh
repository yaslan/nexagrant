#!/bin/bash
# crw2-fb TASK-MUODXN8FCT2PW — İNCELEME-110: bağımsız ölçüm. Gerçek yeni (dev b8cde55e) ve
# eski (f7a6dcf5^ = 3eb40805) M4 kodu, kayıt tutan mailer, RELEASE_CHECKLIST §3.1 blokları
# birebir (ops/blockN.sh, extract-blocks.py ile belgeden çıkarıldı), zincir süper kullanıcıyla.
set -u
export PATH=/opt/homebrew/opt/libpq/bin:$PATH
SP=/private/tmp/claude-501/-Users-macbook-alan/6b4bf0a8-11ea-4f02-841f-49270074e445/scratchpad
S=postgresql://fabrika:crw2pw@127.0.0.1:55110/f      # süper kullanıcı: tohum + zincir
O=postgresql://own:ownpw110@127.0.0.1:55110/f         # sahip rol (süper/BYPASSRLS değil): operatör blokları
APP=$(grep '^DATABASE_URL_RLS_TEST=' $SP/wt/.env | cut -d= -f2-)   # fabrika_app: worker'lar
mask() { printf '%s' "$1" | sed -E 's#(://[^:]+:)[^@]+@#\1***@#'; }
q() { psql -X -Atq "$S" "$@"; }
D=$(q -c "select (now() at time zone 'UTC')::date"); DM1=$(q -c "select ((now() at time zone 'UTC')::date - 1)")
DM3=$(q -c "select ((now() at time zone 'UTC')::date - 3)")
echo "chain DATABASE_URL=$(mask $S) | ops DATABASE_URL=$(mask $O) | worker DATABASE_URL=$(mask $APP)"
echo "UTC bugün D=$D  D-1=$DM1  D-3=$DM3  (şimdi $(q -c "select now() at time zone 'UTC'"))"
seed_t() { q <<SQL
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES ('$1','$1','$1','TR',now());
INSERT INTO "Subscription"("tenantId","planId",status,"updatedAt") VALUES ('$1','pro','ACTIVE',now());
INSERT INTO "ModuleState"(id,"tenantId","moduleId",status) VALUES ('ms-$1','$1','M4','ON');
SQL
}
seed_u() { q -c "INSERT INTO \"User\"(id,email,\"updatedAt\") VALUES ('$1','$1@example.test',now())"; }
member() { q -c "INSERT INTO \"Membership\"(id,\"tenantId\",\"userId\") VALUES ('m-$1-$2','$1','$2')"; }
rel() { # id tenant owner lastContactAt-sql
  q -c "INSERT INTO \"Relationship\"(id,\"tenantId\",kind,\"counterpartName\",\"updatedAt\",\"ownerUserId\",\"lastContactAt\") VALUES ('$1','$2','partner','$1',now(),'$3',$4)"; }
new()  { echo "  yeni worker now=$1 [${*:2}]: $(cd $SP/wt    && DATABASE_URL=$APP node_modules/.bin/tsx .crw2-runner.ts "$@" 2>&1 | tail -1)"; }
old()  { echo "  ESKİ worker now=$1 [${*:2}]: $(cd $SP/wtold && DATABASE_URL=$APP node_modules/.bin/tsx .crw2-runner.ts "$@" 2>&1 | tail -1)"; }
chain() { # [PGTZ]
  local out rc; out=$(cd $SP/wt && DATABASE_URL=$S PGTZ=${1:-UTC} scripts/apply-migrations.sh 2>&1); rc=$?
  echo "  zincir (DATABASE_URL=$(mask $S) PGTZ=${1:-UTC}): exit=$rc; $(printf '%s\n' "$out" | tail -1)"; }
state() { for u in "$@"; do q -c "select '    '||u.id||': User='||coalesce(u.\"staleDigestOn\"::text,'NULL')||' | '||coalesce(string_agg(m.\"tenantId\"||'='||coalesce(m.\"staleDigestOn\"::text,'NULL'),', ' order by m.\"tenantId\"),'-') from \"User\" u left join \"Membership\" m on m.\"userId\"=u.id where u.id='$u' group by u.id,u.\"staleDigestOn\""; done; }
ops() { # dir blockN [label]  — belgedeki blok, sahip rolle, o dizinde
  echo "  \$ (cd ops-$1 && DATABASE_URL=$(mask $O) bash block$2.sh)   # ${3:-}"
  (cd $SP/ev/ops-$1 && DATABASE_URL=$O bash $SP/ev/ops/block$2.sh 2>&1 | sed 's/^/    | /'; echo "    | exit=${PIPESTATUS[0]}")
}
newops() { rm -rf $SP/ev/ops-$1; mkdir -p $SP/ev/ops-$1; }

echo; echo "===== (a) 2a UYGULANDI: yalnız yeni worker; aynı gün zincir 1+2+3 kez yeniden koşulur ====="
seed_t c2-ta; seed_u c2-ua; member c2-ta c2-ua; rel c2-ra c2-ta c2-ua "now()-interval '70 days'"
newops a; ops a 1 "2a (c): 3. adımdan ÖNCE taban"
chain; echo "  (3. adım)"
new - c2-ta; state c2-ua
ops a 2 "tespit, yeni worker sonrası"
for k in 1 2 3; do chain; state c2-ua; ops a 2 "tespit, zincirin ek koşusu #$k sonrası"; done
ops a 3 "ikinci özet sayısı"

echo; echo "===== (b) KARIŞIK: eski+yeni worker (2a atlanmış) ====="
seed_t c2-tb1; seed_u c2-ub1; member c2-tb1 c2-ub1; rel c2-rb1 c2-tb1 c2-ub1 "now()-interval '70 days'"
seed_t c2-tb2; seed_u c2-ub2; member c2-tb2 c2-ub2; rel c2-rb2 c2-tb2 c2-ub2 "now()-interval '70 days'"
newops b; ops b 1 "taban"
chain; echo "  (3. adım)"
echo "  -- b1: önce YENİ sonra ESKİ (ikinci özet gider)"
new - c2-tb1; rel c2-rb1x c2-tb1 c2-ub1 "now()-interval '61 days'"; old - c2-tb1; state c2-ub1
echo "  -- b2: önce ESKİ sonra YENİ (legacyClaims ikinciyi engeller)"
old - c2-tb2; new - c2-tb2; state c2-ub2
ops b 2 "tespit (beklenen: c2-ub1 ve c2-ub2)"; ops b 3 "ikinci özet sayısı, zincir yeniden koşmadan (beklenen 1: yalnız ub1)"
chain; state c2-ub1 c2-ub2
ops b 2 "tespit, yeniden koşu sonrası"; ops b 3 "sayı, yeniden koşu sonrası (belge: üst sınır, 2 beklenir)"

echo; echo "===== (c) UTC GÜN SINIRI: 23:59 / 00:01 damgaları ====="
seed_t c2-tc; seed_u c2-uc; member c2-tc c2-uc; rel c2-rc1 c2-tc c2-uc "timestamp '$DM1 23:59:00' - interval '70 days'"
newops c; ops c 1 "taban"; chain
new ${DM1}T23:59:00.000Z c2-tc; state c2-uc
q -c "select '    damga c2-rc1 staleRemindedAt='||\"staleRemindedAt\" from \"Relationship\" where id='c2-rc1'"
chain; chain Europe/Istanbul; chain America/Los_Angeles; state c2-uc
rel c2-rc2 c2-tc c2-uc "timestamp '$D 00:01:00' - interval '70 days'"
new ${D}T00:01:00.000Z c2-tc; state c2-uc
q -c "select '    damga c2-rc2 staleRemindedAt='||\"staleRemindedAt\" from \"Relationship\" where id='c2-rc2'"
chain; chain Europe/Istanbul; chain America/Los_Angeles; state c2-uc
ops c 2 "tespit (beklenen boş)"
echo "  -- SQL ile sınır kontrolü (worker'sız): User=D-1, damga D 00:00:00.000 → dolmalı (kapsamıyor); User=D-1, damga D-1 23:59:59.999 → atlanmalı"
seed_u c2-uc2; seed_u c2-uc3; member c2-tc c2-uc2; member c2-tc c2-uc3
rel c2-rc3 c2-tc c2-uc2 "timestamp '$DM1 00:00'"; rel c2-rc4 c2-tc c2-uc3 "timestamp '$DM1 00:00'"
q -c "update \"Relationship\" set \"staleRemindedAt\"=timestamp '$D 00:00:00.000' where id='c2-rc3'; update \"Relationship\" set \"staleRemindedAt\"=timestamp '$DM1 23:59:59.999' where id='c2-rc4'; update \"User\" set \"staleDigestOn\"='$DM1' where id in ('c2-uc2','c2-uc3')"
chain Europe/Istanbul; state c2-uc2 c2-uc3

echo; echo "===== (d) User.staleDigestOn > damga günü ====="
seed_t c2-td1; seed_t c2-td2; seed_u c2-ud; member c2-td1 c2-ud; member c2-td2 c2-ud
rel c2-rd1 c2-td1 c2-ud "timestamp '$DM3 12:00' - interval '70 days'"
newops d; ops d 1 "taban"; chain
new ${DM3}T12:00:00.000Z c2-td1; state c2-ud
rel c2-rd2 c2-td2 c2-ud "now()-interval '70 days'"; new - c2-td2; state c2-ud
q -c "update \"Membership\" set \"staleDigestOn\"=NULL where \"userId\"='c2-ud'"; echo "  (her iki üyelik NULL'a çekildi; User=D, damgalar: td1=D-3, td2=D)"
chain; chain; state c2-ud
ops d 2 "tespit (beklenen boş)"
echo "  -- kontrol: User < damga günü (User=D-3, td2 damgası D) → td2 dolmalı"
q -c "update \"User\" set \"staleDigestOn\"='$DM3' where id='c2-ud'"; chain; state c2-ud
q -c "update \"Membership\" set \"staleDigestOn\"=NULL where \"userId\"='c2-ud'; update \"User\" set \"staleDigestOn\"='$D' where id='c2-ud'"

echo; echo "===== (e) çok üyelikli kullanıcı (3 kiracı, 2'sinde vadesi gelmiş ilişki) ====="
for t in c2-te1 c2-te2 c2-te3; do seed_t $t; done; seed_u c2-ue
for t in c2-te1 c2-te2 c2-te3; do member $t c2-ue; done
rel c2-re1 c2-te1 c2-ue "now()-interval '70 days'"; rel c2-re2 c2-te2 c2-ue "now()-interval '65 days'"
newops e; ops e 1 "taban"; chain
new - c2-te1 c2-te2 c2-te3; state c2-ue
chain; chain; chain; state c2-ue
ops e 2 "tespit (beklenen boş)"; ops e 3 "sayı (beklenen 0)"

echo; echo "===== (f) belgedeki DAR İSTİSNA: aynı gün sahip değişikliği + zincir yeniden koşusu ====="
seed_t c2-tf; seed_u c2-uf1; seed_u c2-uf2; member c2-tf c2-uf1; member c2-tf c2-uf2
rel c2-rf c2-tf c2-uf1 "now()-interval '70 days'"
newops f; ops f 1 "taban"; chain
new - c2-tf; q -c "update \"Relationship\" set \"ownerUserId\"='c2-uf2' where id='c2-rf'"; echo "  (c2-rf sahibi uf1→uf2)"
chain; state c2-uf1 c2-uf2
ops f 2 "tespit (belge: dar istisna → uf2 görünür, eski worker yok)"

echo; echo "===== sonuç: tüm senaryo kullanıcıları ====="
state c2-ua c2-ub1 c2-ub2 c2-uc c2-uc2 c2-uc3 c2-ud c2-ue c2-uf1 c2-uf2
