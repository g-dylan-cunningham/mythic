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
