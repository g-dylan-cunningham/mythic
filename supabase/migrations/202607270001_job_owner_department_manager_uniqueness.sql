create unique index if not exists production_job_owners_active_department_manager_unique_idx
  on public.production_job_owners(production_job_id, department, owner_role)
  where removed_at is null
    and owner_role = 'department_manager'
    and department is not null;

comment on index public.production_job_owners_active_department_manager_unique_idx is
  'Ensures only one active department_manager owner exists for a production job within a department.';
