# Nightly cruise_control database backup.
#
# Writes DDL + data dumps to a directory outside the repo and prunes
# anything older than 30 days. Run via Windows Task Scheduler.
#
# Schedule: schtasks /Create /SC DAILY /TN "cruise_control nightly backup" /ST 03:00 `
#             /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
#             <path-to-repo>\scripts\backup_cruise_control.ps1"
#
# Set $BackupDir below to wherever you want dumps written (NOT inside the repo).

$ErrorActionPreference = 'Stop'

$BackupDir   = 'C:\cruise_control_backups'
$LogFile     = Join-Path $BackupDir 'backup.log'
$RetainDays  = 30
$PgDump      = 'C:\Program Files\PostgreSQL\12\bin\pg_dump.exe'
$Database    = 'cruise_control'
$DbUser      = 'postgres'
$DbHost      = 'localhost'

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

function Write-Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

try {
    if (-not $env:keysql) {
        throw "env var 'keysql' is not set; cannot connect to Postgres"
    }
    if (-not (Test-Path $PgDump)) {
        throw "pg_dump not found at $PgDump"
    }

    $env:PGPASSWORD = $env:keysql
    $today = Get-Date -Format 'yyyyMMdd'
    $ddl  = Join-Path $BackupDir "cruise_control_ddl_$today.sql"
    $data = Join-Path $BackupDir "cruise_control_data_$today.sql"

    & $PgDump -h $DbHost -U $DbUser -d $Database --schema-only --no-owner --no-privileges -f $ddl
    if ($LASTEXITCODE -ne 0) { throw "pg_dump (schema) exited $LASTEXITCODE" }

    & $PgDump -h $DbHost -U $DbUser -d $Database --data-only --no-owner --no-privileges -f $data
    if ($LASTEXITCODE -ne 0) { throw "pg_dump (data) exited $LASTEXITCODE" }

    $ddlSize  = (Get-Item $ddl).Length
    $dataSize = (Get-Item $data).Length
    Write-Log ("OK  ddl={0} bytes  data={1} bytes" -f $ddlSize, $dataSize)

    # Prune old backups
    $cutoff = (Get-Date).AddDays(-$RetainDays)
    $pruned = Get-ChildItem -Path $BackupDir -Filter 'cruise_control_*.sql' |
              Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($f in $pruned) {
        Remove-Item -Path $f.FullName -Force
        Write-Log ("PRUNED $($f.Name)")
    }
}
catch {
    Write-Log ("FAIL  $($_.Exception.Message)")
    exit 1
}
