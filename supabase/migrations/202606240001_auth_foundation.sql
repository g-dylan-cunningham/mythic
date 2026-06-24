create type public.app_role as enum ('owner', 'admin', 'staff', 'customer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_seen integer not null default 0,
  records_upserted integer not null default 0,
  error_message text,
  error_code text,
  error_context jsonb not null default '{}'::jsonb,
  external_trace_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.api_raw_payloads (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  sync_run_id uuid references public.sync_runs(id) on delete set null,
  unique (source, source_entity_type, source_entity_id, fetched_at)
);

create index profiles_role_idx on public.profiles(role);
create index audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);
create index audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index sync_runs_source_started_at_idx on public.sync_runs(source, started_at desc);
create index api_raw_payloads_source_entity_idx
  on public.api_raw_payloads(source, source_entity_type, source_entity_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_runs enable row level security;
alter table public.api_raw_payloads enable row level security;

create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "Owners and admins can read profiles"
on public.profiles for select
to authenticated
using (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can update profiles"
on public.profiles for update
to authenticated
using (public.current_app_role() in ('owner', 'admin'))
with check (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can read audit logs"
on public.audit_logs for select
to authenticated
using (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can create audit logs"
on public.audit_logs for insert
to authenticated
with check (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can read sync runs"
on public.sync_runs for select
to authenticated
using (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can create sync runs"
on public.sync_runs for insert
to authenticated
with check (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can update sync runs"
on public.sync_runs for update
to authenticated
using (public.current_app_role() in ('owner', 'admin'))
with check (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can read raw payloads"
on public.api_raw_payloads for select
to authenticated
using (public.current_app_role() in ('owner', 'admin'));

create policy "Owners and admins can create raw payloads"
on public.api_raw_payloads for insert
to authenticated
with check (public.current_app_role() in ('owner', 'admin'));
