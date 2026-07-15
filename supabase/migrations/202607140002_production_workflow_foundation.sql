create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_categories_key_format_check
    check (key ~ '^[a-z0-9_]+$')
);

create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  product_category_id uuid not null references public.product_categories(id) on delete restrict,
  key text not null,
  name text not null,
  version integer not null,
  status text not null default 'draft',
  effective_at timestamptz,
  retired_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, version),
  constraint workflow_definitions_key_format_check
    check (key ~ '^[a-z0-9_]+$'),
  constraint workflow_definitions_version_check
    check (version > 0),
  constraint workflow_definitions_status_check
    check (status in ('draft', 'active', 'retired'))
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references public.workflow_definitions(id) on delete cascade,
  key text not null,
  label text not null,
  step_type text not null,
  track text not null,
  sort_order integer not null,
  is_required boolean not null default true,
  is_active boolean not null default true,
  default_assigned_role public.app_role,
  suggested_prompt text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workflow_definition_id, key),
  constraint workflow_steps_key_format_check
    check (key ~ '^[a-z0-9_.]+$'),
  constraint workflow_steps_step_type_check
    check (step_type in ('phase', 'task', 'milestone')),
  constraint workflow_steps_track_format_check
    check (track ~ '^[a-z0-9_]+$')
);

create table public.workflow_dependencies (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references public.workflow_definitions(id) on delete cascade,
  step_key text not null,
  depends_on_step_key text not null,
  dependency_type text not null,
  created_at timestamptz not null default now(),
  unique (
    workflow_definition_id,
    step_key,
    depends_on_step_key,
    dependency_type
  ),
  constraint workflow_dependencies_not_self_check
    check (step_key <> depends_on_step_key),
  constraint workflow_dependencies_type_check
    check (dependency_type in ('required_before_start', 'required_before_complete'))
);

create table public.workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references public.workflow_definitions(id) on delete cascade,
  from_step_key text,
  to_step_key text not null,
  direction text not null default 'forward',
  allowed_roles public.app_role[] not null default '{}'::public.app_role[],
  requires_reason boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (workflow_definition_id, from_step_key, to_step_key, direction),
  constraint workflow_transitions_direction_check
    check (direction in ('forward', 'backward'))
);

create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  printavo_order_id bigint not null unique,
  printavo_order_number text,
  printavo_status_id bigint,
  printavo_status_name text,
  printavo_paid_at timestamptz,
  product_category_id uuid not null references public.product_categories(id) on delete restrict,
  workflow_definition_id uuid not null references public.workflow_definitions(id) on delete restrict,
  workflow_version integer not null,
  current_phase_key text not null,
  current_phase_label_snapshot text not null,
  customer_name text,
  job_name text not null,
  due_date date,
  priority text not null default 'normal',
  blocked_reason text,
  assigned_lead_id uuid references auth.users(id) on delete set null,
  difficulty_score integer,
  estimated_minutes integer,
  setup_minutes integer,
  run_minutes integer,
  finishing_minutes integer,
  estimate_confidence text,
  estimate_note text,
  last_printavo_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_jobs_workflow_version_check
    check (workflow_version > 0),
  constraint production_jobs_priority_check
    check (priority in ('low', 'normal', 'high', 'rush')),
  constraint production_jobs_difficulty_score_check
    check (difficulty_score is null or difficulty_score between 1 and 5),
  constraint production_jobs_nonnegative_estimates_check
    check (
      (estimated_minutes is null or estimated_minutes >= 0)
      and (setup_minutes is null or setup_minutes >= 0)
      and (run_minutes is null or run_minutes >= 0)
      and (finishing_minutes is null or finishing_minutes >= 0)
    ),
  constraint production_jobs_estimate_confidence_check
    check (estimate_confidence is null or estimate_confidence in ('low', 'medium', 'high'))
);

