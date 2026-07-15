-- =============================================================================
-- Usuarios Sandy — migración automática a Supabase Auth
-- Ejecutar DESPUÉS de setup-all.sql (o seed-sandy.sql)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- admin@posmariekay.com / SandyAdmin123!
DO $$
DECLARE
  v_user_id UUID := 'd0000000-0000-4000-8000-000000000020';
  v_email TEXT := 'admin@posmariekay.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt('SandyAdmin123!', gen_salt('bf', 10)),
    NOW(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Sandy — Administradora"}',
    NOW(), NOW(), false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    updated_at = NOW();

  PERFORM public.link_sandy_user(
    v_user_id, v_email, 'Sandy — Administradora',
    'b0000000-0000-4000-8000-000000000010',
    'e0000000-0000-4000-8000-000000000020', 'admin_org'
  );
END $$;

-- maria@posmariekay.com / Sandy123!
DO $$
DECLARE
  v_user_id UUID := 'd0000000-0000-4000-8000-000000000021';
  v_email TEXT := 'maria@posmariekay.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt('Sandy123!', gen_salt('bf', 10)),
    NOW(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"María González — Vendedora"}',
    NOW(), NOW(), false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    updated_at = NOW();

  PERFORM public.link_sandy_user(
    v_user_id, v_email, 'María González — Vendedora',
    'b0000000-0000-4000-8000-000000000010',
    'e0000000-0000-4000-8000-000000000021', 'vendedor'
  );
END $$;

-- laura@posmariekay.com / Sandy123!
DO $$
DECLARE
  v_user_id UUID := 'd0000000-0000-4000-8000-000000000022';
  v_email TEXT := 'laura@posmariekay.com';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, phone_change, phone_change_token,
    email_change_token_current, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    crypt('Sandy123!', gen_salt('bf', 10)),
    NOW(), '', '', '', '', '', '', '', '',
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Laura Méndez — Vendedora"}',
    NOW(), NOW(), false, false
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = COALESCE(auth.users.email_confirmed_at, NOW()),
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = NOW();

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_email, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', NOW(), NOW(), NOW()
  )
  ON CONFLICT (provider_id, provider) DO UPDATE SET
    identity_data = EXCLUDED.identity_data,
    updated_at = NOW();

  PERFORM public.link_sandy_user(
    v_user_id, v_email, 'Laura Méndez — Vendedora',
    'b0000000-0000-4000-8000-000000000011',
    'e0000000-0000-4000-8000-000000000021', 'vendedor'
  );
END $$;
