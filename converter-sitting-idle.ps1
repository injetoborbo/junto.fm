param(
  [string]$Source = "$env:USERPROFILE\Downloads\Sitting Idle.fbx",
  [string]$Converter = "$env:USERPROFILE\Downloads\capitaopatria\FBX2glTF-windows-x64.exe"
)
$ErrorActionPreference="Stop"
if (!(Test-Path -LiteralPath $Source -PathType Leaf)) { throw "Nao encontrei o arquivo FBX: $Source" }
if (!(Test-Path -LiteralPath $Converter -PathType Leaf)) { throw "Nao encontrei o conversor: $Converter" }
$dir=Join-Path $PSScriptRoot "public\poses"
New-Item -Path $dir -ItemType Directory -Force | Out-Null
$output=Join-Path $dir "sitting-idle.glb"
& $Converter -i $Source -o $output -b
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $output -PathType Leaf)) { throw "Conversao falhou." }
Write-Host "Pose convertida: $output" -ForegroundColor Green
Write-Host "Agora execute npm.cmd start e atualize com Ctrl+F5." -ForegroundColor Cyan
