import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

export const navicatAutoItSteps = JSON.parse(readFileSync(new URL("./autoit-steps.json", import.meta.url), "utf8"));

// This dialog sequence targets Navicat 17.0.13. Other versions are not adapted.
// Do not gate execution on version metadata; use the configured executable.
// Keep credentials on stdin: never interpolate them into PowerShell or argv.
export const navicatAutomationScript = String.raw`
param($request)
$ErrorActionPreference = 'Stop'
$mutex = $null
$locked = $false
$stage = 11
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'native ARM64 AutoIt is unavailable' }
  $dllName = if ([IntPtr]::Size -eq 8) { 'AutoItX3_x64.dll' } else { 'AutoItX3.dll' }
  $dllPath = Join-Path $request.autoit_dir $dllName
  $expected = if ([IntPtr]::Size -eq 8) { 'a9af515ba2eaae9ffc9ef81748d2553f2f85d3dabb1cb0a8887180214c05433a' } else { 'a26fddee7674f74730d28d553220566bac64c4f877c5f33b5be6899202307845' }
  if ((Get-FileHash -LiteralPath $dllPath -Algorithm SHA256).Hash -ne $expected) { throw 'AutoIt binary mismatch' }
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NavicatAutoIt {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Ansi)]
  static extern IntPtr GetProcAddress(IntPtr module, string name);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint process);
  [DllImport("user32.dll")]
  public static extern bool IsChild(IntPtr parent, IntPtr child);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate void ActivateDelegate(string title, string text);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int WaitActiveDelegate(string title, string text, int seconds);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate void SendKeyDelegate(string keys, int mode);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate void InitDelegate();
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate IntPtr GetControlDelegate(string title, string text, string control);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int SetTextDelegate(IntPtr window, IntPtr control, string text);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int ClickDelegate(IntPtr window, IntPtr control, string button, int count, int x, int y);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int SendDelegate(string title, string text, string control, string keys, int mode);
  public static GetControlDelegate GetControl;
  public static SetTextDelegate SetText;
  public static ClickDelegate Click;
  public static SendDelegate Send;
  public static ActivateDelegate Activate;
  public static WaitActiveDelegate WaitActive;
  public static SendKeyDelegate SendKey;
  static Delegate Bind(IntPtr module, string name, Type type) {
    IntPtr address = GetProcAddress(module, name);
    if (address == IntPtr.Zero) throw new InvalidOperationException("Missing AutoIt export");
    return Marshal.GetDelegateForFunctionPointer(address, type);
  }
  public static void Load(string path) {
    IntPtr module = LoadLibraryEx(path, IntPtr.Zero, 0x1100);
    if (module == IntPtr.Zero) throw new InvalidOperationException("Cannot load AutoIt");
    ((InitDelegate)Bind(module, "AU3_Init", typeof(InitDelegate)))();
    GetControl = (GetControlDelegate)Bind(module, "AU3_ControlGetHandle", typeof(GetControlDelegate));
    SetText = (SetTextDelegate)Bind(module, "AU3_ControlSetTextByHandle", typeof(SetTextDelegate));
    Click = (ClickDelegate)Bind(module, "AU3_ControlClickByHandle", typeof(ClickDelegate));
    Send = (SendDelegate)Bind(module, "AU3_ControlSend", typeof(SendDelegate));
    Activate = (ActivateDelegate)Bind(module, "AU3_WinActivate", typeof(ActivateDelegate));
    WaitActive = (WaitActiveDelegate)Bind(module, "AU3_WinWaitActive", typeof(WaitActiveDelegate));
    SendKey = (SendKeyDelegate)Bind(module, "AU3_Send", typeof(SendKeyDelegate));
  }
}
'@
  [NavicatAutoIt]::Load($dllPath)
  $stage = 12
  $mutex = New-Object Threading.Mutex($false, 'Local\JumpServerNavicat')
  try { $locked = $mutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'another Navicat connection is being configured' }
  $deadline = [DateTime]::UtcNow.AddSeconds(70)

  function Wait-For($probe, $seconds = 12) {
    $until = [DateTime]::UtcNow.AddSeconds($seconds)
    while ([DateTime]::UtcNow -lt $until -and [DateTime]::UtcNow -lt $deadline) {
      $found = & $probe
      if ($null -ne $found -and $found -ne $false) { return $found }
      Start-Sleep -Milliseconds 200
    }
    throw 'Navicat control was not available before the timeout'
  }
  $stage = 13
  $processes = @(Get-Process | Where-Object {
    $_.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and
    $_.Path -eq $request.executable -and $_.MainWindowHandle -ne 0
  })
  if ($processes.Count -gt 1) { throw 'multiple Navicat processes use the selected executable' }
  if ($processes.Count -eq 0) {
    $started = Start-Process -FilePath $request.executable -PassThru
  }
  $main = Wait-For {
    $process = Get-Process | Where-Object {
      $_.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and
      $_.Path -eq $request.executable -and $_.MainWindowHandle -ne 0
    } | Select-Object -First 1
    if ($process) {
      $candidate = [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
      if ($candidate.Current.ClassName -eq 'TNavicatMainForm') { return $candidate }
    }
  }
  $processId = $main.Current.ProcessId
  $mainHandle = [IntPtr]$main.Current.NativeWindowHandle
  function Window-Target($handle) { return '[HANDLE:0x' + $handle.ToString('X') + ']' }
  function Active-Window {
    $handle = [NavicatAutoIt]::GetForegroundWindow()
    [uint32]$owner = 0
    [void][NavicatAutoIt]::GetWindowThreadProcessId($handle, [ref]$owner)
    if ($owner -eq $processId) { return $handle }
    return $null
  }
  function Active-Control($selector) {
    $window = Active-Window
    if (-not $window) { return $null }
    $control = [NavicatAutoIt]::GetControl.Invoke((Window-Target $window), '', $selector)
    if ($control -eq [IntPtr]::Zero) { return $null }
    [uint32]$owner = 0
    [void][NavicatAutoIt]::GetWindowThreadProcessId($control, [ref]$owner)
    if ($owner -ne $processId -or -not [NavicatAutoIt]::IsChild($window, $control)) { throw 'wrong control process' }
    return @{ Window = $window; Control = $control }
  }
  $passwordControl = $null
  $index = 0
  foreach ($step in $request.steps) {
    $index++
    $stage = 20 + $index
    Start-Sleep -Milliseconds 300
    switch ($step.cmd) {
      'Wait' {
        if ($main.Current.ClassName -ne 'TNavicatMainForm' -or $step.element -ne '[CLASS:TNavicatMainForm]') { throw 'unexpected main window' }
        [NavicatAutoIt]::Activate.Invoke((Window-Target $mainHandle), '')
        if ([NavicatAutoIt]::WaitActive.Invoke((Window-Target $mainHandle), '', [int]$step.type) -ne 1) { throw 'main window timeout' }
      }
      'SendKey' {
        if ((Active-Window) -ne $mainHandle) { throw 'main window lost focus' }
        [NavicatAutoIt]::SendKey.Invoke($step.element, 0)
      }
      'ControlSend' {
        $target = Wait-For { Active-Control $step.element }
        # getNavicatURL already applies exactly the upstream AutoIt escaping.
        if ([NavicatAutoIt]::Send.Invoke((Window-Target $target.Window), '', $step.element, $request.url, 0) -ne 1) { throw 'control send failed' }
      }
      'ControlClick' {
        $target = Wait-For { Active-Control $step.element }
        $coordinates = $step.type.Split(',')
        # Preserve Go strconv.Atoi's ignored-error result: upstream "1OO" becomes 0.
        [int]$x = 0; [int]$y = 0
        [void][int]::TryParse($coordinates[0], [ref]$x)
        [void][int]::TryParse($coordinates[1], [ref]$y)
        if ($passwordControl -and ($target.Window -ne $passwordControl.Window)) { throw 'password window changed' }
        if ([NavicatAutoIt]::Click.Invoke($target.Window, $target.Control, 'left', 1, $x, $y) -ne 1) { throw 'control click failed' }
        if ($step.element -eq '[CLASS:TButtonedEdit; INSTANCE:1]') { $passwordControl = $target }
      }
      'ControlSetText' {
        $target = Wait-For { Active-Control $step.element }
        if (-not $passwordControl -or $target.Window -ne $passwordControl.Window -or $target.Control -ne $passwordControl.Control) { throw 'password control changed' }
        if ([NavicatAutoIt]::SetText.Invoke($target.Window, $target.Control, [string]$request.password) -ne 1) { throw 'control text failed' }
      }
      default { throw 'unsupported AutoIt step' }
    }
  }
  [Console]::Out.WriteLine('OK')
} catch {
  # UI and exception messages can contain connection information. Return a fixed
  # error; leave Navicat's own dialog available for the user to inspect.
  [Console]::Out.WriteLine('ERROR:' + $stage)
  exit $stage
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}
`;

