-- be-fb İNCELEME-96: yalnız izole befb96-pg; idempotent (ON CONFLICT / önce sil)
INSERT INTO "Opportunity"(id,"tenantId","workspaceId",title,stage,status,"updatedAt")
VALUES ('befb-long','demo-tenant','demo-workspace',
 'Uluslararasılaştırılamayanlardan Sürdürülebilirlikçiliklerimizdenmişsiniz — HORIZON-CL5-2027-D3-01-SUPERLONGTOPICIDENTIFIERWITHOUTANYBREAKPOINT_0123456789 https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/horizon-cl5-2027-d3-01',
 'G0','ACTIVE',now()),
 ('befb-empty','demo-tenant','demo-workspace','Boş durum fırsatı','G0','ACTIVE',now())
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title;
DELETE FROM "SystemAlert" WHERE source LIKE 'befb96.%';
INSERT INTO "SystemAlert"(id,level,source,message,meta,"createdAt")
SELECT 'befb96-'||g, (ARRAY['info','warn','error'])[1+g%3],
 'befb96.k1-embeddings-nightly-backfill-supercalifragilistic-source-without-spaces-'||g,
 'Uzun mesaj: https://api.example.test/v1/really/long/path/without/breaks/'||repeat('x',120)||' — ayrıca '||repeat('Sürdürülebilirlik ',6),
 jsonb_build_object('url','https://example.test/'||repeat('a',200),'code','ERR_'||repeat('Z',80),'n',g),
 now() - (g||' minutes')::interval
FROM generate_series(1,1500) g;
DELETE FROM "ApprovalRequest" WHERE id LIKE 'befb96-%';
INSERT INTO "ApprovalRequest"(id,"tenantId","workspaceId","actionType",title,description,payload,status,"requiredRole","requesterId","expiresAt","updatedAt")
SELECT 'befb96-'||g,'demo-tenant','demo-workspace','BUDGET_ALLOCATION',
 'Bütçe tahsisi onayı: Uluslararasılaştırılamayanlardanmışsınız '||repeat('W',90)||' #'||g,
 'Açıklama https://docs.example.test/'||repeat('b',150),
 '{"amount":123456789,"currency":"EUR"}'::jsonb,
 (ARRAY['PENDING','PENDING','APPROVED','REJECTED'])[1+g%4]::"ApprovalStatus",'TENANT_ADMIN','demo-user-superadmin', now()+interval '7 days', now()
FROM generate_series(1,24) g;
