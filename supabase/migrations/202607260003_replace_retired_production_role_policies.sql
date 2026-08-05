drop policy if exists "Operations users can read production jobs"
on public.production_jobs;
drop policy if exists "Owners admins and leads can manage production jobs"
on public.production_jobs;

drop policy if exists "Operations users can read production tasks"
on public.production_tasks;
drop policy if exists "Owners admins and leads can manage production tasks"
on public.production_tasks;
drop policy if exists "Workers can update assigned production tasks"
on public.production_tasks;

drop policy if exists "Operations users can read production job events"
on public.production_job_events;
drop policy if exists "Owners admins and leads can create production job events"
on public.production_job_events;
drop policy if exists "Workers can create assigned task events"
on public.production_job_events;

create policy "Internal users can read production jobs"
on public.production_jobs for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can manage production jobs"
on public.production_jobs for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'))
with check (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can read production tasks"
on public.production_tasks for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can manage production tasks"
on public.production_tasks for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'))
with check (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can read production job events"
on public.production_job_events for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can create production job events"
on public.production_job_events for insert
to authenticated
with check (public.current_app_role()::text in ('owner', 'admin', 'staff'));

comment on policy "Internal users can manage production tasks" on public.production_tasks is
  'POC policy after retiring production_lead and production_worker app roles. Fine-grained manager/department checks are handled in server actions until RLS is further refined.';
