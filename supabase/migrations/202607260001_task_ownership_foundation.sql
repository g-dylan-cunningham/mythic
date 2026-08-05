create type public.production_task_collaborator_role as enum (
  'watcher',
  'contributor',
  'reviewer',
  'manager_observer'
);

create type public.production_task_comment_type as enum (
  'comment',
  'blocker',
  'resolution',
  'handoff',
  'completion_note',
  'internal_note',
  'assignment_note'
);

create type public.production_job_owner_role as enum (
  'account_owner',
  'department_manager',
  'production_coordinator',
  'escalation_owner',
  'watcher'
);

alter table public.workflow_steps
add column default_department public.org_department;

alter table public.production_tasks
add column owning_department public.org_department,
add column assigned_by_user_id uuid references auth.users(id) on delete set null,
add column assigned_at timestamptz;

create table public.production_task_collaborators (
  id uuid primary key default gen_random_uuid(),
  production_task_id uuid not null references public.production_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  collaborator_role public.production_task_collaborator_role not null,
  added_by_user_id uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint production_task_collaborators_removed_check
    check (removed_at is null or removed_at >= added_at)
);

create table public.production_task_comments (
  id uuid primary key default gen_random_uuid(),
  production_task_id uuid not null references public.production_tasks(id) on delete cascade,
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  comment_type public.production_task_comment_type not null default 'comment',
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint production_task_comments_body_not_blank_check
    check (length(btrim(body)) > 0),
  constraint production_task_comments_deleted_after_created_check
    check (deleted_at is null or deleted_at >= created_at),
  constraint production_task_comments_edited_after_created_check
    check (edited_at is null or edited_at >= created_at)
);

create table public.production_job_owners (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  department public.org_department,
  owner_role public.production_job_owner_role not null,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint production_job_owners_removed_check
    check (removed_at is null or removed_at >= assigned_at)
);

create index workflow_steps_default_department_idx
  on public.workflow_steps(default_department);
create index production_tasks_owning_department_status_idx
  on public.production_tasks(owning_department, status);
create index production_tasks_assigned_by_idx
  on public.production_tasks(assigned_by_user_id);
create index production_task_collaborators_task_idx
  on public.production_task_collaborators(production_task_id);
create index production_task_collaborators_user_idx
  on public.production_task_collaborators(user_id);
create unique index production_task_collaborators_active_unique_idx
  on public.production_task_collaborators(production_task_id, user_id, collaborator_role)
  where removed_at is null;
create index production_task_comments_task_created_idx
  on public.production_task_comments(production_task_id, created_at desc);
create index production_task_comments_job_created_idx
  on public.production_task_comments(production_job_id, created_at desc);
create index production_task_comments_author_idx
  on public.production_task_comments(author_user_id);
create index production_job_owners_job_idx
  on public.production_job_owners(production_job_id);
create index production_job_owners_user_idx
  on public.production_job_owners(user_id);
create index production_job_owners_department_role_idx
  on public.production_job_owners(department, owner_role);
create unique index production_job_owners_active_unique_idx
  on public.production_job_owners(production_job_id, user_id, owner_role)
  where removed_at is null;

create trigger production_task_comments_set_updated_at
before update on public.production_task_comments
for each row execute function public.set_updated_at();

alter table public.production_task_collaborators enable row level security;
alter table public.production_task_comments enable row level security;
alter table public.production_job_owners enable row level security;

