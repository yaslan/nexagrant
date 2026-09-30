INSERT INTO "ConceptTemplate"(id,"tenantId",key,name,version,schema) VALUES
 ('o12a-tpl-nolabel','o12a-t2','o12a_nolabel','O12A labelKey yok','1','{"sections":[{"key":"a","maxWords":100}]}'),
 ('o12a-tpl-numlabel','o12a-t2','o12a_numlabel','O12A labelKey sayi','1','{"sections":[{"key":"a","labelKey":7,"maxWords":100}]}'),
 ('o12a-tpl-null','o12a-t2','o12a_null','O12A null','1','[null]'),
 ('o12a-tpl-ok','o12a-t2','o12a_ok','O12A tamam','1','{"sections":[{"key":"a","labelKey":"Baslik A","maxWords":100}]}');
INSERT INTO "ConceptNote"(id,"tenantId","opportunityId","templateId",content,"createdBy","updatedAt") VALUES
 ('o12a-cn-nolabel','o12a-t2','cmuo1ul0s0003bixkvg87y3rb','o12a-tpl-nolabel','{"a":"<p>Govde nolabel</p>"}','o12a-owner',now()),
 ('o12a-cn-numlabel','o12a-t2','cmuo1ul0s0003bixkvg87y3rb','o12a-tpl-numlabel','{"a":"<p>Govde numlabel</p>"}','o12a-owner',now()),
 ('o12a-cn-null','o12a-t2','cmuo1ul0s0003bixkvg87y3rb','o12a-tpl-null','{}','o12a-owner',now()),
 ('o12a-cn-ok','o12a-t2','cmuo1ul0s0003bixkvg87y3rb','o12a-tpl-ok','{"a":"<p>Govde ok</p>"}','o12a-owner',now());
