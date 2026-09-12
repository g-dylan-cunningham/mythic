-- Production task status is the operational source of truth. Headline phase is
-- now derived by the application and is no longer stored or manually advanced.

drop table if exists public.workflow_transitions;

alter table public.production_jobs
drop column if exists current_phase_key,
drop column if exists current_phase_label_snapshot;

delete from public.workflow_steps
where step_type = 'phase';

delete from public.printavo_status_mappings
where trigger_type = 'suggest_phase';

alter table public.printavo_status_mappings
drop constraint if exists printavo_status_mappings_trigger_type_check,
drop column if exists target_phase_key;

alter table public.printavo_status_mappings
add constraint printavo_status_mappings_trigger_type_check
check (trigger_type in ('create_job', 'open_tasks', 'write_event'));

comment on table public.production_tasks is
  'Operational source of truth for production progress. Job headline phase is calculated from task and milestone statuses.';