create policy "Operations users can read production task collaborators"
on public.production_task_collaborators for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can manage production task collaborators"
on public.production_task_collaborators for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'))
with check (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Operations users can read production task comments"
on public.production_task_comments for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can manage production task comments"
on public.production_task_comments for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'))
with check (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Operations users can read production job owners"
on public.production_job_owners for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'));

create policy "Internal users can manage production job owners"
on public.production_job_owners for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff'))
with check (public.current_app_role()::text in ('owner', 'admin', 'staff'));

grant select, insert, update, delete on public.production_task_collaborators to authenticated;
grant select, insert, update, delete on public.production_task_comments to authenticated;
grant select, insert, update, delete on public.production_job_owners to authenticated;

comment on type public.production_task_collaborator_role is
  'Task participation role. watcher sees status, contributor helps perform work, reviewer checks or approves work, manager_observer follows work for management visibility outside normal inferred department visibility.';

comment on type public.production_task_comment_type is
  'Task comment category. Comments carry human context while production_job_events carries the structured audit trail.';

comment on type public.production_job_owner_role is
  'Job-level accountability role. account_owner shepherds customer/account context, department_manager owns department planning, production_coordinator coordinates production execution, escalation_owner handles stuck/high-risk jobs, watcher follows the job without direct action responsibility.';

comment on column public.workflow_steps.default_department is
  'Default department that owns new tasks generated from this workflow step. This is workflow configuration for future jobs.';

comment on column public.production_tasks.owning_department is
  'Current department responsible for this specific task. Defaults from workflow_steps.default_department and may be overridden per job/task.';

comment on column public.production_tasks.assigned_user_id is
  'Primary assignee currently responsible for performing this task.';

comment on column public.production_tasks.assigned_by_user_id is
  'User who last assigned or reassigned the primary task assignee.';

comment on column public.production_tasks.assigned_at is
  'Timestamp when the current primary task assignment was made.';

comment on column public.production_tasks.completed_by is
  'User who completed the task. Kept as the completion actor field for task audit and timeline displays.';

comment on table public.production_task_collaborators is
  'People attached to a production task beyond the primary assignee. Use for watchers, contributors, reviewers, and explicit manager observers.';

comment on column public.production_task_collaborators.collaborator_role is
  'watcher = visibility only; contributor = helps do the work; reviewer = checks/approves work; manager_observer = manager visibility on a specific task.';

comment on table public.production_task_comments is
  'Human task discussion and notes. Important assignment, blocker, handoff, completion, and internal context should also be mirrored with structured production_job_events where appropriate.';

comment on table public.production_job_owners is
  'Flexible job-level ownership and accountability. This supports future job assignment, manager workload splitting, coordination, escalation, and watcher use cases without forcing every task to be assigned immediately.';

comment on column public.production_job_owners.owner_role is
  'account_owner = customer/account shepherd; department_manager = department planning owner; production_coordinator = execution coordinator; escalation_owner = stuck/high-risk owner; watcher = visibility only.';

update public.workflow_steps
set default_department = case
  when key in (
    'art.confirm_artwork_needed',
    'art.send_artwork_approval',
    'art.artwork_approved',
    'apparel.confirm_garment_requirements',
    'apparel.approve_cart',
    'fulfillment.received_by_customer'
  ) then 'sales'::public.org_department
  when key in (
    'art.create_revise_artwork'
  ) then 'design'::public.org_department
  when key in (
    'apparel.build_supplier_cart',
    'apparel.order_apparel',
    'apparel.apparel_shipped',
    'apparel.apparel_received',
    'fulfillment.ready_inventory',
    'fulfillment.shipped_picked_up'
  ) then 'logistics'::public.org_department
  when key in (
    'art.ready_to_burn_screens',
    'prep.burn_screens',
    'prep.confirm_print_locations',
    'prep.confirm_ink_color_count',
    'prep.confirm_garment_handling',
    'prep.confirm_finishing_requirements',
    'prep.estimate_difficulty_time',
    'prep.assign_press_day',
    'production.ready_for_production',
    'production.in_production',
    'production.finishing_qc',
    'production.production_complete'
  ) then 'production'::public.org_department
  else default_department
end
where step_type in ('task', 'milestone');

update public.production_tasks
set owning_department = workflow_steps.default_department
from public.workflow_steps
where production_tasks.workflow_step_id = workflow_steps.id
  and production_tasks.owning_department is null;

update public.production_tasks
set owning_department = case
  when track_snapshot = 'artwork' then 'design'::public.org_department
  when track_snapshot = 'apparel' then 'logistics'::public.org_department
  when track_snapshot in ('production_prep', 'production') then 'production'::public.org_department
  when track_snapshot = 'customer_fulfillment' then 'logistics'::public.org_department
  else owning_department
end
where owning_department is null;
