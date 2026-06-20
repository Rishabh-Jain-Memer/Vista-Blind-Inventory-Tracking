# New Supabase Project Setup

Target project: `knawjdrsdqgyfzqzddix`

These files set up the isolated Vista Blind database without importing fabric, inventory, RRP, recipe, order, customer, supplier, or ticket data.

## Order

1. Run `001_new_project_empty_schema.sql` in Supabase SQL Editor.
2. Create the first admin user in Supabase Dashboard > Authentication > Users.
3. Edit `002_link_first_admin_profile.sql` and replace:
   - `replace-with-admin-email@example.com`
   - `Vista Admin`
4. Run `002_link_first_admin_profile.sql` in Supabase SQL Editor.
5. Sign in at `login.html` with that Auth user's email and password.

## Notes

- Do not run these files against the old production project `akjybtvaezxayfwtpifd`.
- `001_new_project_empty_schema.sql` drops and rebuilds the `public` schema, so it is intended for the new empty Supabase project only.
- The setup creates empty structural tables so dashboard and Profiles can load without fabric data.
- The Profiles page can list/edit profiles after this setup.
- Creating employees from the app requires deploying `supabase/functions/admin-users` with `SUPABASE_SERVICE_ROLE_KEY` set as an Edge Function secret. Until Supabase CLI access is granted for `knawjdrsdqgyfzqzddix`, create additional Auth users in the Supabase Dashboard and link them with profile rows.
