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
select
  '00000000-0000-0000-0000-000000000000',
  demo.id::uuid,
  'authenticated',
  'authenticated',
  demo.email,
  crypt('flower1234', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', demo.full_name),
  now(),
  now(),
  null,
  '',
  '',
  '',
  false,
  false
from (
  values
    ('10000000-0000-0000-0000-000000000010', 'sales-junior@mythic.press', 'Sales Junior Employee'),
    ('10000000-0000-0000-0000-000000000026', 'sales-junior-2@mythic.press', 'Sales Junior Employee 2'),
    ('10000000-0000-0000-0000-000000000011', 'sales-senior@mythic.press', 'Sales Senior Employee'),
    ('10000000-0000-0000-0000-000000000012', 'sales-manager@mythic.press', 'Sales Junior Manager'),
    ('10000000-0000-0000-0000-000000000013', 'sales-senior-manager@mythic.press', 'Sales Senior Manager'),
    ('10000000-0000-0000-0000-000000000014', 'design-junior@mythic.press', 'Design Junior Employee'),
    ('10000000-0000-0000-0000-000000000015', 'design-senior@mythic.press', 'Design Senior Employee'),
    ('10000000-0000-0000-0000-000000000016', 'design-manager@mythic.press', 'Design Junior Manager'),
    ('10000000-0000-0000-0000-000000000017', 'design-senior-manager@mythic.press', 'Design Senior Manager'),
    ('10000000-0000-0000-0000-000000000018', 'production-junior@mythic.press', 'Production Junior Employee'),
    ('10000000-0000-0000-0000-000000000019', 'production-senior@mythic.press', 'Production Senior Employee'),
    ('10000000-0000-0000-0000-000000000020', 'production-manager@mythic.press', 'Production Junior Manager'),
    ('10000000-0000-0000-0000-000000000021', 'production-senior-manager@mythic.press', 'Production Senior Manager'),
    ('10000000-0000-0000-0000-000000000022', 'logistics-junior@mythic.press', 'Logistics Junior Employee'),
    ('10000000-0000-0000-0000-000000000023', 'logistics-senior@mythic.press', 'Logistics Senior Employee'),
    ('10000000-0000-0000-0000-000000000024', 'logistics-manager@mythic.press', 'Logistics Junior Manager'),
    ('10000000-0000-0000-0000-000000000025', 'logistics-senior-manager@mythic.press', 'Logistics Senior Manager')
) as demo(id, email, full_name)
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
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
select
  demo.id,
  demo.id::uuid,
  jsonb_build_object(
    'sub',
    demo.id,
    'email',
    demo.email,
    'email_verified',
    true,
    'phone_verified',
    false
  ),
  'email',
  now(),
  now(),
  now(),
  demo.identity_id::uuid
from (
  values
    ('10000000-0000-0000-0000-000000000010', '20000000-0000-0000-0000-000000000010', 'sales-junior@mythic.press'),
    ('10000000-0000-0000-0000-000000000026', '20000000-0000-0000-0000-000000000026', 'sales-junior-2@mythic.press'),
    ('10000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000011', 'sales-senior@mythic.press'),
    ('10000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000012', 'sales-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000013', '20000000-0000-0000-0000-000000000013', 'sales-senior-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000014', '20000000-0000-0000-0000-000000000014', 'design-junior@mythic.press'),
    ('10000000-0000-0000-0000-000000000015', '20000000-0000-0000-0000-000000000015', 'design-senior@mythic.press'),
    ('10000000-0000-0000-0000-000000000016', '20000000-0000-0000-0000-000000000016', 'design-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000017', '20000000-0000-0000-0000-000000000017', 'design-senior-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000018', '20000000-0000-0000-0000-000000000018', 'production-junior@mythic.press'),
    ('10000000-0000-0000-0000-000000000019', '20000000-0000-0000-0000-000000000019', 'production-senior@mythic.press'),
    ('10000000-0000-0000-0000-000000000020', '20000000-0000-0000-0000-000000000020', 'production-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000021', 'production-senior-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000022', 'logistics-junior@mythic.press'),
    ('10000000-0000-0000-0000-000000000023', '20000000-0000-0000-0000-000000000023', 'logistics-senior@mythic.press'),
    ('10000000-0000-0000-0000-000000000024', '20000000-0000-0000-0000-000000000024', 'logistics-manager@mythic.press'),
    ('10000000-0000-0000-0000-000000000025', '20000000-0000-0000-0000-000000000025', 'logistics-senior-manager@mythic.press')
) as demo(id, identity_id, email)
on conflict (provider, provider_id) do update
set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  department,
  authority_level,
  is_active
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'owner@mythic.press',
    'Mythic Owner',
    'owner',
    'operations',
    'director',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'admin@mythic.press',
    'Mythic Admin',
    'admin',
    'operations',
    'director',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'staff@mythic.press',
    'Mythic Staff',
    'staff',
    null,
    'senior_employee',
    true
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'cole@mythic.press',
    'Cole',
    'owner',
    'operations',
    'director',
    true
  )
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  department = excluded.department,
  authority_level = excluded.authority_level,
  is_active = excluded.is_active;

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  department,
  authority_level,
  is_active
)
select
  demo.id::uuid,
  demo.email,
  demo.full_name,
  demo.app_role::public.app_role,
  demo.department::public.org_department,
  demo.authority_level::public.authority_level,
  true
