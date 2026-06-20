-- First admin profile link for the isolated Vista Blind Supabase project.
--
-- Before running this file:
-- 1. Open Supabase Dashboard > Authentication > Users.
-- 2. Add/create the first admin Auth user with an email and password.
-- 3. Replace the email and full name below, then run this in SQL Editor.

DO $$
DECLARE
  v_email TEXT := 'replace-with-admin-email@example.com';
  v_full_name TEXT := 'Vista Admin';
  v_user_id UUID;
BEGIN
  SELECT id
    INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_email)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No Supabase Auth user found for email %. Create the Auth user first, then rerun this SQL.', v_email;
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (v_user_id, lower(v_email), 'admin', v_full_name)
  ON CONFLICT (id) DO UPDATE
  SET email = excluded.email,
      role = 'admin',
      full_name = excluded.full_name;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT id, email, role, full_name, created_at
FROM public.profiles
WHERE role = 'admin'
ORDER BY created_at;
