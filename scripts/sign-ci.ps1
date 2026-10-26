# Windows PowerShell 5.1 / PowerShell 7
# Set SIGNPANEL_URL and SIGNPANEL_API_TOKEN in the CI environment before running.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [string]$OutputFile,
    [ValidateRange(1, 3600)][int]$PollSeconds = 5,
    [ValidateRange(1, 1440)][int]$TimeoutMinutes = 60
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

if ([string]::IsNullOrWhiteSpace($env:SIGNPANEL_URL)) {
    throw 'Please set SIGNPANEL_URL to the SignPanel HTTPS address.'
}
if ([string]::IsNullOrWhiteSpace($env:SIGNPANEL_API_TOKEN)) {
    throw 'Please set SIGNPANEL_API_TOKEN in the CI secret store.'
}

$baseUri = $null
if (-not [Uri]::TryCreate($env:SIGNPANEL_URL, [UriKind]::Absolute, [ref]$baseUri) -or
    $baseUri.Scheme -ne 'https' -or $baseUri.UserInfo -or
    $baseUri.AbsolutePath -ne '/' -or $baseUri.Query -or $baseUri.Fragment) {
    throw 'SIGNPANEL_URL must be an HTTPS origin, such as https://sign.example.com.'
}
$apiBase = $baseUri.GetLeftPart([UriPartial]::Authority) + '/api/v1/signs'

$inputItem = Get-Item -LiteralPath $InputFile
if ($inputItem -isnot [IO.FileInfo] -or $inputItem.Length -eq 0 -or
    $inputItem.Extension -notin @('.exe', '.msi', '.dll')) {
    throw 'InputFile must be a nonempty .exe, .msi, or .dll file.'
}
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $OutputFile = Join-Path $inputItem.DirectoryName ($inputItem.BaseName + '-signed' + $inputItem.Extension)
}
$outputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputFile)
if ([string]::Equals($inputItem.FullName, $outputPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputFile must differ from InputFile.'
}

function Read-ApiJson {
    param([System.Net.Http.HttpResponseMessage]$Response)
    $body = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $Response.IsSuccessStatusCode) {
        $message = $body
        try {
            $errorBody = $body | ConvertFrom-Json
            if ($errorBody.message) { $message = $errorBody.message }
        } catch { }
        throw "SignPanel HTTP $([int]$Response.StatusCode): $message"
    }
    return $body | ConvertFrom-Json
}

$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromHours(1)
$client.DefaultRequestHeaders.Authorization =
    [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $env:SIGNPANEL_API_TOKEN)
$tempPath = $null
try {
    $fileStream = [IO.File]::OpenRead($inputItem.FullName)
    $form = New-Object System.Net.Http.MultipartFormDataContent
    try {
        $form.Add(([System.Net.Http.StreamContent]::new($fileStream)), 'file', $inputItem.Name)
        Write-Host "Uploading $($inputItem.Name)..."
        $response = $client.PostAsync($apiBase, $form).GetAwaiter().GetResult()
        try { $job = Read-ApiJson $response } finally { $response.Dispose() }
    } finally {
        $form.Dispose()
        $fileStream.Dispose()
    }

    $jobId = [string]$job.id
    if ($jobId -notmatch '^job_[a-f0-9]{24}$') { throw 'SignPanel returned an invalid job ID.' }
    Write-Host "Job: $jobId"

    $deadline = [DateTime]::UtcNow.AddMinutes($TimeoutMinutes)
    $lastStatus = ''
    while ($true) {
        $response = $client.GetAsync("$apiBase/$jobId").GetAwaiter().GetResult()
        try { $result = Read-ApiJson $response } finally { $response.Dispose() }
        if ($result.status -ne $lastStatus) {
            Write-Host "Status: $($result.status)"
            $lastStatus = $result.status
        }
        if ($result.status -eq 'succeeded') { break }
        if ($result.status -eq 'failed' -or $result.status -eq 'cancelled') {
            throw "Signing $($result.status): $($result.errorCode) $($result.errorMessage)"
        }
        if ([DateTime]::UtcNow -ge $deadline) { throw "Signing timed out after $TimeoutMinutes minutes (job $jobId)." }
        Start-Sleep -Seconds $PollSeconds
    }

    $outputDir = [IO.Path]::GetDirectoryName($outputPath)
    [IO.Directory]::CreateDirectory($outputDir) | Out-Null
    $tempPath = Join-Path $outputDir ('.' + [IO.Path]::GetFileName($outputPath) + '.' + [Guid]::NewGuid().ToString('N') + '.tmp')
    $response = $client.GetAsync("$apiBase/$jobId/download", [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    try {
        if (-not $response.IsSuccessStatusCode) { Read-ApiJson $response | Out-Null }
        $source = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $destination = [IO.File]::Open($tempPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        try { $source.CopyTo($destination) } finally {
            $destination.Dispose()
            $source.Dispose()
        }
    } finally { $response.Dispose() }

    $actualHash = (Get-FileHash -LiteralPath $tempPath -Algorithm SHA256).Hash
    if ($actualHash -ine [string]$result.sha256 -or
        (Get-Item -LiteralPath $tempPath).Length -ne [long]$result.size) {
        throw 'Downloaded artifact does not match the SHA-256 hash or size returned by SignPanel.'
    }
    Move-Item -LiteralPath $tempPath -Destination $outputPath -Force
    $tempPath = $null
    Write-Host "Signed file: $outputPath"
    Write-Host "SHA-256: $actualHash"
} finally {
    if ($tempPath -and (Test-Path -LiteralPath $tempPath)) {
        Remove-Item -LiteralPath $tempPath -Force
    }
    $client.Dispose()
}
