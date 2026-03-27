Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AppName = "act-cli"
$BinName = "act"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDir = if ($env:ACT_INSTALL_DIR) {
  $env:ACT_INSTALL_DIR
} else {
  Join-Path $env:LOCALAPPDATA $AppName
}
$BinDir = if ($env:ACT_BIN_DIR) {
  $env:ACT_BIN_DIR
} else {
  Join-Path $InstallDir "bin"
}
$StagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("{0}.{1}" -f $AppName, [System.Guid]::NewGuid().ToString("N"))

function Say {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Message
  )

  Write-Host ($Message -join " ")
}

function Fail {
  param([string]$Message)

  throw $Message
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    Fail "Missing required command: $Name"
  }
}

function Check-NodeVersion {
  $majorVersion = & node -p "process.versions.node.split('.')[0]" 2>$null

  if (-not $majorVersion) {
    Fail "Unable to determine your Node.js version."
  }

  if ([int]$majorVersion -lt 18) {
    Fail "Node.js 18 or newer is required."
  }
}

function Copy-IfExists {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (Test-Path $Source) {
    Copy-Item $Source -Destination $Destination -Recurse -Force
  }
}

function Invoke-NpmInstall {
  param(
    [string]$WorkingDir,
    [switch]$RuntimeOnly
  )

  Push-Location $WorkingDir

  try {
    $usesLockfile = Test-Path (Join-Path $WorkingDir "package-lock.json")

    if ($usesLockfile) {
      if ($RuntimeOnly) {
        & npm ci --omit=dev --no-fund --no-audit
      } else {
        & npm ci --no-fund --no-audit
      }
    } else {
      if ($RuntimeOnly) {
        & npm install --omit=dev --no-fund --no-audit
      } else {
        & npm install --no-fund --no-audit
      }
    }

    if ($LASTEXITCODE -ne 0) {
      Fail "npm install failed."
    }
  } finally {
    Pop-Location
  }
}

function Print-PathHint {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $pathEntries = @()

  if ($userPath) {
    $pathEntries = $userPath.Split(";") | Where-Object { $_ }
  }

  if ($pathEntries -contains $BinDir) {
    return
  }

  Say ""
  Say "Add $BinDir to your PATH to use $BinName from new terminals:"
  Say "  [Environment]::SetEnvironmentVariable('Path', '$BinDir;' + [Environment]::GetEnvironmentVariable('Path', 'User'), 'User')"
  Say "Then restart your terminal."
}

try {
  Require-Command node
  Require-Command npm
  Check-NodeVersion

  if (-not (Test-Path (Join-Path $ScriptDir "package.json"))) {
    Fail "package.json not found next to install.ps1"
  }

  New-Item -ItemType Directory -Path $StagingDir -Force | Out-Null

  Copy-Item (Join-Path $ScriptDir "package.json") -Destination (Join-Path $StagingDir "package.json") -Force
  Copy-IfExists (Join-Path $ScriptDir "package-lock.json") (Join-Path $StagingDir "package-lock.json")

  $bundledDist = Join-Path $ScriptDir "dist\index.js"

  if (Test-Path $bundledDist) {
    Say "Using bundled build from $(Join-Path $ScriptDir "dist")"
    Copy-Item (Join-Path $ScriptDir "dist") -Destination (Join-Path $StagingDir "dist") -Recurse -Force
    Invoke-NpmInstall -WorkingDir $StagingDir -RuntimeOnly
  } else {
    if (-not (Test-Path (Join-Path $ScriptDir "src"))) {
      Fail "src directory not found and no bundled dist build is available."
    }

    if (-not (Test-Path (Join-Path $ScriptDir "tsconfig.json"))) {
      Fail "tsconfig.json not found for source build."
    }

    Say "Building $BinName from source"
    Copy-Item (Join-Path $ScriptDir "src") -Destination (Join-Path $StagingDir "src") -Recurse -Force
    Copy-Item (Join-Path $ScriptDir "tsconfig.json") -Destination (Join-Path $StagingDir "tsconfig.json") -Force

    Invoke-NpmInstall -WorkingDir $StagingDir

    Push-Location $StagingDir
    try {
      & npm run build

      if ($LASTEXITCODE -ne 0) {
        Fail "npm run build failed."
      }

      & npm prune --omit=dev --no-fund --no-audit

      if ($LASTEXITCODE -ne 0) {
        Fail "npm prune failed."
      }

      Remove-Item (Join-Path $StagingDir "src") -Recurse -Force
      Remove-Item (Join-Path $StagingDir "tsconfig.json") -Force
    } finally {
      Pop-Location
    }
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $InstallDir) -Force | Out-Null

  if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
  }

  Move-Item $StagingDir $InstallDir
  $StagingDir = $null

  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

  $EntryPoint = Join-Path $InstallDir "dist\index.js"
  $CmdLauncher = "@echo off`r`nnode `"$EntryPoint`" %*`r`n"
  $PsLauncher = "node `"$EntryPoint`" @args`r`n"

  Set-Content -Path (Join-Path $BinDir "$BinName.cmd") -Value $CmdLauncher -Encoding Ascii
  Set-Content -Path (Join-Path $BinDir "$BinName.ps1") -Value $PsLauncher -Encoding Ascii

  Say ""
  Say "$BinName installed to $InstallDir"
  Say "Launchers created at $(Join-Path $BinDir "$BinName.cmd") and $(Join-Path $BinDir "$BinName.ps1")"
  Say ""
  Say "Run:"
  Say "  $BinName --help"

  Print-PathHint
} finally {
  if ($StagingDir -and (Test-Path $StagingDir)) {
    Remove-Item $StagingDir -Recurse -Force
  }
}
