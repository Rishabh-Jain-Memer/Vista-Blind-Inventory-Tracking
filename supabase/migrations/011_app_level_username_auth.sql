-- App-level username/password auth for the New clone.
-- This intentionally stops depending on Supabase Auth sessions in the browser.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

UPDATE public.profiles
SET username = COALESCE(
  NULLIF(username, ''),
  CASE
    WHEN lower(email) = 'rishabhmjain2006@gmail.com' THEN 'admin'
    ELSE lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_\\-]+', '_', 'g'))
  END
);

UPDATE public.profiles
SET password_hash = extensions.crypt('admin123', extensions.gen_salt('bf')),
    password_changed_at = now()
WHERE lower(username) = 'admin'
  AND password_hash IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key
  ON public.profiles (lower(username));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'management'::text, 'sales'::text, 'executer'::text]));

CREATE TABLE IF NOT EXISTS public.app_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);

ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_sessions_no_public_read ON public.app_sessions;
CREATE POLICY app_sessions_no_public_read ON public.app_sessions
  FOR SELECT TO anon
  USING (false);

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'admin'::text
$$;

CREATE OR REPLACE FUNCTION public.app_profile_for_token(p_token UUID)
RETURNS TABLE (
  id UUID,
  username TEXT,
  email TEXT,
  role TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.app_sessions s
  SET last_seen_at = now()
  WHERE s.token = p_token
    AND s.expires_at > now();

  RETURN QUERY
  SELECT p.id, p.username, p.email, p.role, p.full_name, p.created_at, p.is_active
  FROM public.app_sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token = p_token
    AND s.expires_at > now()
    AND p.is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_login(p_username TEXT, p_password TEXT)
RETURNS TABLE (
  token UUID,
  id UUID,
  username TEXT,
  email TEXT,
  role TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_token UUID;
BEGIN
  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE lower(profiles.username) = lower(trim(p_username))
    AND profiles.is_active = true
  LIMIT 1;

  IF v_profile.id IS NULL OR v_profile.password_hash IS NULL OR v_profile.password_hash <> extensions.crypt(p_password, v_profile.password_hash) THEN
    RAISE EXCEPTION 'Invalid username or password';
  END IF;

  INSERT INTO public.app_sessions (profile_id)
  VALUES (v_profile.id)
  RETURNING app_sessions.token INTO v_token;

  UPDATE public.profiles
  SET last_login_at = now()
  WHERE profiles.id = v_profile.id;

  RETURN QUERY
  SELECT v_token, p.id, p.username, p.email, p.role, p.full_name, p.created_at, p.is_active
  FROM public.profiles p
  WHERE p.id = v_profile.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_logout(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.app_sessions WHERE token = p_token;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_assert_admin(p_token UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  SELECT p.id
  INTO v_actor
  FROM public.app_sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token = p_token
    AND s.expires_at > now()
    AND p.is_active = true
    AND p.role = 'admin';

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Admin access is required';
  END IF;

  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_create_profile(
  p_token UUID,
  p_username TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  email TEXT,
  role TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_username TEXT := lower(trim(p_username));
  v_role TEXT := lower(trim(p_role));
BEGIN
  PERFORM public.app_assert_admin(p_token);

  IF v_username !~ '^[a-z0-9_-]{3,32}$' THEN
    RAISE EXCEPTION 'Username must be 3-32 characters using letters, numbers, underscore, or hyphen';
  END IF;
  IF coalesce(length(p_password), 0) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;
  IF v_role NOT IN ('admin', 'management', 'sales', 'executer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  INSERT INTO public.profiles (id, email, username, password_hash, role, full_name, password_changed_at, is_active)
  VALUES (
    gen_random_uuid(),
    v_username || '@local.vista',
    v_username,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    v_role,
    nullif(trim(p_full_name), ''),
    now(),
    true
  )
  RETURNING profiles.id INTO v_id;

  RETURN QUERY
  SELECT p.id, p.username, p.email, p.role, p.full_name, p.created_at, p.is_active
  FROM public.profiles p
  WHERE p.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_update_profile(
  p_token UUID,
  p_profile_id UUID,
  p_username TEXT,
  p_full_name TEXT,
  p_role TEXT,
  p_is_active BOOLEAN
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  email TEXT,
  role TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username TEXT := lower(trim(p_username));
  v_role TEXT := lower(trim(p_role));
BEGIN
  PERFORM public.app_assert_admin(p_token);

  IF v_username !~ '^[a-z0-9_-]{3,32}$' THEN
    RAISE EXCEPTION 'Username must be 3-32 characters using letters, numbers, underscore, or hyphen';
  END IF;
  IF v_role NOT IN ('admin', 'management', 'sales', 'executer') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  UPDATE public.profiles
  SET username = v_username,
      email = v_username || '@local.vista',
      full_name = nullif(trim(p_full_name), ''),
      role = v_role,
      is_active = coalesce(p_is_active, true)
  WHERE profiles.id = p_profile_id;

  RETURN QUERY
  SELECT p.id, p.username, p.email, p.role, p.full_name, p.created_at, p.is_active
  FROM public.profiles p
  WHERE p.id = p_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_delete_profile(p_token UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := public.app_assert_admin(p_token);
  IF v_actor = p_profile_id THEN
    RAISE EXCEPTION 'You cannot delete your own admin profile';
  END IF;
  DELETE FROM public.profiles WHERE id = p_profile_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_update_own_profile(
  p_token UUID,
  p_username TEXT,
  p_full_name TEXT
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  email TEXT,
  role TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_username TEXT := lower(trim(p_username));
BEGIN
  SELECT p.id
  INTO v_profile_id
  FROM public.app_sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token = p_token
    AND s.expires_at > now()
    AND p.is_active = true;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Login session expired';
  END IF;
  IF v_username !~ '^[a-z0-9_-]{3,32}$' THEN
    RAISE EXCEPTION 'Username must be 3-32 characters using letters, numbers, underscore, or hyphen';
  END IF;

  UPDATE public.profiles
  SET username = v_username,
      email = v_username || '@local.vista',
      full_name = nullif(trim(p_full_name), '')
  WHERE profiles.id = v_profile_id;

  RETURN QUERY
  SELECT p.id, p.username, p.email, p.role, p.full_name, p.created_at, p.is_active
  FROM public.profiles p
  WHERE p.id = v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_change_password(
  p_token UUID,
  p_current_password TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT p.*
  INTO v_profile
  FROM public.app_sessions s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.token = p_token
    AND s.expires_at > now()
    AND p.is_active = true;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Login session expired';
  END IF;
  IF v_profile.password_hash IS NULL OR v_profile.password_hash <> extensions.crypt(p_current_password, v_profile.password_hash) THEN
    RAISE EXCEPTION 'Current password is incorrect';
  END IF;
  IF coalesce(length(p_new_password), 0) < 6 THEN
    RAISE EXCEPTION 'New password must be at least 6 characters';
  END IF;

  UPDATE public.profiles
  SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      password_changed_at = now()
  WHERE profiles.id = v_profile.id;

  RETURN true;
END;
$$;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('profiles', 'app_sessions')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_write ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
DROP POLICY IF EXISTS profiles_app_select ON public.profiles;
CREATE POLICY profiles_app_select ON public.profiles
  FOR SELECT TO anon
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
GRANT SELECT (id, email, username, role, full_name, created_at, is_active, password_changed_at, last_login_at)
  ON public.profiles TO anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.app_sessions FROM anon;

GRANT EXECUTE ON FUNCTION public.app_profile_for_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.app_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_logout(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.app_create_profile(UUID, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_update_profile(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.app_delete_profile(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.app_update_own_profile(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_change_password(UUID, TEXT, TEXT) TO anon;
