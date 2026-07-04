# Load portable toolchain (utils/) into current PowerShell session.
# Usage: . .\utils\env.ps1   (note the leading dot + space, i.e. dot-source)
$utils = $PSScriptRoot
$env:Path = "$utils\node;$utils\npm-global;" + $env:Path
$env:NPM_CONFIG_PREFIX = "$utils\npm-global"
$env:NPM_CONFIG_CACHE = "$utils\npm-cache"
Write-Host "[agentdiary] toolchain loaded: node $(& node -v), npm $(& npm -v)" -ForegroundColor Green
