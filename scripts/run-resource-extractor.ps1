[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path $_ -PathType Leaf })]
    [string]$ExtractorPath,

    [string]$LogPath = (Join-Path $PSScriptRoot '..\ResourceExtractor_log.txt'),

    [ValidateRange(1, 1000000)]
    [int]$MaxLogLines = 1000,

    [Parameter(ValueFromRemainingArguments)]
    [string[]]$ExtractorArguments
)

$resolvedLogPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($LogPath)
$logDirectory = Split-Path -Parent $resolvedLogPath
if ($logDirectory) {
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
}

# Retain the newest entries before appending a new extraction run. This keeps
# repeated runs from causing an ever-growing generated log.
if (Test-Path -LiteralPath $resolvedLogPath) {
    Get-Content -LiteralPath $resolvedLogPath -Tail $MaxLogLines |
        Set-Content -LiteralPath $resolvedLogPath
}
else {
    New-Item -ItemType File -Path $resolvedLogPath | Out-Null
}

& $ExtractorPath @ExtractorArguments 2>&1 |
    ForEach-Object {
        $line = $_.ToString()
        Write-Output $line
        Add-Content -LiteralPath $resolvedLogPath -Value $line
    }
$extractorExitCode = $LASTEXITCODE

# A run can itself emit more than the cap, so enforce the limit after it ends.
Get-Content -LiteralPath $resolvedLogPath -Tail $MaxLogLines |
    Set-Content -LiteralPath $resolvedLogPath

exit $extractorExitCode