export const navicatFailureStages = {
  11: "AutoIt DLL loading",
  12: "another connection is being configured",
  13: "Navicat main window",
  21: "step 1: wait for main window",
  22: "step 2: send Ctrl+U",
  23: "step 3: enter URI",
  24: "step 4: click URI confirmation",
  25: "step 5: select connection option",
  26: "step 6: confirm connection option",
  27: "step 7: click password field",
  28: "step 8: enter password",
  29: "step 9: confirm password"
};
function failureCode(output) {
  const code = Number(/^ERROR:(\d+)$/.exec(output.trim())?.[1]);
  return Object.hasOwn(navicatFailureStages, code) ? code : 1;
}
function failureStage(output) {
  return navicatFailureStages[failureCode(output)] || "automation process";
}
export function autoItDirectory(
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
) {
  const packaged = path.join(root, "bin", "autoit");
  return existsSync(packaged) ? packaged : path.join(root, "electron", "assets", "autoit");
}

export function launchNavicatConnection(connection, start = spawn, platform = process.platform) {
  if (platform !== "win32") {
    throw new Error("The Windows Navicat adapter can only run on Windows");
  }
  if (
    [connection.executable, connection.name, connection.host, connection.username, connection.password].some(
      (value) => typeof value !== "string" || !value || value.includes("\0")
    ) ||
    typeof connection.database !== "string" ||
    connection.database.includes("\0") ||
    !/^\d+$/.test(String(connection.port)) ||
    Number(connection.port) < 1 ||
    Number(connection.port) > 65535
  ) {
    throw new Error("Navicat connection information is incomplete or invalid");
  }
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = start(
        path.win32.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe"
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-STA",
          "-EncodedCommand",
          Buffer.from(
            "[Console]::InputEncoding=[Text.UTF8Encoding]::new(); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $message=[Console]::In.ReadLine()|ConvertFrom-Json; & ([ScriptBlock]::Create($message.script)) $message.connection",
            "utf16le"
          ).toString("base64")
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] }
      );
    } catch {
      reject(new Error("Navicat connection failed (automation process)."));
      return;
    }
    let output = "";
    const timer = setTimeout(fail, 90000);
    function fail() {
      clearTimeout(timer);
      child.kill();
      reject(
        Object.assign(
          new Error(
            `Navicat connection failed (${failureStage(output)}). Check the dialog and matching privilege levels.`
          ),
          { exitCode: failureCode(output) }
        )
      );
    }
    child.on("error", fail);
    child.stdin?.on("error", fail);
    child.stdout?.on("data", (data) => {
      output = (output + data).slice(-256);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && output.trim() === "OK") resolve();
      else fail();
    });
    child.stdin?.end(`${JSON.stringify({ script: navicatAutomationScript, connection: { ...connection, steps: navicatAutoItSteps } })}\n`);
  });
}