from (
  values
    ('10000000-0000-0000-0000-000000000010', 'sales-junior@mythic.press', 'Sales Junior Employee', 'staff', 'sales', 'junior_employee'),
    ('10000000-0000-0000-0000-000000000026', 'sales-junior-2@mythic.press', 'Sales Junior Employee 2', 'staff', 'sales', 'junior_employee'),
    ('10000000-0000-0000-0000-000000000011', 'sales-senior@mythic.press', 'Sales Senior Employee', 'staff', 'sales', 'senior_employee'),
    ('10000000-0000-0000-0000-000000000012', 'sales-manager@mythic.press', 'Sales Junior Manager', 'staff', 'sales', 'junior_manager'),
    ('10000000-0000-0000-0000-000000000013', 'sales-senior-manager@mythic.press', 'Sales Senior Manager', 'staff', 'sales', 'senior_manager'),
    ('10000000-0000-0000-0000-000000000014', 'design-junior@mythic.press', 'Design Junior Employee', 'staff', 'design', 'junior_employee'),
    ('10000000-0000-0000-0000-000000000015', 'design-senior@mythic.press', 'Design Senior Employee', 'staff', 'design', 'senior_employee'),
    ('10000000-0000-0000-0000-000000000016', 'design-manager@mythic.press', 'Design Junior Manager', 'staff', 'design', 'junior_manager'),
    ('10000000-0000-0000-0000-000000000017', 'design-senior-manager@mythic.press', 'Design Senior Manager', 'staff', 'design', 'senior_manager'),
    ('10000000-0000-0000-0000-000000000018', 'production-junior@mythic.press', 'Production Junior Employee', 'staff', 'production', 'junior_employee'),
    ('10000000-0000-0000-0000-000000000019', 'production-senior@mythic.press', 'Production Senior Employee', 'staff', 'production', 'senior_employee'),
    ('10000000-0000-0000-0000-000000000020', 'production-manager@mythic.press', 'Production Junior Manager', 'staff', 'production', 'junior_manager'),
    ('10000000-0000-0000-0000-000000000021', 'production-senior-manager@mythic.press', 'Production Senior Manager', 'staff', 'production', 'senior_manager'),
    ('10000000-0000-0000-0000-000000000022', 'logistics-junior@mythic.press', 'Logistics Junior Employee', 'staff', 'logistics', 'junior_employee'),
    ('10000000-0000-0000-0000-000000000023', 'logistics-senior@mythic.press', 'Logistics Senior Employee', 'staff', 'logistics', 'senior_employee'),
    ('10000000-0000-0000-0000-000000000024', 'logistics-manager@mythic.press', 'Logistics Junior Manager', 'staff', 'logistics', 'junior_manager'),
    ('10000000-0000-0000-0000-000000000025', 'logistics-senior-manager@mythic.press', 'Logistics Senior Manager', 'staff', 'logistics', 'senior_manager')
) as demo(id, email, full_name, app_role, department, authority_level)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  department = excluded.department,
  authority_level = excluded.authority_level,
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
    owning_department,
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
    workflow_steps.default_department,
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
    owning_department = excluded.owning_department,
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

