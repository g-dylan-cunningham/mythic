create or replace function public.current_org_department()
returns public.org_department
language sql
security definer
stable
set search_path = public
as $$
  select department
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

create or replace function public.current_authority_level()
returns public.authority_level
language sql
security definer
stable
set search_path = public
as $$
  select authority_level
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

create policy "Department managers can read department profiles"
on public.profiles for select
to authenticated
using (
  is_active = true
  and public.current_app_role() = 'staff'
  and public.current_authority_level() in (
    'junior_manager',
    'senior_manager',
    'director'
  )
  and (
    public.current_org_department() = 'operations'
    or department = public.current_org_department()
  )
);

comment on function public.current_org_department() is
  'Returns the active user department for RLS policies that need department-scoped visibility.';

comment on function public.current_authority_level() is
  'Returns the active user authority level for RLS policies that need manager/director-scoped visibility.';

comment on policy "Department managers can read department profiles" on public.profiles is
  'Allows department managers to see active profiles in their department so they can assign tasks to eligible employees. Operations managers/directors can see active profiles across departments.';
