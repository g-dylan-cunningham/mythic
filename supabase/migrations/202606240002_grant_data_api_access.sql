grant usage on schema public to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update on public.sync_runs to authenticated;
grant select, insert on public.api_raw_payloads to authenticated;
