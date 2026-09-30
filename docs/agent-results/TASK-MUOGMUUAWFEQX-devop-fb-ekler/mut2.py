# devop-fb TASK-MUOGMUUAWFEQX mutantları. M6 be-fb'nin mut.py'sindekiyle birebir.
import sys
W=sys.argv[1]; m=sys.argv[2]
A=W+'/scripts/apply-migrations.sh'; G=W+'/prisma/migration-owner-grant.sql'
def sub(p, old, new):
    s=open(p).read(); assert s.count(old)==1, (m, old); open(p,'w').write(s.replace(old,new))
if m=='M6':   # son-kontrol saklı varsayılan kontrolü silindi (be-fb mut.py ile aynı: son 'leaked=$(system_scope_defaults)')
    s=open(A).read(); i=s.rindex('leaked=$(system_scope_defaults)'); s=s[:i]+'leaked=""'+s[i+len('leaked=$(system_scope_defaults)'):]; open(A,'w').write(s)
elif m=='N1': # Ö-4 son-kontrolü kapalı
    sub(A, 'if [ -n "$unseen" ]; then', 'if false; then')
elif m=='N2': # --down oturumu SET app.system_scope açmıyor
    sub(A, '''-c "SET app.system_scope = 'on'" -c "SET fabrika.migration_down = 'on'"''', '''-c "SET fabrika.migration_down = 'on'"''')
elif m=='N3': # rename-feedback down dosyasından koruma satırı silindi
    sub(W+'/prisma/migrations/rename-feedback-alert-columns.down.sql', '\\ir ../migration-down-guard.sql\n', '')
elif m=='N4': # --down ileri dosyaları da kabul ediyor
    sub(A, '      *) down= ;;\n', '      *) ;;\n')
elif m=='N5': # Ö-5 \if koruması silindi
    sub(G, '\\if :{?owner}\n\\else', '\\if true\n\\else')
else: sys.exit('?')
