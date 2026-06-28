# Vista Blind Tracking New - Session Handoff

Last updated: 2026-06-28 09:35 IST

This file is a quick context handoff for future work on `Vista Blind Tracking New`.
The live/non-New folder must not be changed unless explicitly requested.

## Project Boundary

- Work only in `D:\Downloads\Vista Blind\Vista Blind Tracking New`.
- The older `Vista Blind Tracking` folder is reference/live and should not be affected.
- This New clone is a static HTML/CSS/vanilla JS app using Supabase.
- Current Supabase project configured in `js/config.js`:
  - URL: `https://knawjdrsdqgyfzqzddix.supabase.co`
  - Browser key: publishable anon key in `LIVE_SUPABASE_ANON_KEY`.
- The app no longer depends on Supabase Auth for login. It uses database-backed username/password app sessions:
  - Login RPC: `app_login`
  - Session RPC: `app_profile_for_token`
  - Session token localStorage key: `vista.app.session`

## Latest Session Summary - 2026-06-28

Changes made after the earlier RRP/profile handoff:

- Inventory filters now follow Masters:
  - first filter: master page such as Fabrics, Parts, Tracks, Motors
  - second filter: main master inside that page
  - search includes variant/product/category, master/page names, batches, bills, suppliers, and cut pieces
- Mechanism part-link architecture added:
  - `014_mechanism_part_links.sql` creates `mechanism_part_links`
  - `015_mechanism_part_links_anon_permissions.sql` grants/policies the table for the anon-key app session model
  - `js/masters.js` lets admin link inventory parts to mechanism options with quantity rule, quantity per unit, wastage percent, unit, and notes
- Create Order now reads `mechanism_part_links`:
  - linked mechanism parts become planned `order_components`
  - `orders.cost_amount` is set from fabric cost plus mechanism/component cost
  - selling amount remains RRP/DP driven
- Admin Test Mode added:
  - `js/test-mode.js` wraps the global `db` client after auth
  - visible controls are in `account-settings.html` / `js/account-settings.js` and also Profiles
  - admin-only; non-admin users do not see the card
  - writes are captured locally in browser storage while reads still come from Supabase with a local overlay
  - turning it off clears the local test overlay and reloads real data
- Context docs updated:
  - `Context/ARCHITECTURE.md`
  - `Context/CURRENT_STATE.md`
  - `Context/CODEBASE_MAP.md`
  - `Context/AI_GUARDRAILS.md`
  - `Context/AI_RULES.md`
  - `Context/SUPABASE_STATUS.md`
  - `supabase/migrations/README.md`

Important fix: after 014 was run manually, the UI showed `permission denied for table mechanism_part_links`. Root cause was that 014 only granted `authenticated`, but this app uses the anon key with app-level sessions. 015 repairs that.

## High-Level Product Direction

- This is now being rebuilt around a scalable master structure, not the old product-code/inventory model.
- Masters are hierarchical:
  - master page, e.g. Fabrics, Tracks
  - root master, e.g. Roller Blind
  - submasters/sub-submasters, e.g. Screen Classic > 1% > shade colors
- Inventory should be generated/linked from the master structure.
- RRP should be manual and scalable:
  - no imported PDF list tab
  - no price books visible to the user
  - create RRP tables linked to masters and mechanisms
  - Sales Order must use those RRP rules when pricing.
- Mechanisms are separate from masters and can affect price.
  - Roller mechanisms currently include: Without Head Rail, With Head Rail, With Decorative Cassette, With Decorative Square Cassette.
- Roles currently exist but all roles should have full website visibility for now.
  - Only Admin should create/edit/delete employee/customer/supplier profiles.

## Important Current App Areas

### Masters

Files:
- `masters.html`
- `js/masters.js`

Current behavior:
- Supports master pages/tabs.
- Supports nested masters/submasters.
- Supports multiple add.
- Supports edit/delete/reorganize work on masters and pages.
- The page should stay compact; avoid large empty cards.
- Inventory sorting should be based on master pages and then master hierarchy.

### Inventory

Files:
- `inventory.html`
- `js/inventory.js`
- shared data helpers in `js/inventory-source.js`

Current direction:
- Old filters like Fabric/Parts/Hardware/Finished Goods should not drive product behavior anymore.
- Inventory should follow the master structure.
- Blank inventory view should show everything, including zero stock.
- Stock can include rolls and cut pieces.
- Wastage/cut pieces should appear as inventory pieces and in stock history.

### RRP

Files:
- `rrp.html`
- `js/rrp.js`
- migration: `supabase/migrations/013_rrp_rule_engine.sql`

Current design:
- Manual RRP page only.
- No visible "books", no imported PDF tab, no legacy imported table UI.
- One compact rate-sheet style view.
- RRP rules are stored in:
  - `rrp_price_books` as an internal/default backing row only
  - `rrp_rules` for master-linked rate rows
  - `rrp_rule_mechanism_prices` for mechanism-specific prices