create table public.production_tasks (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  workflow_step_key text not null,
  workflow_version integer not null,
  label_snapshot text not null,
  track_snapshot text not null,
  status text not null default 'open',
  assigned_role public.app_role,
  assigned_user_id uuid references auth.users(id) on delete set null,
  blocked_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (production_job_id, workflow_step_key),
  constraint production_tasks_workflow_version_check
    check (workflow_version > 0),
  constraint production_tasks_status_check
    check (status in ('open', 'in_progress', 'blocked', 'complete', 'cancelled', 'skipped')),
  constraint production_tasks_completion_check
    check (
      (status = 'complete' and completed_at is not null)
      or status <> 'complete'
    )
);

create table public.production_job_events (
  id uuid primary key default gen_random_uuid(),
  production_job_id uuid not null references public.production_jobs(id) on delete cascade,
  production_task_id uuid references public.production_tasks(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  source text not null default 'manual',
  from_state_key text,
  from_state_label_snapshot text,
  to_state_key text,
  to_state_label_snapshot text,
  workflow_definition_id uuid references public.workflow_definitions(id) on delete set null,
  workflow_version integer,
  reason text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint production_job_events_source_check
    check (source in ('manual', 'system', 'printavo_sync', 'zapier_webhook', 'admin_override')),
  constraint production_job_events_workflow_version_check
    check (workflow_version is null or workflow_version > 0)
);

create table public.printavo_status_mappings (
  id uuid primary key default gen_random_uuid(),
  printavo_status_id bigint not null,
  printavo_status_name_snapshot text not null,
  workflow_definition_id uuid references public.workflow_definitions(id) on delete cascade,
  trigger_type text not null,
  target_phase_key text,
  target_task_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (printavo_status_id, workflow_definition_id, trigger_type),
  constraint printavo_status_mappings_trigger_type_check
    check (trigger_type in ('create_job', 'open_tasks', 'suggest_phase', 'write_event'))
);

create index product_categories_active_idx on public.product_categories(is_active);
create index workflow_definitions_category_status_idx
  on public.workflow_definitions(product_category_id, status);
create index workflow_steps_definition_track_idx
  on public.workflow_steps(workflow_definition_id, track, sort_order);
create index workflow_dependencies_definition_step_idx
  on public.workflow_dependencies(workflow_definition_id, step_key);
create index production_jobs_current_phase_idx on public.production_jobs(current_phase_key);
create index production_jobs_due_date_idx on public.production_jobs(due_date);
create index production_jobs_assigned_lead_idx on public.production_jobs(assigned_lead_id);
create index production_tasks_job_status_idx on public.production_tasks(production_job_id, status);
create index production_tasks_assigned_user_idx on public.production_tasks(assigned_user_id);
create index production_tasks_track_status_idx on public.production_tasks(track_snapshot, status);
create index production_job_events_job_created_idx
  on public.production_job_events(production_job_id, created_at desc);
create index printavo_status_mappings_active_idx
  on public.printavo_status_mappings(printavo_status_id, is_active);

create trigger product_categories_set_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

create trigger workflow_definitions_set_updated_at
before update on public.workflow_definitions
for each row execute function public.set_updated_at();

create trigger workflow_steps_set_updated_at
before update on public.workflow_steps
for each row execute function public.set_updated_at();

create trigger production_jobs_set_updated_at
before update on public.production_jobs
for each row execute function public.set_updated_at();

create trigger production_tasks_set_updated_at
before update on public.production_tasks
for each row execute function public.set_updated_at();

create trigger printavo_status_mappings_set_updated_at
before update on public.printavo_status_mappings
for each row execute function public.set_updated_at();

alter table public.product_categories enable row level security;
alter table public.workflow_definitions enable row level security;
alter table public.workflow_steps enable row level security;
alter table public.workflow_dependencies enable row level security;
alter table public.workflow_transitions enable row level security;
alter table public.production_jobs enable row level security;
alter table public.production_tasks enable row level security;
alter table public.production_job_events enable row level security;
alter table public.printavo_status_mappings enable row level security;

create policy "Operations users can read product categories"
on public.product_categories for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners and admins can manage product categories"
on public.product_categories for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'))
with check (public.current_app_role()::text in ('owner', 'admin'));

create policy "Operations users can read workflow definitions"
on public.workflow_definitions for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners and admins can manage workflow definitions"
on public.workflow_definitions for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'))
with check (public.current_app_role()::text in ('owner', 'admin'));

create policy "Operations users can read workflow steps"
on public.workflow_steps for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners and admins can manage workflow steps"
on public.workflow_steps for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'))
with check (public.current_app_role()::text in ('owner', 'admin'));

create policy "Operations users can read workflow dependencies"
on public.workflow_dependencies for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners and admins can manage workflow dependencies"
on public.workflow_dependencies for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'))
with check (public.current_app_role()::text in ('owner', 'admin'));

create policy "Operations users can read workflow transitions"
on public.workflow_transitions for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners and admins can manage workflow transitions"
on public.workflow_transitions for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'))
with check (public.current_app_role()::text in ('owner', 'admin'));

create policy "Operations users can read production jobs"
on public.production_jobs for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners admins and leads can manage production jobs"
on public.production_jobs for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'production_lead'))
with check (public.current_app_role()::text in ('owner', 'admin', 'production_lead'));

