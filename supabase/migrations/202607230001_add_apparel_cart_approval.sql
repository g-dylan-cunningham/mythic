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
  'apparel.approve_cart',
  'Approve cart',
  'task',
  'apparel',
  220,
  true,
  'production_lead'::public.app_role,
  'Supplier cart is ready. Approve apparel cart for ordering?'
from workflow
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
update public.workflow_steps
set sort_order = case key
  when 'apparel.confirm_garment_requirements' then 200
  when 'apparel.build_supplier_cart' then 210
  when 'apparel.approve_cart' then 220
  when 'apparel.order_apparel' then 230
  when 'apparel.apparel_shipped' then 240
  when 'apparel.apparel_received' then 250
  else sort_order
end
from workflow
where workflow_steps.workflow_definition_id = workflow.id
  and workflow_steps.key in (
    'apparel.confirm_garment_requirements',
    'apparel.build_supplier_cart',
    'apparel.approve_cart',
    'apparel.order_apparel',
    'apparel.apparel_shipped',
    'apparel.apparel_received'
  );

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
    ('apparel.approve_cart', 'apparel.build_supplier_cart', 'required_before_complete'),
    ('apparel.order_apparel', 'apparel.approve_cart', 'required_before_start')
) as dep(step_key, depends_on_step_key, dependency_type)
on conflict (
  workflow_definition_id,
  step_key,
  depends_on_step_key,
  dependency_type
) do nothing;

with workflow as (
  select id from public.workflow_definitions where key = 'screen_printing' and version = 1
),
obsolete_dependency as (
  delete from public.workflow_dependencies
  using workflow
  where workflow_dependencies.workflow_definition_id = workflow.id
    and workflow_dependencies.step_key = 'apparel.order_apparel'
    and workflow_dependencies.depends_on_step_key = 'apparel.build_supplier_cart'
    and workflow_dependencies.dependency_type = 'required_before_start'
)
insert into public.production_tasks (
  production_job_id,
  workflow_step_id,
  workflow_step_key,
  workflow_version,
  label_snapshot,
  track_snapshot,
  status,
  assigned_role,
  metadata
)
select
  production_jobs.id,
  workflow_steps.id,
  workflow_steps.key,
  production_jobs.workflow_version,
  workflow_steps.label,
  workflow_steps.track,
  'open',
  workflow_steps.default_assigned_role,
  '{"migration":"202607230001_add_apparel_cart_approval"}'::jsonb
from public.production_jobs
join public.workflow_steps
  on workflow_steps.workflow_definition_id = production_jobs.workflow_definition_id
  and workflow_steps.key = 'apparel.approve_cart'
on conflict (production_job_id, workflow_step_key) do nothing;
