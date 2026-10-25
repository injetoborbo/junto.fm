# Publica o GLB do Macaco 2.0 na main usando a copia local do criador.
# USO: .\scripts\publicar-macaco2.ps1 -Origem "C:\Users\...\Downloads\magago_junto_rig_teste.glb"
param(
 [string]$Origem = ""
)
$ErrorActionPreference = "Stop"
$repo = (& git rev-parse --show-toplevel).Trim()
if (-not $repo) { throw "Abra primeiro o terminal no repositorio junto.fm." }
$branch = (& git branch --show-current).Trim()
if ($branch -ne "main") { throw "Troque para main: git switch main; git pull origin main" }
if (-not $Origem) {
 $candidates = @(
   (Join-Path $repo "magago_junto_rig_teste.glb"),
   (Join-Path $env:USERPROFILE "Downloads\magago_junto_rig_teste.glb")
 )
 $Origem = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $Origem -or -not (Test-Path -LiteralPath $Origem)) {
 throw "GLB nao encontrado. Informe -Origem com o caminho do arquivo magago_junto_rig_teste.glb."
}
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Origem))
if ($bytes.Length -lt 50000 -or [Text.Encoding]::ASCII.GetString($bytes,0,4) -ne "glTF") {
 throw "Arquivo nao parece ser um modelo GLB binario valido; nada foi alterado."
}
$targetDir=Join-Path $repo "public\models"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
$target=Join-Path $targetDir "magago_junto_rig_teste.glb"
Copy-Item -LiteralPath $Origem -Destination $target -Force
& git add -- "public/models/magago_junto_rig_teste.glb"
if ($LASTEXITCODE -ne 0) { throw "Falha no git add" }
& git diff --cached --quiet -- "public/models/magago_junto_rig_teste.glb"
if ($LASTEXITCODE -eq 0) {
 Write-Host "O GLB ja esta identico na main; nenhum commit necessario."
 exit 0
}
& git commit -m "Adiciona modelo rigado Macaco 2.0 para The Simios" -- "public/models/magago_junto_rig_teste.glb"
if ($LASTEXITCODE -ne 0) { throw "Falha no commit" }
& git push origin main
if ($LASTEXITCODE -ne 0) { throw "Falha no push. O commit permanece salvo localmente." }
Write-Host "Macaco 2.0 publicado. O modelo sera escolhido automaticamente quando presente no servidor."