create policy "Operations users can read production tasks"
on public.production_tasks for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners admins and leads can manage production tasks"
on public.production_tasks for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'production_lead'))
with check (public.current_app_role()::text in ('owner', 'admin', 'production_lead'));

create policy "Workers can update assigned production tasks"
on public.production_tasks for update
to authenticated
using (
  public.current_app_role()::text = 'production_worker'
  and assigned_user_id = auth.uid()
)
with check (
  public.current_app_role()::text = 'production_worker'
  and assigned_user_id = auth.uid()
);

create policy "Operations users can read production job events"
on public.production_job_events for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin', 'staff', 'production_lead', 'production_worker'));

create policy "Owners admins and leads can create production job events"
on public.production_job_events for insert
to authenticated
with check (public.current_app_role()::text in ('owner', 'admin', 'production_lead'));

create policy "Workers can create assigned task events"
on public.production_job_events for insert
to authenticated
with check (
  public.current_app_role()::text = 'production_worker'
  and actor_user_id = auth.uid()
);

create policy "Owners and admins can read printavo status mappings"
on public.printavo_status_mappings for select
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'));

create policy "Owners and admins can manage printavo status mappings"
on public.printavo_status_mappings for all
to authenticated
using (public.current_app_role()::text in ('owner', 'admin'))
with check (public.current_app_role()::text in ('owner', 'admin'));

grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.workflow_definitions to authenticated;
grant select, insert, update, delete on public.workflow_steps to authenticated;
grant select, insert, update, delete on public.workflow_dependencies to authenticated;
grant select, insert, update, delete on public.workflow_transitions to authenticated;
grant select, insert, update, delete on public.production_jobs to authenticated;
grant select, insert, update, delete on public.production_tasks to authenticated;
grant select, insert on public.production_job_events to authenticated;
grant select, insert, update, delete on public.printavo_status_mappings to authenticated;

insert into public.product_categories (key, name)
values ('screen_printing', 'Screen Printing')
on conflict (key) do update
set
  name = excluded.name,
  is_active = true;

with screen_printing as (
  select id from public.product_categories where key = 'screen_printing'
)
insert into public.workflow_definitions (
  product_category_id,
  key,
  name,
  version,
  status,
  effective_at
)
select
  screen_printing.id,
  'screen_printing',
  'Screen Printing',
  1,
  'active',
  now()
from screen_printing
on conflict (key, version) do update
set
  product_category_id = excluded.product_category_id,
  name = excluded.name,
  status = excluded.status,
  effective_at = coalesce(public.workflow_definitions.effective_at, excluded.effective_at),
  retired_at = null;

with workflow as (
  select id from public.workflow_definitions where key = 'screen_printing' and version = 1
)
insert into public.workflow_steps (
  workflow_definition_id,
  key,
  label,
  step_type,
  track,
  sort_order,
  is_required,
  default_assigned_role,
  suggested_prompt
)
select
  workflow.id,
  step.key,
  step.label,
  step.step_type,
  step.track,
  step.sort_order,
  step.is_required,
  step.default_assigned_role::public.app_role,
  step.suggested_prompt
