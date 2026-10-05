-- down koşmadıysa kolonlar yeni adlarında: hiçbir şeyin değişmediğini gösterir
SELECT (SELECT count(*) FROM "Feedback" WHERE id LIKE 'df-%' AND "alertStatus" = 'legacy') AS legacy_satir,
       (SELECT jsonb_array_length(meta->'rows') FROM "SystemAlert" WHERE id = 'feedback-migration-alert-columns') AS arsivdeki_satir,
       (SELECT count(*) FROM information_schema.columns WHERE table_name='Feedback' AND column_name='sentryEventId') AS eski_kolon;