// Port of go-client/pkg/awaken/awaken_windows.go:getNavicatURL.
export function getNavicatURL(connectInfo) {
  // Go's $ means absolute end of input, unlike JavaScript's final-newline case.
  const matches = /@([^\n]+)$(?![\s\S])/.exec(connectInfo.name || "");
  const name = matches ? matches[1] : (connectInfo.username || "");
  let url = `navicat://conn.${connectInfo.protocol || ""}?Conn.Host=${connectInfo.host || ""}&Conn.Name=${name}&Conn.Port=${connectInfo.port ?? ""}&Conn.Username=${connectInfo.username || ""}`;
  switch (connectInfo.protocol) {
    case "oracle":
      url = url.replace("conn.oracle", "conn.ora");
      url += `&Conn.ServiceName=${connectInfo.dbname || ""}&Conn.ServiceNameType=ServiceName&Conn.ConnectionMode=Basic`;
      break;
    case "sqlserver":
      url = url.replace("conn.sqlserver", "conn.mssql");
      url += `&Conn.AuthenticationType=Default&Conn.InitialDatabase=${connectInfo.dbname || ""}`;
      break;
    case "postgresql":
      url = url.replace("conn.postgresql", "conn.pgsql");
      url += `&Conn.InitialDatabase=${connectInfo.dbname || ""}`;
      break;
  }
  return url.replace(/[\^(){}~]/g, (match) => `{${match}}`);
}

export function launchNavicat(context, start = spawn, platform = process.platform) {
  if (platform !== "win32") throw new Error("The Windows Navicat plugin can only run on Windows");
  if (String(context.command || "").trim()) throw new Error("Navicat cannot open command payloads");
  if (typeof context.executable !== "string" || !path.win32.isAbsolute(context.executable)) {
    throw new Error("Navicat executable path is invalid");
  }
  if (!["mysql", "mariadb", "oracle", "postgresql", "sqlserver"].includes(context.protocol)) {
    throw new Error("Navicat protocol is invalid");
  }
  return launchNavicatConnection(
    {
      executable: context.executable,
      name: context.name || context.username,
      host: context.host,
      port: context.port,
      username: context.username,
      password: context.value,
      database: context.dbname || "",
      protocol: context.protocol,
      url: getNavicatURL(context),
      autoit_dir: autoItDirectory()
    },
    start,
    platform
  );
}

async function main() {
  try {
    process.stdin.setEncoding("utf8");
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    await launchNavicat(JSON.parse(input));
  } catch (error) {
    // Exception messages and spawn arguments can contain credentials.
    console.error(
      "Navicat connection failed. Check the connection dialog and privilege levels."
    );
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) void main();
