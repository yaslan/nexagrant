-- crw-fb TASK-MUO12A7NHANOT fikstürleri (fe-fb İNCELEME-76 T2/T3 + T4 alansız)
INSERT INTO "Tenant"(id,name,slug,country,"updatedAt") VALUES
 ('o12a-t2','O12A T2 çok alanlı','o12a-t2','TR',now()),
 ('o12a-t3','O12A T3 silinmiş default','o12a-t3','TR',now()),
 ('o12a-t4','O12A T4 alansız','o12a-t4','TR',now());
INSERT INTO "Workspace"(id,"tenantId",name,slug,"createdAt","deletedAt") VALUES
 ('o12a-ws-a','o12a-t2','Alan A','ws-a','2026-01-01',NULL),
 ('o12a-ws-b','o12a-t2','Alan B','ws-b','2026-01-02',NULL),
 ('o12a-ws-def','o12a-t3','Eski varsayılan','default','2026-01-01','2026-06-01'),
 ('o12a-ws-yeni','o12a-t3','Yeni','yeni','2026-01-03',NULL),
 ('o12a-ws-gone','o12a-t4','Silinmiş tek alan','only','2026-01-01','2026-06-01');
INSERT INTO "User"(id,email,name,"updatedAt") VALUES
 ('o12a-owner','owner12a@o12a.test','Owner O12A',now()),
 ('o12a-restr','restr12a@o12a.test','Restr O12A',now()),
 ('o12a-del','del12a@o12a.test','Del O12A',now()),
 ('o12a-none','none12a@o12a.test','None O12A',now());
INSERT INTO "Membership"(id,"tenantId","userId",role,"workspaceIds") VALUES
 ('o12a-m1','o12a-t2','o12a-owner','TENANT_OWNER','{}'),
 ('o12a-m2','o12a-t2','o12a-restr','PIPELINE_MANAGER','{o12a-ws-b}'),
 ('o12a-m3','o12a-t3','o12a-del','TENANT_OWNER','{}'),
 ('o12a-m4','o12a-t4','o12a-none','TENANT_OWNER','{}');
