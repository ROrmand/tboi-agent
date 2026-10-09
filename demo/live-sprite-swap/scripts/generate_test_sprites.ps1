Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\resources\gfx\items\collectibles'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$sprites = @(
  @{ File = 'ember_orb.png'; Main = [System.Drawing.Color]::FromArgb(255, 255, 91, 40); Accent = [System.Drawing.Color]::FromArgb(255, 255, 224, 117) },
  @{ File = 'verdant_orb.png'; Main = [System.Drawing.Color]::FromArgb(255, 51, 190, 104); Accent = [System.Drawing.Color]::FromArgb(255, 191, 255, 123) },
  @{ File = 'void_orb.png'; Main = [System.Drawing.Color]::FromArgb(255, 112, 69, 230); Accent = [System.Drawing.Color]::FromArgb(255, 238, 156, 255) }
)

foreach ($spec in $sprites) {
  $bitmap = [System.Drawing.Bitmap]::new(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($y = 0; $y -lt 32; $y++) {
    for ($x = 0; $x -lt 32; $x++) {
      $distance = [Math]::Sqrt((($x - 15.5) * ($x - 15.5)) + (($y - 15.5) * ($y - 15.5)))
      if ($distance -le 11) {
        $bitmap.SetPixel($x, $y, $spec.Main)
      }
      if (($distance -le 7) -and ((($x + $y) % 3) -ne 0)) {
        $bitmap.SetPixel($x, $y, $spec.Accent)
      }
    }
  }
  $bitmap.Save((Join-Path $out $spec.File), [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}
