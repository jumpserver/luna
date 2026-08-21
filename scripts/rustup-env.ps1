$env:RUSTUP_DIST_SERVER = "https://mirrors.tuna.tsinghua.edu.cn/rustup"
$env:RUSTUP_UPDATE_ROOT = "https://mirrors.tuna.tsinghua.edu.cn/rustup/rustup"
$env:CARGO_NET_GIT_FETCH_WITH_CLI = "true"

$nasmDir = "C:\Program Files\NASM"
if (Test-Path "$nasmDir\nasm.exe") {
    $env:Path = "$nasmDir;$env:Path"
}

Write-Host "Rustup and Cargo mirror environment loaded for this PowerShell session."
