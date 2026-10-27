param([Parameter(Mandatory)][string]$Archive, [Parameter(Mandatory)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$targetRoot = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
[IO.Directory]::CreateDirectory($targetRoot) | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
    $totalBytes = 0L
    $seen = @{}
    foreach ($entry in $zip.Entries) {
        $entryName = $entry.FullName
        if ($entryName.Contains('\') -or $entryName.Contains(':') -or $entryName.StartsWith('/') -or $entryName -match '(^|/)\.\.?(/|$)') { throw 'Unsafe ZIP path.' }
        if (($entry.ExternalAttributes -band 0xF0000000L) -eq 0xA0000000L) { throw 'ZIP links are forbidden.' }
        $resolvedTarget = [IO.Path]::GetFullPath([IO.Path]::Combine($targetRoot, $entryName))
        if (-not $resolvedTarget.StartsWith($targetRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP path escapes extraction directory.' }
        if ($seen.ContainsKey($resolvedTarget)) { throw 'Duplicate ZIP entry.' }
        $seen[$resolvedTarget] = $true
        $totalBytes += $entry.Length
        if ($totalBytes -gt 536870912 -or $zip.Entries.Count -gt 10000) { throw 'ZIP exceeds extraction limits.' }
        if ($entryName.EndsWith('/')) { [IO.Directory]::CreateDirectory($resolvedTarget) | Out-Null; continue }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($resolvedTarget)) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $resolvedTarget, $false)
    }
} finally { $zip.Dispose() }
