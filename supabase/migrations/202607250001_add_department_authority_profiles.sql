create type public.org_department as enum (
  'sales',
  'design',
  'production',
  'logistics',
  'operations'
);

create type public.authority_level as enum (
  'junior_employee',
  'senior_employee',
  'junior_manager',
  'senior_manager',
  'director'
);

alter table public.profiles
add column department public.org_department,
add column authority_level public.authority_level not null default 'junior_employee';

create index profiles_department_idx on public.profiles(department);
create index profiles_authority_level_idx on public.profiles(authority_level);
create index profiles_department_authority_idx
  on public.profiles(department, authority_level);

comment on column public.profiles.department is
  'Primary organization department for queue routing and default visibility.';

comment on column public.profiles.authority_level is
  'Department authority band used with department to derive queue visibility, assignment, and control entitlements.';
