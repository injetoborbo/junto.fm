# Converte as cinco animacoes FBX para GLB usando FBX2glTF no Windows.
# Uso: .\converter-dancas.ps1
# Opcional: .\converter-dancas.ps1 -SourceFolder "C:\caminho\dos\fbx" -Converter "C:\caminho\FBX2glTF-windows-x64.exe"
param(
  [string]$SourceFolder = "$env:USERPROFILE\Downloads",
  [string]$Converter = "$env:USERPROFILE\Downloads\capitaopatria\FBX2glTF-windows-x64.exe"
)
$ErrorActionPreference = "Stop"
if (!(Test-Path -LiteralPath $Converter -PathType Leaf)) {
  throw "Conversor nao encontrado em: $Converter. Informe -Converter com o caminho correto."
}
if (!(Test-Path -LiteralPath $SourceFolder -PathType Container)) {
  throw "Pasta dos FBX nao encontrada: $SourceFolder"
}
$destination = Join-Path $PSScriptRoot "public\dance"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$names = @("macacochaqualha","macacomacarena","macacodanca","macacocapoera","macacodancagay")
foreach ($name in $names) {
  $source = Get-ChildItem -LiteralPath $SourceFolder -Filter "$name.fbx" -File -Recurse |
    Select-Object -First 1
  if (!$source) {
    Write-Warning "Nao achei $name.fbx em $SourceFolder. Coloque o FBX la e rode novamente."
    continue
  }
  $output = Join-Path $destination "$name.glb"
  Write-Host "Convertendo $($source.Name)..." -ForegroundColor Cyan
  & $Converter -i $source.FullName -o $output -b
  if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $output -PathType Leaf)) {
    throw "Falha ao converter $name.fbx"
  }
  Write-Host "OK: $output" -ForegroundColor Green
}
Write-Host "Pronto. Veja public\dance e teste as animacoes no localhost." -ForegroundColor Green
