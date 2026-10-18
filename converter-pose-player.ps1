param(
  [string]$Source = "$env:USERPROFILE\Downloads\Female Sitting Pose.fbx",
  [string]$Converter = "$env:USERPROFILE\Downloads\capitaopatria\FBX2glTF-windows-x64.exe"
)
$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $Source -PathType Leaf)) { throw "FBX nao encontrado: $Source" }
if (!(Test-Path -LiteralPath $Converter -PathType Leaf)) { throw "Conversor nao encontrado: $Converter" }
$destination = Join-Path $PSScriptRoot "public\poses"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$output = Join-Path $destination "female-sitting.glb"
& $Converter -i $Source -o $output -b
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $output -PathType Leaf)) { throw "Nao foi possivel converter a pose" }
Write-Host "Pose pronta: $output" -ForegroundColor Green
