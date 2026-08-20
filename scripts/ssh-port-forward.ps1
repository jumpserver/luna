$ErrorActionPreference = "Stop"

$sshTarget = "guang@192.168.31.169"
$ports = 5050, 8080, 2222, 8082, 3306, 5432

$sshArguments = @(
    "-N"
    "-o", "ExitOnForwardFailure=yes"
    "-o", "ServerAliveInterval=30"
    "-o", "ServerAliveCountMax=3"
)

foreach ($port in $ports) {
    $sshArguments += "-L"
    $sshArguments += "${port}:127.0.0.1:${port}"
}

$sshArguments += $sshTarget

Write-Host "Connecting to $sshTarget; forwarding ports: $($ports -join ', ')"
Write-Host "Press Ctrl+C to stop port forwarding."

& ssh @sshArguments

if ($LASTEXITCODE -ne 0) {
    throw "SSH exited with code: $LASTEXITCODE"
}
