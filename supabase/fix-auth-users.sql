-- Corrige usuarios Auth para login GoTrue
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  encrypted_password = crypt(
    CASE email
      WHEN 'admin@posmariekay.com' THEN 'SandyAdmin123!'
      ELSE 'Sandy123!'
    END,
    gen_salt('bf', 10)
  ),
  updated_at = NOW()
WHERE email IN ('admin@posmariekay.com', 'maria@posmariekay.com', 'laura@posmariekay.com');

UPDATE auth.identities SET
  provider_id = user_id::text,
  identity_data = jsonb_build_object(
    'sub', user_id::text,
    'email', identity_data->>'email',
    'email_verified', true,
    'phone_verified', false
  ),
  updated_at = NOW()
WHERE provider = 'email'
  AND user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('admin@posmariekay.com', 'maria@posmariekay.com', 'laura@posmariekay.com')
  );
