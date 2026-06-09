# JumpServer Client plugin launch script (Windows demo)
# Receives connection context via JMS_CONNECT_JSON environment variable.

$ErrorActionPreference = "Stop"

if (-not $env:JMS_CONNECT_JSON) {
    Write-Error "JMS_CONNECT_JSON is not set"
    exit 1
}

try {
    $ctx = $env:JMS_CONNECT_JSON | ConvertFrom-Json
} catch {
    Write-Error "Invalid JMS_CONNECT_JSON: $_"
    exit 1
}

$message = @"
[Hello Terminal Demo]
Protocol : $($ctx.protocol)
Host     : $($ctx.host):$($ctx.port)
User     : $($ctx.username)
Session  : $($ctx.name)

This is a demo plugin. Replace this script with logic that launches your terminal client.
"@

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show($message, "JumpServer Plugin Demo") | Out-Null
exit 0