-- Mythic rollout sandbox users. These accounts are intentionally confirmed so
-- employees can log into local/demo environments without email verification.
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
select
  '00000000-0000-0000-0000-000000000000',
  demo.id::uuid,
  'authenticated',
  'authenticated',
  demo.email,
  crypt('flower1234', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', demo.full_name),
  now(),
  now(),
  null,
  '',
  '',
  '',
  false,
  false
from (
  values
    ('10000000-0000-0000-0000-000000000004', 'cole@mythic.press', 'Cole'),
    ('10000000-0000-0000-0000-000000000030', 'allison@mythic.press', 'Allison'),
    ('10000000-0000-0000-0000-000000000031', 'haley@mythic.press', 'Haley'),
    ('10000000-0000-0000-0000-000000000032', 'dillon@mythic.press', 'Dillon'),
    ('10000000-0000-0000-0000-000000000033', 'logan@mythic.press', 'Logan'),
    ('10000000-0000-0000-0000-000000000034', 'dave@mythic.press', 'Dave'),
    ('10000000-0000-0000-0000-000000000035', 'tim@mythic.press', 'Tim'),
    ('10000000-0000-0000-0000-000000000036', 'kyle@mythic.press', 'Kyle')
) as demo(id, email, full_name)
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
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
select
  demo.id,
  demo.id::uuid,
  jsonb_build_object(
    'sub',
    demo.id,
    'email',
    demo.email,
    'email_verified',
    true,
    'phone_verified',
    false
  ),
  'email',
  now(),
  now(),
  now(),
  demo.identity_id::uuid
from (
  values
    ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'cole@mythic.press'),
    ('10000000-0000-0000-0000-000000000030', '20000000-0000-0000-0000-000000000030', 'allison@mythic.press'),
    ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031', 'haley@mythic.press'),
    ('10000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000032', 'dillon@mythic.press'),
    ('10000000-0000-0000-0000-000000000033', '20000000-0000-0000-0000-000000000033', 'logan@mythic.press'),
    ('10000000-0000-0000-0000-000000000034', '20000000-0000-0000-0000-000000000034', 'dave@mythic.press'),
    ('10000000-0000-0000-0000-000000000035', '20000000-0000-0000-0000-000000000035', 'tim@mythic.press'),
    ('10000000-0000-0000-0000-000000000036', '20000000-0000-0000-0000-000000000036', 'kyle@mythic.press')
) as demo(id, identity_id, email)
on conflict (provider, provider_id) do update
set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  department,
  authority_level,
  is_active
)
select
  demo.id::uuid,
  demo.email,
  demo.full_name,
  demo.app_role::public.app_role,
  demo.department::public.org_department,
  demo.authority_level::public.authority_level,
  true
from (
  values
    ('10000000-0000-0000-0000-000000000004', 'cole@mythic.press', 'Cole', 'owner', 'operations', 'director'),
    ('10000000-0000-0000-0000-000000000030', 'allison@mythic.press', 'Allison', 'admin', 'sales', 'senior_manager'),
    ('10000000-0000-0000-0000-000000000031', 'haley@mythic.press', 'Haley', 'staff', 'sales', 'senior_employee'),
    ('10000000-0000-0000-0000-000000000032', 'dillon@mythic.press', 'Dillon', 'staff', 'production', 'junior_manager'),
    ('10000000-0000-0000-0000-000000000033', 'logan@mythic.press', 'Logan', 'staff', 'production', 'junior_employee'),
    ('10000000-0000-0000-0000-000000000034', 'dave@mythic.press', 'Dave', 'staff', 'logistics', 'senior_manager'),
    ('10000000-0000-0000-0000-000000000035', 'tim@mythic.press', 'Tim', 'staff', 'design', 'senior_manager'),
    ('10000000-0000-0000-0000-000000000036', 'kyle@mythic.press', 'Kyle', 'staff', 'production', 'senior_manager')
) as demo(id, email, full_name, app_role, department, authority_level)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  department = excluded.department,
  authority_level = excluded.authority_level,
  is_active = excluded.is_active;
