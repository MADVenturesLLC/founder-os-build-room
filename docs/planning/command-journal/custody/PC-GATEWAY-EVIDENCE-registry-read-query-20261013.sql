BEGIN TRANSACTION READ ONLY;
SELECT 'clock' AS fact, now()::text AS value
UNION ALL SELECT 'role', current_user::text
UNION ALL SELECT 'events', (SELECT coalesce(string_agg(e.seq || ' ' || e.event_type || ' event_id=' || e.event_id || ' gateway=' || coalesce(left(e.gateway_id::text, 8), '-') || ' pairing=' || coalesce(left(e.pairing_id::text, 8), '-') || ' at=' || to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), ' | ' ORDER BY e.seq), 'none') FROM gateway_registry_events e WHERE e.pairing_id = 'c0a96b06-33e7-449d-9f1e-4249da5d5e1b' OR e.gateway_id = '1880c12d-d98d-4a91-b25a-23320aa7f58a')
UNION ALL SELECT 'enrolled_now', (SELECT coalesce(string_agg(left(gateway_id::text, 8) || '=slot' || enrollment_slot, ',' ORDER BY enrollment_slot), 'none') FROM gateway_current_state WHERE is_currently_enrolled);
ROLLBACK;
