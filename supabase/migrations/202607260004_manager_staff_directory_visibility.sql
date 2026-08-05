drop policy if exists "Department managers can read department profiles"
on public.profiles;

create policy "Managers can read active staff directory"
on public.profiles for select
to authenticated
using (
  is_active = true
  and role = 'staff'
  and public.current_app_role() = 'staff'
  and public.current_authority_level() in (
    'junior_manager',
    'senior_manager',
    'director'
  )
);

comment on policy "Managers can read active staff directory" on public.profiles is
  'Allows staff managers/directors to see active staff profiles across departments for cross-department task handoffs. Assignment actions still validate that the assignee belongs to the task owning department.';
