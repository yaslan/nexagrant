-- süper kullanıcıyla okunur (RLS'e takılmaz)
SELECT (SELECT count(*) FROM "Feedback" WHERE id LIKE 'df-%' AND "sentryEventId" IS NOT NULL) AS geri_gelen_eventid,
       (SELECT count(*) FROM "Feedback" WHERE id LIKE 'df-%' AND "sentryStatus" IN ('sent','skipped','failed')) AS geri_gelen_status,
       (SELECT count(*) FROM "SystemAlert" WHERE id = 'feedback-migration-alert-columns') AS arsiv_satiri;