- Sales Order pricing resolves selected inventory back to master path and then picks nearest matching RRP rule plus mechanism override.

Recent RRP work:
- Added Roller Blind rates from the supplied screenshots.
- Direct DB check showed 28 active Roller Blind RRP rows.
- Every imported Roller row has 4 mechanism prices.
- Fixed Screen Classic 1% rates:
  - Without Head Rail: 2710
  - With Head Rail: 2970
  - Decorative Cassette: 4300
  - Decorative Square Cassette: 5100
- Added missing master nodes needed by those rate rows, including:
  - Translucent Spectrum
  - Translucent Soleto N B/O
  - Blackout > Soleto B/O
  - Wonder Design - Printed B/O
  - Harris - Printed B/O
  - Midnight Bloom - Printed B/O
  - Prism - Printed B/O
  - Customised - Printed B/O
  - Translucent Panama
  - Translucent Torrent
  - Screen SRS Aluminium Backing
  - Screen Blackout Bliss
  - Translucent Celestial
- RRP UI was compacted:
  - page-specific compact CSS in `rrp.html`
  - search moved into top header
  - no extra `RRP Tables` toolbar row
  - tiny fixed icon actions so delete is visible
  - shorter mechanism headers: `W/O HR`, `W/ HR`, `Dec. Cass.`, `Dec Sq Cass`
  - mechanism columns widened and blank columns narrowed

### Create Sales Order

Files:
- `create.html`
- `create-order.html`
- `js/create-order.js`

Current direction:
- Old "direct order" as a visible item type was removed/should not return casually.
- Direct order exists as a later business decision when local stock is unavailable and order needs to be placed to Vista main company.
- Product code / old finished-product code wording should not appear.
- Sales order item selection should follow masters/inventory structure.
- It should show available inventory while creating order.
- It should not allow creating order if the required local stock is unavailable at the stage where stock is supposed to be checked.
- RRP pricing should use the new `rrp_rules` + `rrp_rule_mechanism_prices`, not imported `rrp_entries`.

### Tickets / Orders / Workflow

Files:
- `tickets.html`, `ticket-detail.html`
- `js/tickets.js`, `js/ticket-detail.js`
- `orders.html`, `order-detail.html`
- `js/orders.js`, `js/order-detail.js`

Current business process:
- Anyone can create a ticket and add follow-ups.
- Ticket states should be only:
  - active
  - confirmed
  - cancelled
- Once a ticket is confirmed, generate quotation from it.
- Wording should be "Generate Quotation", not "Create Order" at that stage.
- Quotation stage should still be visible in Tickets, not immediately moved to Orders.
- If customer accepts quotation, it moves forward to Orders.
- Orders states should include:
  - active
  - processing
  - cancelled
  - completed
- Proforma invoice should be generated only after management approval.
- Quote should not include GST/bank details; proforma invoice should.
- Inventory should be checked only after customer + management confirmation.
- If local stock exists, move to processing/execution.
- If local stock is unavailable, it becomes a direct order to Vista main company.

### Profiles / Roles / Login

Files:
- `settings.html`
- `js/settings.js`
- `login.html`
- `js/login.js`
- `account-settings.html`
- `js/account-settings.js`
- `js/auth.js`
- `js/config.js`
- migration: `supabase/migrations/011_app_level_username_auth.sql`

Current behavior:
- Login is username/password, not email/Supabase Auth.
- Admin can create employee profiles with:
  - full name
  - username
  - temporary password
  - role
- User can later change their password by entering current password plus new password twice.
- Current roles:
  - admin
  - management
  - sales
  - executer
- All roles have full site visibility for now.
- Profile creation/edit/delete should remain Admin-only.

Recent profile issue/fix:
- User created employees but could not see them in Profiles.
- Direct DB queries showed employees did exist:
  - `admin` / Rishabh Jain / admin
  - `manish` / Manish Jain / management
  - `manish_jain76` / Manish Jain / admin
- The browser showed `Employees (0)`.
- Likely cause: stale Supabase Auth token in browser storage causing RLS/context mismatch while this clone uses app-level sessions.
- Fixes applied:
  - `js/config.js` clears old `sb-*auth-token*` entries from localStorage/sessionStorage.
  - Supabase client is created with:
    - `persistSession: false`
    - `autoRefreshToken: false`
    - `detectSessionInUrl: false`
    - explicit anon `Authorization` header
  - `settings.html` cache-busts `config.js`, `auth.js`, and `settings.js`.
  - `js/settings.js` loads employees newest-first.
  - Profiles page has a `Refresh` button.
  - `js/settings.js` has a REST fallback if the normal `db.from('profiles')` query returns an empty list.

If employees still show as zero:
- Hard refresh with `Ctrl + Shift + R`.
- Clear browser localStorage keys starting with `sb-` if needed.
- Confirm app is hitting the New project URL in `window.VISTA_SUPABASE_URL`.
- Direct REST query can verify current profiles:
  - table: `profiles`
  - columns: `username, role, full_name, is_active, created_at`

