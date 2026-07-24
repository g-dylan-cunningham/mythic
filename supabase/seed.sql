-- Seed data for local development.
--
-- Keep this file safe to run repeatedly. Once the operational tables settle,
-- use it for realistic dev fixtures rather than production data.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  email_change_token_current,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner@mythic.press',
    crypt('flower1234', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Mythic Owner"}'::jsonb,
    now(),
    now(),
    null,
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'admin@mythic.press',
    crypt('flower1234', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Mythic Admin"}'::jsonb,
    now(),
    now(),
    null,
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'staff@mythic.press',
    crypt('flower1234', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Mythic Staff"}'::jsonb,
    now(),
    now(),
    null,
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'cole@mythic.press',
    crypt('flower1234', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Cole"}'::jsonb,
    now(),
    now(),
    null,
    '',
    '',
    '',
    false,
    false
  )
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change_token_new = excluded.email_change_token_new,
  email_change = excluded.email_change,
  email_change_token_current = excluded.email_change_token_current,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  phone = excluded.phone,
  phone_change = excluded.phone_change,
  phone_change_token = excluded.phone_change_token,
  reauthentication_token = excluded.reauthentication_token,
  updated_at = now();

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  id
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '{"sub":"10000000-0000-0000-0000-000000000001","email":"owner@mythic.press","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now(),
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '{"sub":"10000000-0000-0000-0000-000000000002","email":"admin@mythic.press","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now(),
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    '{"sub":"10000000-0000-0000-0000-000000000003","email":"staff@mythic.press","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now(),
    '20000000-0000-0000-0000-000000000003'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    '{"sub":"10000000-0000-0000-0000-000000000004","email":"cole@mythic.press","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now(),
    '20000000-0000-0000-0000-000000000004'
  )
on conflict (provider, provider_id) do update
set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  is_active
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'owner@mythic.press',
    'Mythic Owner',
    'owner',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'admin@mythic.press',
    'Mythic Admin',
    'admin',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'staff@mythic.press',
    'Mythic Staff',
    'staff',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'cole@mythic.press',
    'Cole',
    'owner',
    true
  )
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active;

with workflow as (
  select
    workflow_definitions.id,
    workflow_definitions.version,
    product_categories.id as product_category_id
  from public.workflow_definitions
  join public.product_categories
    on product_categories.id = workflow_definitions.product_category_id
  where workflow_definitions.key = 'screen_printing'
    and workflow_definitions.version = 1
),
job as (
  insert into public.production_jobs (
    id,
    printavo_order_id,
    printavo_order_number,
    printavo_status_id,
    printavo_status_name,
    printavo_paid_at,
    product_category_id,
    workflow_definition_id,
    workflow_version,
    current_phase_key,
    current_phase_label_snapshot,
    customer_name,
    job_name,
    due_date,
    priority,
    assigned_lead_id,
    difficulty_score,
    estimated_minutes,
    setup_minutes,
    run_minutes,
    finishing_minutes,
    estimate_confidence,
    estimate_note,
    last_printavo_synced_at,
    metadata
  )
  select
    '30000000-0000-0000-0000-000000000001',
    23630090,
    '18622',
    120802,
    'Schedule & Order Garments ',
    now() - interval '1 day',
    workflow.product_category_id,
    workflow.id,
    workflow.version,
    'phase.needs_sourcing',
    'Needs sourcing',
    'Lon Holloman',
    'Invoice #18622 - Lon Holloman Tees',
    current_date + interval '7 days',
    'normal',
    '10000000-0000-0000-0000-000000000004',
    3,
    180,
    45,
    105,
    30,
    'medium',
    'Seed job for Phase 2 local workflow development.',
    now(),
    '{"seeded":true,"source":"local_seed"}'::jsonb
  from workflow
  on conflict (printavo_order_id) do update
  set
    printavo_order_number = excluded.printavo_order_number,
    printavo_status_id = excluded.printavo_status_id,
    printavo_status_name = excluded.printavo_status_name,
    product_category_id = excluded.product_category_id,
    workflow_definition_id = excluded.workflow_definition_id,
    workflow_version = excluded.workflow_version,
    current_phase_key = excluded.current_phase_key,
    current_phase_label_snapshot = excluded.current_phase_label_snapshot,
    customer_name = excluded.customer_name,
    job_name = excluded.job_name,
    due_date = excluded.due_date,
    priority = excluded.priority,
    assigned_lead_id = excluded.assigned_lead_id,
    difficulty_score = excluded.difficulty_score,
    estimated_minutes = excluded.estimated_minutes,
    setup_minutes = excluded.setup_minutes,
    run_minutes = excluded.run_minutes,
    finishing_minutes = excluded.finishing_minutes,
    estimate_confidence = excluded.estimate_confidence,
    estimate_note = excluded.estimate_note,
    last_printavo_synced_at = excluded.last_printavo_synced_at,
    metadata = excluded.metadata
  returning id, workflow_definition_id, workflow_version
),
task_states as (
  select *
  from (
    values
      ('art.confirm_artwork_needed', 'complete'),
      ('art.create_revise_artwork', 'complete'),
      ('art.send_artwork_approval', 'complete'),
      ('art.artwork_approved', 'complete'),
      ('art.ready_to_burn_screens', 'complete'),
      ('apparel.confirm_garment_requirements', 'complete'),
      ('apparel.build_supplier_cart', 'complete'),
      ('apparel.approve_cart', 'in_progress'),
      ('apparel.order_apparel', 'open'),
      ('apparel.apparel_shipped', 'open'),
      ('apparel.apparel_received', 'open')
  ) as state(workflow_step_key, status)
),
tasks as (
  insert into public.production_tasks (
    production_job_id,
    workflow_step_id,
    workflow_step_key,
    workflow_version,
    label_snapshot,
    track_snapshot,
    status,
    assigned_role,
    started_at,
    completed_at,
    completed_by,
    metadata
  )
  select
    job.id,
    workflow_steps.id,
    workflow_steps.key,
    job.workflow_version,
    workflow_steps.label,
    workflow_steps.track,
    coalesce(task_states.status, 'open'),
    workflow_steps.default_assigned_role,
    case
      when task_states.status in ('in_progress', 'complete')
        then now() - interval '4 hours'
      else null
    end,
    case
      when task_states.status = 'complete'
        then now() - interval '2 hours'
      else null
    end,
    case
      when task_states.status = 'complete'
        then '10000000-0000-0000-0000-000000000004'::uuid
      else null
    end,
    '{"seeded":true,"source":"local_seed"}'::jsonb
  from job
  join public.workflow_steps
    on workflow_steps.workflow_definition_id = job.workflow_definition_id
  left join task_states
    on task_states.workflow_step_key = workflow_steps.key
  where workflow_steps.step_type <> 'phase'
  on conflict (production_job_id, workflow_step_key) do update
  set
    workflow_step_id = excluded.workflow_step_id,
    workflow_version = excluded.workflow_version,
    label_snapshot = excluded.label_snapshot,
    track_snapshot = excluded.track_snapshot,
    status = excluded.status,
    assigned_role = excluded.assigned_role,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    metadata = excluded.metadata
  returning production_job_id
)
insert into public.production_job_events (
  id,
  production_job_id,
  actor_user_id,
  event_type,
  source,
  to_state_key,
  to_state_label_snapshot,
  workflow_definition_id,
  workflow_version,
  note,
  metadata
)
select
  '30000000-0000-0000-0000-000000000101',
  job.id,
  '10000000-0000-0000-0000-000000000004',
  'job_created',
  'system',
  'phase.needs_sourcing',
  'Needs sourcing',
  job.workflow_definition_id,
  job.workflow_version,
  'Local seed created a representative paid Printavo order for Phase 2 development.',
  '{"seeded":true,"source":"local_seed"}'::jsonb
from job
on conflict (id) do update
set
  production_job_id = excluded.production_job_id,
  actor_user_id = excluded.actor_user_id,
  event_type = excluded.event_type,
  source = excluded.source,
  to_state_key = excluded.to_state_key,
  to_state_label_snapshot = excluded.to_state_label_snapshot,
  workflow_definition_id = excluded.workflow_definition_id,
  workflow_version = excluded.workflow_version,
  note = excluded.note,
  metadata = excluded.metadata;
