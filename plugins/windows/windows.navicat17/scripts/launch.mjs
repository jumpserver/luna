import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";

export const navicatAutoItSteps = JSON.parse(readFileSync(new URL("./autoit-steps.json", import.meta.url), "utf8"));

// This dialog sequence targets Navicat 17.0.13. Other versions are not adapted.
// Do not gate execution on version metadata; use the configured executable.
// Keep credentials on stdin: never interpolate them into PowerShell or argv.
// Same operations, arguments and retry behavior as the upstream handleDB AutoIt branch.
export const navicatStepsScript = String.raw`
function Get-CommandFromArgs($connectMap, [string]$template) {
  foreach ($key in $connectMap.Keys) {
    $placeholder = '{' + $key + '}'
    $position = $template.IndexOf($placeholder, [StringComparison]::Ordinal)
    if ($position -ge 0) {
      $template = $template.Substring(0, $position) + $connectMap[$key] + $template.Substring($position + $placeholder.Length)
    }
  }
  return $template
}
function Invoke-UpstreamSteps($steps, $connectMap) {
  foreach ($step in $steps) {
    Start-Sleep -Milliseconds 300
    switch ($step.cmd) {
      'Wait' {
        [int]$sleepTime = 0
        [void][int]::TryParse($step.type, [ref]$sleepTime)
        $maxRetry = 0
        while ($true) {
          $ret = [NavicatAutoIt]::WaitActive.Invoke($step.element, '', $sleepTime)
          Start-Sleep -Milliseconds ($sleepTime * 100)
          if ($ret -ne 0 -or $maxRetry -gt 30) { break }
          $maxRetry++
        }
      }
      'ControlSend' {
        $maxRetry = 0
        while ($true) {
          $ret = [NavicatAutoIt]::ControlSend.Invoke('', '', $step.element, (Get-CommandFromArgs $connectMap $step.type), 0)
          Start-Sleep -Milliseconds 300
          if ($ret -ne 0 -or $maxRetry -gt 10) { break }
          $maxRetry++
        }
      }
      'ControlSetText' {
        $maxRetry = 0
        while ($true) {
          $ret = [NavicatAutoIt]::ControlSetText.Invoke('', '', $step.element, (Get-CommandFromArgs $connectMap $step.type))
          Start-Sleep -Milliseconds 300
          if ($ret -ne 0 -or $maxRetry -gt 10) { break }
          $maxRetry++
        }
      }
      'ControlClick' {
        $coordinates = $step.type.Split(',')
        [int]$x = 0; [int]$y = 0
        [void][int]::TryParse($coordinates[0], [ref]$x)
        [void][int]::TryParse($coordinates[1], [ref]$y)
        $maxRetry = 0
        while ($true) {
          $ret = [NavicatAutoIt]::ControlClick.Invoke('', '', $step.element, 'left', 1, $x, $y)
          Start-Sleep -Milliseconds 300
          if ($ret -ne 0 -or $maxRetry -gt 10) { break }
          $maxRetry++
        }
      }
      'SendKey' { [NavicatAutoIt]::Send.Invoke($step.element, 0) }
    }
  }
}
`;

