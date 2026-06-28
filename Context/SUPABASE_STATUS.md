# Supabase Status

Last updated: 2026-06-28.

## Active Remote Project

This checkout is configured for the isolated New Supabase project:

```text
ref: knawjdrsdqgyfzqzddix
url: https://knawjdrsdqgyfzqzddix.supabase.co
name: rishabh.jain28082006@gmail.com's Project
org id: hbwzqeqcznuqlwuhrtqj
region: Northeast Asia (Tokyo)
created at: 2026-06-20 05:01:26 UTC
```

`js/config.js` uses this project for browser pages on every host.

## CLI State

`supabase projects list` works and shows `knawjdrsdqgyfzqzddix` as the linked project.

Local link files also point to this project:

```text
supabase/.temp/linked-project.json
supabase/.temp/project-ref
```

Environment check on 2026-06-28:

```text
VISTA_NEW_DB_URL=not set
SUPABASE_ACCESS_TOKEN=not set
```

## Known CLI Limitations

The following commands timed out or hung from this machine on 2026-06-28:

```powershell
supabase db query --linked --file supabase\migrations\015_mechanism_part_links_anon_permissions.sql
supabase migration list --linked
supabase db push --linked --dry-run
```

`supabase status` fails because it checks local Docker containers, and local Supabase Docker is not running/available:

```text
failed to inspect container health: error during connect ... docker_engine ... The system cannot find the file specified
```

This does not prove the remote Supabase project is down. It only means local container status cannot be read.

## Practical SQL Rule

Until `VISTA_NEW_DB_URL` or the remote DB password is available, run SQL migrations manually in Supabase SQL Editor.

After running `014_mechanism_part_links.sql`, also run `015_mechanism_part_links_anon_permissions.sql`. The app uses the anon key with app-level sessions, so `mechanism_part_links` needs anon grants/RLS policies. If 015 is missing, Masters > Mechanisms can show:

```text
permission denied for table mechanism_part_links
```