### Dashboard

Current requirement:
- Dashboard should show operational statistics only:
  - completed orders this month
  - active orders
  - inventory alerts
  - similar operational counts
- Do not show cost, revenue, net profit.

### Wastage / Cut Pieces / Activity Log

Current requirement:
- Wastage section is back.
- When fabric is cut from a roll and a small piece remains, the system should:
  - log the cut piece dimensions
  - link it to the order that created it
  - add it into inventory as a cut piece, not a purchased roll
  - show cut-piece creation in stock history
- Executor should be able to choose whether they are using:
  - fresh roll
  - existing cut piece
- Activity Log section is back and should show important actions.

## Database / Migrations

User wanted the New project to have a clean migration set rather than the old 35+ migrations.
Current migration files in the New clone include the clean new sequence:

1. `001_new_project_empty_schema.sql`
2. `002_link_first_admin_profile.sql`
3. `003_master_nodes_structure.sql`
4. `004_import_inventory_inflow_stock.sql`
5. `005_import_new_rrp_2026.sql`
6. `006_import_excel_catalog_and_track_structures.sql`
7. `007_cut_pieces_wastage_activity.sql`
8. `008_fix_order_ticket_number_sequence.sql`
9. `009_roles_approval_workflow.sql`
10. `010_import_vista_inflow_rishi_masters.sql`
11. `011_app_level_username_auth.sql`
12. `012_master_page_app_session_permissions.sql`
13. `013_rrp_rule_engine.sql`
14. `014_mechanism_part_links.sql`
15. `015_mechanism_part_links_anon_permissions.sql`

Important notes:
- Some older migration files were deleted from this clone.
- User has been manually running SQL in Supabase SQL Editor at times.
- If frontend behavior suggests a missing table/function, check whether the matching migration was actually run in Supabase.
- Direct REST probes using the anon key are useful for verifying table data.
- Supabase CLI is linked to `knawjdrsdqgyfzqzddix`, but direct DB commands currently hang without a remote DB URL/password. See `Context/SUPABASE_STATUS.md`.

## Files Recently Changed In This Session

Key changed files:
- `js/config.js`
  - disables Supabase Auth persistence and clears legacy auth storage.
- `settings.html`
  - added employee refresh button.
  - cache-busted profile scripts.
- `js/settings.js`
  - all roles see full profile directory.
  - employees load newest-first.
  - REST fallback if normal profile query returns empty.
- `rrp.html`
  - compact RRP page CSS and layout.
- `js/rrp.js`
  - compact Excel-like rate sheet.
  - manual RRP CRUD tied to masters/mechanisms.
  - shortened visible mechanism headers.
- `js/create-order.js`
  - RRP pricing intended to use new rule engine, not old imported list.
  - reads `mechanism_part_links` and includes linked mechanism parts in planned `order_components`.
  - sets `orders.cost_amount` from planned fabric plus parts/components cost.
- `inventory.html` / `js/inventory.js`
  - filters by master page then main master.
  - search covers master/page and stock fields.
- `masters.html` / `js/masters.js`
  - mechanism options can link inventory parts through `mechanism_part_links`.
- `account-settings.html` / `js/account-settings.js`
  - visible admin-only Test Mode card.
- `settings.html` / `js/settings.js`
  - Profiles also carries admin-only Test Mode card.
- `js/test-mode.js`
  - browser-local write sandbox for Admin Test Mode.

## Verification Commands Used

Common checks:

```powershell
node --check js\settings.js
node --check js\config.js
node --check js\rrp.js
git -c safe.directory='D:/Downloads/Vista Blind/Vista Blind Tracking New' diff --check -- settings.html js\settings.js js\config.js rrp.html js\rrp.js
```

Direct DB profile check example:

```powershell
@'
const url='https://knawjdrsdqgyfzqzddix.supabase.co';
const key='sb_publishable_hG8vWGKjis6mmoXlvjlVmw_eqIpMI2C';
const headers={apikey:key,authorization:`Bearer ${key}`};
const r=await fetch(`${url}/rest/v1/profiles?select=username,role,full_name,is_active,created_at&order=created_at.desc`,{headers});
console.log(r.status, await r.text());
'@ | node -
```

## Known Cautions

- Browser cache has repeatedly hidden fixes. Use version query strings for changed scripts on affected HTML pages.
- Do not create new parallel category lists. Reuse masters/inventory/mechanism structures.
- Do not reintroduce visible old concepts unless requested:
  - old product codes
  - visible RRP books
  - imported PDF tab
  - old Fabric/Parts/Hardware/Finished Goods category filters
- Keep UI compact. User dislikes large empty cards, oversized padding, and wasted space.
- For RRP table, the expected feel is like the screenshot rate sheet: dense, readable, one-screen where possible.
- For future employee/profile issues, first verify:
  - `profiles` table direct REST data
  - app session token in `vista.app.session`
  - stale `sb-*auth-token*` browser storage
  - script cache-busting in `settings.html`