from workflow
cross join (
  values
    ('phase.needs_sourcing', 'Needs sourcing', 'phase', 'job', 10, true, 'production_lead', null),
    ('phase.awaiting_goods', 'Awaiting goods', 'phase', 'job', 20, true, 'production_lead', null),
    ('phase.goods_received', 'Goods received', 'phase', 'job', 30, true, 'production_lead', null),
    ('phase.ready_for_production', 'Ready for production', 'phase', 'job', 40, true, 'production_lead', 'All production prerequisites look complete. Move to Ready For Production?'),
    ('phase.scheduled', 'Scheduled', 'phase', 'job', 50, true, 'production_lead', 'Press and day assigned. Mark job scheduled?'),
    ('phase.in_production', 'In production', 'phase', 'job', 60, true, 'production_worker', 'Production work has started. Mark job In Production?'),
    ('phase.finishing_qc', 'Finishing / QC', 'phase', 'job', 70, true, 'production_worker', 'Run is complete. Move to finishing/QC?'),
    ('phase.production_complete', 'Production complete', 'phase', 'job', 80, true, 'production_lead', 'All production tasks are complete. Mark production complete?'),
    ('art.confirm_artwork_needed', 'Confirm artwork needed', 'task', 'artwork', 100, true, 'production_lead', null),
    ('art.create_revise_artwork', 'Create / revise artwork', 'task', 'artwork', 110, true, 'staff', null),
    ('art.send_artwork_approval', 'Send artwork approval', 'task', 'artwork', 120, true, 'staff', null),
    ('art.artwork_approved', 'Artwork approved', 'milestone', 'artwork', 130, true, 'production_lead', 'Artwork is approved. Move screen prep to ready?'),
    ('art.ready_to_burn_screens', 'Ready to burn screens', 'milestone', 'artwork', 140, true, 'production_lead', null),
    ('apparel.confirm_garment_requirements', 'Confirm garment requirements', 'task', 'apparel', 200, true, 'staff', null),
    ('apparel.build_supplier_cart', 'Build supplier cart', 'task', 'apparel', 210, true, 'staff', null),
    ('apparel.order_apparel', 'Order apparel', 'task', 'apparel', 220, true, 'staff', 'Apparel appears ordered. Move job to awaiting goods?'),
    ('apparel.apparel_shipped', 'Apparel shipped', 'task', 'apparel', 230, true, 'staff', 'Blank apparel appears shipped. Start receiving watch?'),
    ('apparel.apparel_received', 'Apparel received', 'milestone', 'apparel', 240, true, 'staff', 'Blank apparel has been received. Release goods for production?'),
    ('prep.burn_screens', 'Burn screens', 'task', 'production_prep', 300, true, 'production_worker', null),
    ('prep.confirm_print_locations', 'Confirm print locations', 'task', 'production_prep', 310, true, 'production_lead', null),
    ('prep.confirm_ink_color_count', 'Confirm ink / color count', 'task', 'production_prep', 320, true, 'production_lead', null),
    ('prep.confirm_garment_handling', 'Confirm garment material / handling', 'task', 'production_prep', 330, true, 'production_lead', null),
    ('prep.confirm_finishing_requirements', 'Confirm finishing requirements', 'task', 'production_prep', 340, true, 'production_lead', null),
    ('prep.estimate_difficulty_time', 'Estimate difficulty / time', 'task', 'production_prep', 350, true, 'production_lead', null),
    ('prep.assign_press_day', 'Assign press / day', 'task', 'production_prep', 360, true, 'production_lead', 'Press and day assigned. Mark job scheduled?'),
    ('production.ready_for_production', 'Ready for production', 'milestone', 'production', 400, true, 'production_lead', 'All production prerequisites look complete. Move to Ready For Production?'),
    ('production.in_production', 'In production', 'task', 'production', 410, true, 'production_worker', 'Production work has started. Mark job In Production?'),
    ('production.finishing_qc', 'Finishing / QC', 'task', 'production', 420, true, 'production_worker', 'Run is complete. Move to finishing/QC?'),
    ('production.production_complete', 'Production complete', 'milestone', 'production', 430, true, 'production_lead', 'All production tasks are complete. Mark production complete?'),
    ('fulfillment.ready_inventory', 'Fulfillment: readyInventory', 'task', 'customer_fulfillment', 500, true, 'staff', 'Printed goods are ready. Mark fulfillment readyInventory?'),
    ('fulfillment.shipped_picked_up', 'Fulfillment: shipped / picked up', 'task', 'customer_fulfillment', 510, true, 'staff', 'Order has shipped or been picked up. Mark customer fulfillment shipped?'),
    ('fulfillment.received_by_customer', 'Fulfillment: received by customer', 'milestone', 'customer_fulfillment', 520, true, 'staff', 'Customer has received the order. Mark fulfillment received?')
) as step(
  key,
  label,
  step_type,
  track,
  sort_order,
  is_required,
  default_assigned_role,
  suggested_prompt
)
on conflict (workflow_definition_id, key) do update
set
  label = excluded.label,
  step_type = excluded.step_type,
  track = excluded.track,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required,
  default_assigned_role = excluded.default_assigned_role,
  suggested_prompt = excluded.suggested_prompt,
  is_active = true;

