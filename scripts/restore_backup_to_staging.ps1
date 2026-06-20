param(
  [string]$Backup = "exports\vista_supabase_backup_2026-06-06T06-29-40.xlsx",
  [string]$OutputSql = ""
)

$ErrorActionPreference = "Stop"

$LiveProjectRef = "akjybtvaezxayfwtpifd"

if (-not $env:STAGING_DB_URL) {
  throw "Set STAGING_DB_URL to the staging Postgres connection string before running this script."
}

if ($env:STAGING_DB_URL -match $LiveProjectRef) {
  throw "STAGING_DB_URL contains the live project ref ($LiveProjectRef). Refusing to continue."
}

if ($env:CONFIRM_STAGING_RESTORE -ne "YES") {
  throw "Set CONFIRM_STAGING_RESTORE=YES to confirm this restore is targeting staging."
}

if (-not (Test-Path -LiteralPath $Backup)) {
  throw "Backup workbook not found: $Backup"
}

if (-not $OutputSql) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputSql = "exports\staging_restore_$stamp.sql"
}

Write-Host "Generating restore SQL from $Backup..."
python scripts\generate_restore_sql_from_backup.py --backup $Backup --output $OutputSql

Write-Host "Applying restore SQL to staging database..."
supabase db query --db-url $env:STAGING_DB_URL --file $OutputSql

Write-Host "Staging restore complete."
Write-Host "Restore SQL: $OutputSql"
