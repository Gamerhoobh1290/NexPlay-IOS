$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$source = Join-Path $root 'nexplay-icon-brand.png'
$assets = Join-Path $root 'assets'
$pngOut = Join-Path $assets 'nexplay-offline-icon.png'
$icoOut = Join-Path $assets 'nexplay-offline-icon.ico'

if (-not (Test-Path -LiteralPath $source)) {
    throw "Source icon not found: $source"
}

New-Item -ItemType Directory -Path $assets -Force | Out-Null
Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [Parameter(Mandatory = $true)] [System.Drawing.RectangleF] $Rect,
        [Parameter(Mandatory = $true)] [float] $Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $arc = [System.Drawing.RectangleF]::new($Rect.X, $Rect.Y, $diameter, $diameter)
    $path.AddArc($arc, 180, 90)
    $arc.X = $Rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $Rect.X
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-OfflineIconPngBytes {
    param(
        [Parameter(Mandatory = $true)] [int] $Size,
        [Parameter(Mandatory = $true)] [System.Drawing.Image] $SourceImage
    )

    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $panelInset = [Math]::Max(2, [int]($Size * 0.04))
    $panelRect = [System.Drawing.RectangleF]::new($panelInset, $panelInset, $Size - ($panelInset * 2), $Size - ($panelInset * 2))
    $panelRadius = [Math]::Max(4, $Size * 0.18)
    $panelPath = New-RoundedRectanglePath -Rect $panelRect -Radius $panelRadius
    $panelBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $panelRect,
        [System.Drawing.Color]::FromArgb(238, 2, 6, 23),
        [System.Drawing.Color]::FromArgb(220, 8, 47, 73),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $graphics.FillPath($panelBrush, $panelPath)
    $panelPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(118, 103, 232, 249), [Math]::Max(1, $Size * 0.012))
    $graphics.DrawPath($panelPen, $panelPath)

    $markInset = [Math]::Max(4, [int]($Size * 0.09))
    $markRect = [System.Drawing.RectangleF]::new($markInset, $markInset, $Size - ($markInset * 2), $Size - ($markInset * 2))
    $graphics.DrawImage($SourceImage, $markRect)

    $badgeSize = [Math]::Max(8, [int]($Size * 0.34))
    $badgeX = $Size - $badgeSize - [Math]::Max(2, [int]($Size * 0.075))
    $badgeY = $Size - $badgeSize - [Math]::Max(2, [int]($Size * 0.075))
    $badgeRect = [System.Drawing.RectangleF]::new($badgeX, $badgeY, $badgeSize, $badgeSize)
    $badgeBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $badgeRect,
        [System.Drawing.Color]::FromArgb(255, 2, 6, 23),
        [System.Drawing.Color]::FromArgb(255, 20, 184, 166),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $badgeBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 204, 251, 241), [Math]::Max(1.4, $Size * 0.018))
    $graphics.FillEllipse($badgeBrush, $badgeRect)
    $graphics.DrawEllipse($badgeBorder, $badgeRect)

    $symbolPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 240, 253, 250), [Math]::Max(1.2, $Size * 0.017))
    $symbolPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $symbolPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $cx = $badgeX + ($badgeSize / 2)
    $cy = $badgeY + ($badgeSize / 2)
    $dotSize = [Math]::Max(2, $badgeSize * 0.085)
    $graphics.FillEllipse([System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new($cx - ($dotSize / 2), $cy + ($badgeSize * 0.16), $dotSize, $dotSize))
    $arc1 = [System.Drawing.RectangleF]::new($badgeX + ($badgeSize * 0.28), $badgeY + ($badgeSize * 0.35), $badgeSize * 0.44, $badgeSize * 0.35)
    $arc2 = [System.Drawing.RectangleF]::new($badgeX + ($badgeSize * 0.17), $badgeY + ($badgeSize * 0.23), $badgeSize * 0.66, $badgeSize * 0.52)
    $graphics.DrawArc($symbolPen, $arc1, 205, 130)
    $graphics.DrawArc($symbolPen, $arc2, 210, 120)
    $slashPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 14, 165, 233), [Math]::Max(1.8, $Size * 0.024))
    $slashPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $slashPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine(
        $slashPen,
        [System.Drawing.PointF]::new($badgeX + ($badgeSize * 0.27), $badgeY + ($badgeSize * 0.24)),
        [System.Drawing.PointF]::new($badgeX + ($badgeSize * 0.74), $badgeY + ($badgeSize * 0.76))
    )

    $ms = [System.IO.MemoryStream]::new()
    $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()

    $slashPen.Dispose()
    $symbolPen.Dispose()
    $badgeBorder.Dispose()
    $badgeBrush.Dispose()
    $panelPen.Dispose()
    $panelBrush.Dispose()
    $panelPath.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
    $ms.Dispose()

    return $bytes
}

function Write-IcoFile {
    param(
        [Parameter(Mandatory = $true)] [string] $Path,
        [Parameter(Mandatory = $true)] [hashtable[]] $Images
    )

    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$Images.Count)
        $offset = 6 + ($Images.Count * 16)
        foreach ($image in $Images) {
            $size = [int]$image.Size
            $bytes = [byte[]]$image.Bytes
            $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
            $writer.Write([byte]($(if ($size -ge 256) { 0 } else { $size })))
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$bytes.Length)
            $writer.Write([uint32]$offset)
            $offset += $bytes.Length
        }
        foreach ($image in $Images) {
            $writer.Write([byte[]]$image.Bytes)
        }
    } finally {
        $writer.Dispose()
        $stream.Dispose()
    }
}

$sourceImage = [System.Drawing.Image]::FromFile($source)
try {
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $images = @()
    foreach ($size in $sizes) {
        $bytes = New-OfflineIconPngBytes -Size $size -SourceImage $sourceImage
        $images += @{ Size = $size; Bytes = $bytes }
        if ($size -eq 256) {
            [System.IO.File]::WriteAllBytes($pngOut, $bytes)
        }
    }
    Write-IcoFile -Path $icoOut -Images $images
} finally {
    $sourceImage.Dispose()
}

Write-Host "Created $pngOut"
Write-Host "Created $icoOut"