with workflow as (
  select id from public.workflow_definitions where key = 'screen_printing' and version = 1
)
insert into public.workflow_dependencies (
  workflow_definition_id,
  step_key,
  depends_on_step_key,
  dependency_type
)
select
  workflow.id,
  dep.step_key,
  dep.depends_on_step_key,
  dep.dependency_type
from workflow
cross join (
  values
    ('art.create_revise_artwork', 'art.confirm_artwork_needed', 'required_before_start'),
    ('art.send_artwork_approval', 'art.create_revise_artwork', 'required_before_start'),
    ('art.artwork_approved', 'art.send_artwork_approval', 'required_before_complete'),
    ('art.ready_to_burn_screens', 'art.artwork_approved', 'required_before_complete'),
    ('apparel.build_supplier_cart', 'apparel.confirm_garment_requirements', 'required_before_start'),
    ('apparel.order_apparel', 'apparel.build_supplier_cart', 'required_before_start'),
    ('apparel.apparel_shipped', 'apparel.order_apparel', 'required_before_start'),
    ('apparel.apparel_received', 'apparel.apparel_shipped', 'required_before_complete'),
    ('prep.burn_screens', 'art.ready_to_burn_screens', 'required_before_start'),
    ('prep.assign_press_day', 'prep.burn_screens', 'required_before_complete'),
    ('prep.assign_press_day', 'apparel.apparel_received', 'required_before_complete'),
    ('prep.assign_press_day', 'prep.estimate_difficulty_time', 'required_before_complete'),
    ('production.ready_for_production', 'apparel.apparel_received', 'required_before_complete'),
    ('production.ready_for_production', 'art.artwork_approved', 'required_before_complete'),
    ('production.ready_for_production', 'prep.burn_screens', 'required_before_complete'),
    ('production.ready_for_production', 'prep.confirm_print_locations', 'required_before_complete'),
    ('production.ready_for_production', 'prep.confirm_ink_color_count', 'required_before_complete'),
    ('production.ready_for_production', 'prep.confirm_garment_handling', 'required_before_complete'),
    ('production.ready_for_production', 'prep.confirm_finishing_requirements', 'required_before_complete'),
    ('production.ready_for_production', 'prep.estimate_difficulty_time', 'required_before_complete'),
    ('production.ready_for_production', 'prep.assign_press_day', 'required_before_complete'),
    ('production.in_production', 'production.ready_for_production', 'required_before_start'),
    ('production.finishing_qc', 'production.in_production', 'required_before_start'),
    ('production.production_complete', 'production.finishing_qc', 'required_before_complete'),
    ('fulfillment.ready_inventory', 'production.production_complete', 'required_before_start'),
    ('fulfillment.shipped_picked_up', 'fulfillment.ready_inventory', 'required_before_start'),
    ('fulfillment.received_by_customer', 'fulfillment.shipped_picked_up', 'required_before_complete')
) as dep(step_key, depends_on_step_key, dependency_type)
on conflict (
  workflow_definition_id,
  step_key,
  depends_on_step_key,
  dependency_type
) do nothing;

