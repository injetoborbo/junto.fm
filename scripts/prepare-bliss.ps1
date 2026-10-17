$ErrorActionPreference = "Stop"

# Run from any directory: this downloads Bliss and creates a lightweight local JPG.
$projectRoot = Split-Path -Parent $PSScriptRoot
$imageDir = Join-Path $projectRoot "public\images"
New-Item -ItemType Directory -Force -Path $imageDir | Out-Null

$sourceUrl = "https://archive.org/download/theoriginalfilesofsomewindowswallpapers/bliss%20600dpi.jpg"
$downloadPath = Join-Path $env:TEMP "junto-bliss-source.jpg"
$outputPath = Join-Path $imageDir "bliss.jpg"

Write-Host "Baixando a imagem Bliss original..."
Invoke-WebRequest -Uri $sourceUrl -OutFile $downloadPath -UseBasicParsing

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Image]::FromFile($downloadPath)
try {
    $maxWidth = 1920
    $scale = [Math]::Min(1.0, $maxWidth / [double]$source.Width)
    $width = [Math]::Max(1, [int][Math]::Round($source.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($source.Height * $scale))
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($source, 0, 0, $width, $height)
        } finally {
            $graphics.Dispose()
        }

        $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
            Where-Object { $_.MimeType -eq "image/jpeg" } |
            Select-Object -First 1
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
            [System.Drawing.Imaging.Encoder]::Quality, [long]84
        )
        try {
            $bitmap.Save($outputPath, $jpegCodec, $encoderParams)
        } finally {
            $encoderParams.Dispose()
        }
    } finally {
        $bitmap.Dispose()
    }
} finally {
    $source.Dispose()
}

Remove-Item $downloadPath -Force -ErrorAction SilentlyContinue
$file = Get-Item $outputPath
Write-Host ("Pronto: {0}x{1}, {2:N0} KB" -f $width, $height, ($file.Length / 1KB))
Write-Host "Arquivo criado em: $outputPath"
