# Vista Staging Setup

Use this workflow before making major website or database changes. The goal is that local testing can create/edit profiles, orders, tickets, inventory, and reports without touching the live Supabase project.

## Isolated Clone Status

This `Vista Blind Tracking New` clone is not linked to the existing production Supabase project. `js/config.js` currently has blank primary Supabase credentials and will fail closed until the new project URL and anon/publishable key are set. The old live project references below are historical safety references copied from the original app, not targets for new development.

## What Is Already Set Up

- The original production app used this live Supabase project:

```text
https://akjybtvaezxayfwtpifd.supabase.co
```

- Local development can switch to a separate Supabase project through `dev-environment.html`.
- Production hosts ignore local staging settings and require the primary credentials in `js/config.js`.
- Staging settings are stored only in the current browser's `localStorage`.
- A yellow `STAGING DB` badge appears on app pages when local development is using staging.
- Current staging project: `vehnkaoutoleonigzuzp` (`Vista Blind Dev Environment`).
- As of 2026-06-09, staging has been rebuilt from live public schema metadata and restored from `exports/vista_supabase_backup_2026-06-06T06-29-40.xlsx`.
- Staging has an admin Auth login for `rishabhmjain2006@gmail.com`. Do not store the password or service-role key in repo files.

## Live Safety Rules

- Do not run write commands with `supabase db query --linked` unless the task is explicitly for live. This repo is currently linked to the live project.
- For staging writes, use `--db-url $env:STAGING_DB_URL`.
- Never put a service-role key in browser JavaScript.
- Before production deployment, create a fresh live export first.

## Create The Staging Supabase Project

You need to do this once in the Supabase dashboard:

1. Create a new Supabase project named something like `Vista Blind Tracking - Staging`.
2. Copy the staging Project URL and anon key from Project Settings > API.
3. Copy the staging Postgres connection string from Project Settings > Database.
4. Keep the staging service-role key private. It is only for Edge Function secrets or server-side scripts.

The staging project should have the same public schema as live before restoring data. The safest options are:

- Use a Supabase project clone/backup restore if your Supabase plan exposes that.
- Or generate/apply a live schema-only SQL dump, then run the workbook restore.

Schema-only dump command, if needed:

```powershell
supabase db dump --linked --schema public --file exports\live_public_schema.sql
```

Apply that schema to staging, not live:

```powershell
$env:STAGING_DB_URL = "paste-staging-postgres-connection-string"
supabase db query --db-url $env:STAGING_DB_URL --file exports\live_public_schema.sql
```

If the schema dump command times out, use the Supabase dashboard backup/clone path or ask Codex to retry with the staging connection available.

If direct Postgres/pooler ports are blocked, Codex can use the Supabase Management API over HTTPS with the locally logged-in Supabase CLI profile. In that path, live must be queried read-only for schema metadata and staging must be the only write target.

## Restore Current Data Into Staging

After the staging schema exists, restore from the current backup workbook:

```powershell
$env:STAGING_DB_URL = "paste-staging-postgres-connection-string"
$env:CONFIRM_STAGING_RESTORE = "YES"
.\scripts\restore_backup_to_staging.ps1
```

The restore helper:

- Refuses to run if `STAGING_DB_URL` contains the live project ref.
- Generates restore SQL from `exports/vista_supabase_backup_2026-06-06T06-29-40.xlsx`.
- Applies the generated restore SQL to the staging database only.
- Does not modify Supabase Auth users.

## Staging Auth Users

If the staging project was cloned with Auth users included, your existing logins may work immediately.

If only public table data was restored, create staging Auth users manually in Supabase Authentication > Users. Then add matching profile rows for those staging Auth user IDs:

```sql
insert into public.profiles (id, email, role, full_name)
values
  ('paste-staging-auth-user-uuid', 'your-email@example.com', 'admin', 'Staging Admin')
on conflict (id) do update
set email = excluded.email,
    role = excluded.role,
    full_name = excluded.full_name;
```

Use at least one `admin`, one `sales`, and one `executer` staging user before workflow testing.

Current staging has an admin user for `rishabhmjain2006@gmail.com`. Create additional staging-only sales/executer users before testing role-specific flows.

## Point Local Website At Staging

Start a local static server, then open:

```text
http://localhost:8000/dev-environment.html
```

Paste the staging Supabase URL and anon key, choose `Staging`, and save. Then open the app from that same browser:

```text
http://localhost:8000/login.html
```

Every page should show the yellow `STAGING DB` badge while using staging.

To switch local testing back to live, open `dev-environment.html` and choose `Live`, or clear staging settings.

## Development Flow

1. Keep live Supabase untouched.
2. Make code changes on a feature branch.
3. Apply database changes to staging first.
4. Test workflows on staging with restored data:
   - login and role routing
   - profile create/edit/delete
   - ticket creation and follow-ups
   - ticket-to-order conversion
   - Create Order calculations
   - stock order receive flow
   - inventory valuation
   - executer queue and `execute_order`
   - reports and quote downloads
5. When staging is correct, export live again.
6. Apply tested migrations to live.
7. Deploy tested code.
8. Run post-deploy checks against live.

## Local Quick Checks

Open the browser console on any app page:

```js
window.VISTA_SUPABASE_ENV
window.VISTA_SUPABASE_URL
```

Expected local staging values:

```text
staging
https://your-staging-project.supabase.co
```

Expected production values:

```text
live
https://akjybtvaezxayfwtpifd.supabase.co
```