export const navicatAutomationScript = String.raw`
param($request)
$ErrorActionPreference = 'Stop'
try {
  $dllName = if ([IntPtr]::Size -eq 8) { 'AutoItX3_x64.dll' } else { 'AutoItX3.dll' }
  $dllPath = Join-Path $request.autoit_dir $dllName
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NavicatAutoIt {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
  [DllImport("kernel32.dll", CharSet=CharSet.Ansi)]
  static extern IntPtr GetProcAddress(IntPtr module, string name);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int RunDelegate(string program, string directory, int show);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int WaitActiveDelegate(string title, string text, int seconds);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int ControlSendDelegate(string title, string text, string control, string value, int mode);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int ControlSetTextDelegate(string title, string text, string control, string value);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate int ControlClickDelegate(string title, string text, string control, string button, int count, int x, int y);
  [UnmanagedFunctionPointer(CallingConvention.StdCall, CharSet=CharSet.Unicode)]
  public delegate void SendDelegate(string keys, int mode);
  public static RunDelegate Run;
  public static WaitActiveDelegate WaitActive;
  public static ControlSendDelegate ControlSend;
  public static ControlSetTextDelegate ControlSetText;
  public static ControlClickDelegate ControlClick;
  public static SendDelegate Send;
  static Delegate Bind(IntPtr module, string name, Type type) {
    IntPtr address = GetProcAddress(module, name);
    if (address == IntPtr.Zero) throw new InvalidOperationException("Missing AutoIt export");
    return Marshal.GetDelegateForFunctionPointer(address, type);
  }
  public static void Load(string path) {
    IntPtr module = LoadLibraryEx(path, IntPtr.Zero, 0x1100);
    if (module == IntPtr.Zero) throw new InvalidOperationException("Cannot load AutoIt");
    Run = (RunDelegate)Bind(module, "AU3_Run", typeof(RunDelegate));
    WaitActive = (WaitActiveDelegate)Bind(module, "AU3_WinWaitActive", typeof(WaitActiveDelegate));
    ControlSend = (ControlSendDelegate)Bind(module, "AU3_ControlSend", typeof(ControlSendDelegate));
    ControlSetText = (ControlSetTextDelegate)Bind(module, "AU3_ControlSetText", typeof(ControlSetTextDelegate));
    ControlClick = (ControlClickDelegate)Bind(module, "AU3_ControlClick", typeof(ControlClickDelegate));
    Send = (SendDelegate)Bind(module, "AU3_Send", typeof(SendDelegate));
  }
}
'@
  [NavicatAutoIt]::Load($dllPath)
  [void][NavicatAutoIt]::Run.Invoke($request.executable, '', 1)
  ${navicatStepsScript}
  $connectMap = @{}
  foreach ($property in $request.connect_info.PSObject.Properties) { $connectMap[$property.Name] = [string]$property.Value }
  Invoke-UpstreamSteps $request.steps $connectMap
  [Console]::Out.WriteLine('OK')
} catch {
  [Console]::Out.WriteLine('ERROR')
  exit 1
}
`;

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
      (value) => typeof value !== "string" || value.includes("\0")
    ) ||
    typeof connection.database !== "string" ||
    connection.database.includes("\0") ||
    String(connection.port).includes("\0")
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
    function fail() {
      child.kill();
      reject(new Error("Navicat automation helper failed"));
    }
    child.on("error", fail);
    child.stdin?.on("error", fail);
    child.stdout?.on("data", (data) => {
      output = (output + data).slice(-256);
    });
    child.on("close", (code) => {
      if (code === 0 && output.trim() === "OK") resolve();
      else fail();
    });
    child.stdin?.end(`${JSON.stringify({ script: navicatAutomationScript, connection: { ...connection, steps: navicatAutoItSteps } })}\n`);
  });
}

// Match Rouse.getName: QueryUnescape turns '+' into a space before replacement.
export function prepareNavicatName(raw) {
  const input = Buffer.from(String(raw || ""));
  const decoded = [];
  for (let index = 0; index < input.length; index++) {
    const byte = input[index];
    if (byte === 43) decoded.push(32);
    else if (byte === 37) {
      const pair = input.subarray(index + 1, index + 3).toString("latin1");
      if (!/^[0-9a-fA-F]{2}$/.test(pair)) return "";
      decoded.push(Number.parseInt(pair, 16));
      index += 2;
    } else decoded.push(byte);
  }
  return Buffer.from(decoded).toString("utf8").replaceAll(" ", "").replace(/[:-]/g, "_");
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
  context = { ...context };
  if (context.source_name !== undefined) context.name = prepareNavicatName(context.source_name);
  if (context.protocol === "oracle") context.dbname = context.username;
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
      connect_info: {
        name: context.name || "", protocol: context.protocol, host: context.host,
        port: String(context.port), username: context.username, value: context.value,
        dbname: context.dbname || "", url: getNavicatURL(context)
      },
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
  } catch {
    // Exception messages and spawn arguments can contain credentials.
    console.error(
      "Navicat connection failed. Check the connection dialog and privilege levels."
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) void main();
