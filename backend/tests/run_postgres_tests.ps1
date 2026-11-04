param(
    [string]$PostgresBin = 'C:\Program Files\PostgreSQL\18\bin',
    [int]$Port = 55439,
    [string]$TestPattern = 'test_fee_postgres*.py',
    [string[]]$TestName = @()
)

# This helper deliberately creates its own cluster. It never reads the app .env
# or uses DATABASE_URL. PostgreSQL only listens on the loopback interface.
$ErrorActionPreference = 'Stop'
$backendPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonPath = Join-Path $backendPath 'venv\Scripts\python.exe'
$runId = [Guid]::NewGuid().ToString('N')
$runPath = [IO.Path]::GetFullPath((Join-Path $backendPath ('.fee-postgres-test-' + $runId)))
$dataPath = Join-Path $runPath 'data'
$databaseName = 'sms_fee_test_' + $runId
$testExitCode = 1
$started = $false
$previousTestUrl = $env:TEST_POSTGRES_URL

function Invoke-HiddenProcess {
    param([string]$Executable, [string[]]$Arguments, [string]$Name)
    $outPath = Join-Path $runPath ($Name + '.out.log')
    $errPath = Join-Path $runPath ($Name + '.err.log')
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
    if (-not $process.WaitForExit(60000)) {
        # initdb creates probe children; terminate only this helper's process
        # tree so a timed-out probe cannot keep its files open indefinitely.
        $process.Kill($true)
        $process.WaitForExit()
        throw "$Name exceeded its 60-second timeout"
    }
    if ($process.ExitCode -ne 0) {
        Get-Content -LiteralPath $outPath
        Get-Content -LiteralPath $errPath
        throw "$Name failed with exit code $($process.ExitCode)"
    }
}

try {
    if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) { throw 'Backend virtualenv Python was not found' }
    if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin 'initdb.exe') -PathType Leaf)) { throw 'PostgreSQL binaries were not found' }
    if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a non-privileged TCP port' }
    # Refuse to share a port with a running cluster. No connections to that server
    # are made, beyond the pg_isready availability check.
    & (Join-Path $PostgresBin 'pg_isready.exe') -h 127.0.0.1 -p $Port -t 1 | Out-Null
    if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) { throw "Port $Port is already used by PostgreSQL; choose another -Port" }
    New-Item -ItemType Directory -Path $runPath | Out-Null
    Set-Content -LiteralPath (Join-Path $runPath '.test-cluster-marker') -Value $runId
    Invoke-HiddenProcess (Join-Path $PostgresBin 'initdb.exe') @('-D', ('"' + $dataPath + '"'), '-U', 'sms_fee_test', '-A', 'trust', '--encoding=UTF8', '--locale=C', '-c', 'max_connections=20', '-c', 'shared_buffers=16MB') 'initdb'
    $serverLog = Join-Path $runPath 'server.log'
    $serverOptions = '"-h 127.0.0.1 -p ' + $Port + ' -c max_connections=20"'
    Invoke-HiddenProcess (Join-Path $PostgresBin 'pg_ctl.exe') @('-D', ('"' + $dataPath + '"'), '-l', ('"' + $serverLog + '"'), '-o', $serverOptions, '-w', '-t', '30', 'start') 'start'
    $started = $true
    Invoke-HiddenProcess (Join-Path $PostgresBin 'createdb.exe') @('-h', '127.0.0.1', '-p', $Port, '-U', 'sms_fee_test', $databaseName) 'createdb'
    $env:TEST_POSTGRES_URL = 'postgresql+psycopg2://sms_fee_test@127.0.0.1:' + $Port + '/' + $databaseName
    Push-Location -LiteralPath $backendPath
    try {
        $nameArgs = @()
        foreach ($name in $TestName) { $nameArgs += @('-k', $name) }
        & $pythonPath -B -m unittest discover -s tests -p $TestPattern -v @nameArgs
        $testExitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
}
finally {
    $env:TEST_POSTGRES_URL = $previousTestUrl
    if ($started -or (Test-Path -LiteralPath (Join-Path $dataPath 'postmaster.pid'))) {
        Invoke-HiddenProcess (Join-Path $PostgresBin 'pg_ctl.exe') @('-D', ('"' + $dataPath + '"'), '-m', 'immediate', '-w', '-t', '30', 'stop') 'stop'
    }
    # Verify the absolute target and our marker before recursively removing only
    # this helper's disposable cluster. Never follow a supplied deletion path.
    if (Test-Path -LiteralPath $runPath) {
        $resolvedRun = (Resolve-Path -LiteralPath $runPath).Path
        $expectedPrefix = $backendPath.TrimEnd('\') + '\.fee-postgres-test-'
        $markerPath = Join-Path $resolvedRun '.test-cluster-marker'
        if (-not $resolvedRun.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
            -not (Test-Path -LiteralPath $markerPath) -or
            (Get-Content -LiteralPath $markerPath -Raw).Trim() -ne $runId) {
            throw 'Refusing to clean an unverified test-cluster directory'
        }
        Remove-Item -LiteralPath $resolvedRun -Recurse -Force
    }
}
exit $testExitCode
