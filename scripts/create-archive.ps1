param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Archive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($Source, $Archive, [IO.Compression.CompressionLevel]::Optimal, $false)
