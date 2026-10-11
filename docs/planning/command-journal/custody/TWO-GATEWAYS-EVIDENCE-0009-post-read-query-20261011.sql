BEGIN TRANSACTION READ ONLY;
SELECT 'clock' AS fact, now()::text AS value
UNION ALL SELECT 'migrations', (SELECT string_agg(id, ',' ORDER BY id) FROM schema_migrations)
UNION ALL SELECT '0009_applied_at', (SELECT applied_at::text FROM schema_migrations WHERE id = '0009_two_enrolled_gateways')
UNION ALL SELECT 'gateways', (SELECT count(*) || ' rows, ' || count(*) FILTER (WHERE is_currently_enrolled) || ' enrolled: ' || string_agg(left(gateway_id::text, 8) || '=' || coalesce(enrollment_slot::text, '-'), ',' ORDER BY gateway_id::text) FROM gateway_current_state)
UNION ALL SELECT 'indexes', (SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'gateway_current_state')
UNION ALL SELECT 'checks', (SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint WHERE conrelid = 'public.gateway_current_state'::regclass AND contype = 'c')
UNION ALL SELECT 'triggers', (SELECT coalesce(string_agg(tgname, ',' ORDER BY tgname), 'none') FROM pg_trigger WHERE tgrelid = 'public.gateway_current_state'::regclass AND NOT tgisinternal)
UNION ALL SELECT 'refusal_check_has_cap', (SELECT (pg_get_constraintdef(oid) LIKE '%enrollment_cap_reached%')::text FROM pg_constraint WHERE conrelid = 'public.gateway_enrollment_refusals'::regclass AND conname = 'gateway_enrollment_refusals_kind_check')
UNION ALL SELECT 'refusal_kinds', (SELECT coalesce(string_agg(kind || '=' || n, ',' ORDER BY kind), 'none') FROM (SELECT kind, count(*) AS n FROM gateway_enrollment_refusals GROUP BY kind) k)
UNION ALL SELECT 'owners', (SELECT string_agg(c.relname || '=' || pg_get_userbyid(c.relowner), ',' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('gateway_current_state', 'gateway_enrollment_refusals', 'gateway_current_state_one_gateway_per_slot'))
UNION ALL SELECT 'function_owner', (SELECT coalesce(string_agg(pg_get_userbyid(proowner), ','), 'none') FROM pg_proc WHERE proname = 'gateway_current_state_enrollment_slot_sync')
UNION ALL SELECT 'runtime_privs', (SELECT coalesce(string_agg(privilege_type || coalesce('(' || column_name || ')', ''), ',' ORDER BY privilege_type, column_name), 'none') FROM (SELECT privilege_type, NULL::text AS column_name FROM information_schema.role_table_grants WHERE grantee = 'br_app_runtime' AND table_schema = 'public' AND table_name = 'gateway_current_state' UNION ALL SELECT privilege_type, column_name FROM information_schema.column_privileges WHERE grantee = 'br_app_runtime' AND table_schema = 'public' AND table_name = 'gateway_current_state' AND privilege_type = 'UPDATE') p);
ROLLBACK;
