-- cs-fb İNCELEME-83 fikstürleri (crw-fb T2/T3/T4 benzeri + saldırı ekleri)
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES
 ('o83-t2','O83 T2 çok alanlı','o83-t2','TR',now()),
 ('o83-t3','O83 T3 silinmiş default','o83-t3','TR',now()),
 ('o83-t4','O83 T4 alansız','o83-t4','TR',now()),
 ('o83-t5','O83 T5 kısıtlı-silinmişe','o83-t5','TR',now()),
 ('o83-t6','O83 T6 yabancı alan id','o83-t6','TR',now()),
 ('o83-t7','O83 T7 gerçek default + eski alan','o83-t7','TR',now()),
 ('o83-t8','O83 T8 ascii-dışı slug','o83-t8','TR',now());
INSERT INTO "Workspace"(id,"tenantId",name,slug,"createdAt","deletedAt") VALUES
 ('o83-ws-a','o83-t2','Alan A','ws-a','2026-01-01',NULL),
 ('o83-ws-b','o83-t2','Alan B','ws-b','2026-01-02',NULL),
 ('o83-ws-c','o83-t2','Alan C silinmiş','ws-c','2026-01-03','2026-06-01'),
 ('o83-ws-def','o83-t3','Eski varsayılan','default','2026-01-01','2026-06-01'),
 ('o83-ws-yeni','o83-t3','Yeni','yeni','2026-01-03',NULL),
 ('o83-ws-gone','o83-t4','Silinmiş tek alan','only','2026-01-01','2026-06-01'),
 ('o83-ws-t5a','o83-t5','Canlı','canli','2026-01-01',NULL),
 ('o83-ws-t5d','o83-t5','Silinmiş','silik','2026-01-02','2026-06-01'),
 ('o83-ws-t6','o83-t6','T6 kendi','kendi','2026-01-01',NULL),
 ('o83-ws-t7old','o83-t7','Eski','eski','2026-01-01',NULL),
 ('o83-ws-t7def','o83-t7','Gerçek default','default','2026-02-01',NULL),
 ('o83-ws-t8','o83-t8','Türkçe slug','çalışma alanı','2026-01-01',NULL);
INSERT INTO "User"(id,email,name,"updatedAt") VALUES
 ('o83-owner','owner83@o83.test','Owner O83',now()),
 ('o83-restr','restr83@o83.test','Restr O83',now()),
 ('o83-restrc','restrc83@o83.test','RestrC O83',now()),
 ('o83-del','del83@o83.test','Del O83',now()),
 ('o83-none','none83@o83.test','None O83',now()),
 ('o83-nomem','nomem83@o83.test','NoMembership O83',now()),
 ('o83-t5u','t5u83@o83.test','T5 restricted-to-deleted',now()),
 ('o83-t6u','t6u83@o83.test','T6 foreign ws id',now()),
 ('o83-t7u','t7u83@o83.test','T7 real default',now()),
 ('o83-t8u','t8u83@o83.test','T8 unicode slug',now());
INSERT INTO "Membership"(id,"tenantId","userId",role,"workspaceIds") VALUES
 ('o83-m1','o83-t2','o83-owner','TENANT_OWNER','{}'),
 ('o83-m2','o83-t2','o83-restr','PIPELINE_MANAGER','{o83-ws-b}'),
 ('o83-m2c','o83-t2','o83-restrc','PIPELINE_MANAGER','{o83-ws-c,o83-ws-b,nonexistent}'),
 ('o83-m3','o83-t3','o83-del','TENANT_OWNER','{}'),
 ('o83-m4','o83-t4','o83-none','TENANT_OWNER','{}'),
 ('o83-m5','o83-t5','o83-t5u','PIPELINE_MANAGER','{o83-ws-t5d}'),
 ('o83-m6','o83-t6','o83-t6u','PIPELINE_MANAGER','{o83-ws-a}'),
 ('o83-m7','o83-t7','o83-t7u','TENANT_OWNER','{}'),
 ('o83-m8','o83-t8','o83-t8u','TENANT_OWNER','{}');
