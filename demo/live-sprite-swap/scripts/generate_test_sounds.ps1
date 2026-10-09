# Produces three tiny, original WAV test cues without external dependencies.
# Isaac registers these via content/sounds.xml at startup.

$out = Join-Path $PSScriptRoot '..\resources\sfx'
New-Item -ItemType Directory -Force -Path $out | Out-Null

function Write-TestTone {
  param(
    [string]$FileName,
    [double]$StartFrequency,
    [double]$EndFrequency,
    [string]$Style = 'Sweep',
    [double]$DurationSeconds = 0.18
  )

  $sampleRate = 22050
  $sampleCount = [int]($sampleRate * $DurationSeconds)
  $dataBytes = $sampleCount * 2
  $path = Join-Path $out $FileName
  $writer = [System.IO.BinaryWriter]::new([System.IO.File]::Open($path, [System.IO.FileMode]::Create))

  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
  $writer.Write([int](36 + $dataBytes))
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVEfmt '))
  $writer.Write([int]16)
  $writer.Write([int16]1)
  $writer.Write([int16]1)
  $writer.Write([int]$sampleRate)
  $writer.Write([int]($sampleRate * 2))
  $writer.Write([int16]2)
  $writer.Write([int16]16)
  $writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
  $writer.Write([int]$dataBytes)

  for ($index = 0; $index -lt $sampleCount; $index++) {
    $time = $index / $sampleRate
    $progress = $index / $sampleCount
    $frequency = $StartFrequency + (($EndFrequency - $StartFrequency) * $progress)
    $envelope = [Math]::Sin([Math]::PI * $progress)
    if ($Style -eq 'TwoNote') {
      $frequency = if ($progress -lt 0.5) { $StartFrequency } else { $EndFrequency }
      $envelope = [Math]::Pow([Math]::Sin(2 * [Math]::PI * $progress), 2)
    }
    $sample = [int16]([Math]::Sin(2 * [Math]::PI * $frequency * $time) * $envelope * 11000)
    $writer.Write($sample)
  }

  $writer.Dispose()
}

Write-TestTone -FileName 'live_ember.wav' -StartFrequency 330 -EndFrequency 660
Write-TestTone -FileName 'live_verdant.wav' -StartFrequency 784 -EndFrequency 1175 -Style TwoNote -DurationSeconds 0.28
Write-TestTone -FileName 'live_void.wav' -StartFrequency 440 -EndFrequency 180
