# Ownership Transfer And GitHub Pages Deployment

This repo is now intended to live in the private personal GitHub repository:

```text
https://github.com/RishabhJain1950/Timbervision-Vista-Blind-Tracking-System
```

## Current Status

- GitHub code has been pushed to the private personal repo.
- Local `origin` points at the personal private repo.
- The previous personal repo `main` was preserved as `backup-before-vista-import-20260518`.
- Frontend hosting should use GitHub Pages from the private personal repo.
- Supabase project currently points at:

```text
https://akjybtvaezxayfwtpifd.supabase.co
```

## Supabase Transfer

Use Supabase Dashboard project transfer if the Eonix project should stay the same database/project:

1. In Supabase, open the Eonix-owned project.
2. Go to Project Settings > General.
3. Use Transfer project.
4. Target the personal Supabase organization/account.
5. Confirm there is no active GitHub integration, project-scoped roles, or log drains blocking transfer.

Supabase transfer keeps the project in the same region. If a different region is needed, create a new project and migrate/restore instead of using project transfer.

After transfer, verify these still work:

- Auth users and profiles are present.
- `SUPABASE_URL` and anon/publishable key in `js/config.js` are still correct.
- `supabase/functions/admin-users` is deployed.
- `SUPABASE_SERVICE_ROLE_KEY` is set as a Supabase Edge Function secret.
- The current clone uses the three-file SQL lane in `supabase/migrations`; do not rely on old numbered migrations for the new website database.
- Anonymous table reads are blocked by RLS except for intended authenticated flows.

## GitHub Pages Hosting

Enable GitHub Pages on the private personal repo:

1. Open the GitHub repo settings.
2. Go to Pages.
3. Set Source to `Deploy from a branch`.
4. Select branch `main`.
5. Select folder `/ (root)`.
6. Save and wait for the Pages deployment to finish.

The app is static HTML/CSS/JS and has no build step.

After GitHub Pages gives you the production URL:

1. Copy the GitHub Pages URL.
2. In Supabase Auth URL settings, add the GitHub Pages URL to allowed redirect/site URLs if needed.
3. Set the `admin-users` Edge Function secret:

```powershell
supabase secrets set ALLOWED_ORIGINS=https://rishabhjain1950.github.io --project-ref akjybtvaezxayfwtpifd
```

If the Pages site uses a project path or custom domain, use that exact origin. For project Pages URLs, the origin is only the scheme and host:

```powershell
supabase secrets set ALLOWED_ORIGINS=https://rishabhjain1950.github.io --project-ref akjybtvaezxayfwtpifd
```

Then redeploy the function:

```powershell
supabase functions deploy admin-users --project-ref akjybtvaezxayfwtpifd
```

## Final Verification Checklist

- GitHub repo is private under the personal account.
- GitHub Pages is enabled on the personal private repo.
- GitHub Pages is disabled for the old Eonix repo or no longer used.
- Supabase project owner is the personal organization/account.
- Supabase Auth login works from the GitHub Pages production URL.
- Admin employee create/update/reset/delete works through the Edge Function.
- Executer order execution works through `execute_order`.
- Inventory, Create, Orders, Reports, Profiles, Masters, and embedded Tickets load without console errors.