with workflow as (
  select id from public.workflow_definitions where key = 'screen_printing' and version = 1
)
insert into public.workflow_transitions (
  workflow_definition_id,
  from_step_key,
  to_step_key,
  direction,
  allowed_roles,
  requires_reason
)
select
  workflow.id,
  transition.from_step_key,
  transition.to_step_key,
  transition.direction,
  transition.allowed_roles::public.app_role[],
  transition.requires_reason
from workflow
cross join (
  values
    (null, 'phase.needs_sourcing', 'forward', array['owner', 'admin', 'production_lead'], false),
    ('phase.needs_sourcing', 'phase.awaiting_goods', 'forward', array['owner', 'admin', 'production_lead'], false),
    ('phase.awaiting_goods', 'phase.goods_received', 'forward', array['owner', 'admin', 'production_lead'], false),
    ('phase.goods_received', 'phase.ready_for_production', 'forward', array['owner', 'admin', 'production_lead'], false),
    ('phase.ready_for_production', 'phase.scheduled', 'forward', array['owner', 'admin', 'production_lead'], false),
    ('phase.scheduled', 'phase.in_production', 'forward', array['owner', 'admin', 'production_lead', 'production_worker'], false),
    ('phase.in_production', 'phase.finishing_qc', 'forward', array['owner', 'admin', 'production_lead', 'production_worker'], false),
    ('phase.finishing_qc', 'phase.production_complete', 'forward', array['owner', 'admin', 'production_lead'], false),
    ('phase.scheduled', 'phase.ready_for_production', 'backward', array['owner', 'admin', 'production_lead'], true),
    ('phase.in_production', 'phase.scheduled', 'backward', array['owner', 'admin', 'production_lead'], true),
    ('phase.production_complete', 'phase.finishing_qc', 'backward', array['owner', 'admin'], true)
) as transition(from_step_key, to_step_key, direction, allowed_roles, requires_reason)
on conflict (workflow_definition_id, from_step_key, to_step_key, direction) do update
set
  allowed_roles = excluded.allowed_roles,
  requires_reason = excluded.requires_reason,
  is_active = true;

with workflow as (
  select id from public.workflow_definitions where key = 'screen_printing' and version = 1
)
insert into public.printavo_status_mappings (
  printavo_status_id,
  printavo_status_name_snapshot,
  workflow_definition_id,
  trigger_type,
  target_phase_key,
  target_task_key
)
select
  mapping.printavo_status_id,
  mapping.printavo_status_name_snapshot,
  workflow.id,
  mapping.trigger_type,
  mapping.target_phase_key,
  mapping.target_task_key
from workflow
cross join (
  values
    (120802, 'Schedule & Order Garments ', 'open_tasks', 'phase.needs_sourcing', 'apparel.confirm_garment_requirements'),
    (37024, 'Ready For Production', 'suggest_phase', 'phase.ready_for_production', 'production.ready_for_production'),
    (492558, 'In Production', 'suggest_phase', 'phase.in_production', 'production.in_production'),
    (533873, 'Production Complete - Fulfillment Ready', 'suggest_phase', 'phase.production_complete', 'production.production_complete')
) as mapping(
  printavo_status_id,
  printavo_status_name_snapshot,
  trigger_type,
  target_phase_key,
  target_task_key
)
on conflict (printavo_status_id, workflow_definition_id, trigger_type) do update
set
  printavo_status_name_snapshot = excluded.printavo_status_name_snapshot,
  target_phase_key = excluded.target_phase_key,
  target_task_key = excluded.target_task_key,
  is_active = true;
