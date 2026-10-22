import { spawn } from "node:child_process";
import path from "node:path";

// Navicat 16 has no connection URI, and 17/18 do not accept one as a bare
// executable argument. Use the native connection dialog in all three versions.
// Keep credentials on stdin: never interpolate them into PowerShell or argv.
export const navicatSQLServerScript = String.raw`
param($request)
$ErrorActionPreference = 'Stop'
$mutex = $null
$locked = $false
try {
  $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($request.executable)
  if ($version.ProductName -notmatch 'Navicat' -or $version.FileMajorPart -notin @(16, 17, 18)) {
    throw 'unsupported Navicat executable'
  }
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class NavicatControl {
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr SendMessageTimeout(IntPtr handle, uint message, UIntPtr wParam, string value, uint flags, uint timeout, out UIntPtr result);
}
'@
  $mutex = New-Object Threading.Mutex($false, 'Local\JumpServerNavicatSQLServer')
  try { $locked = $mutex.WaitOne(10000) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (-not $locked) { throw 'another Navicat connection is being configured' }
  $deadline = [DateTime]::UtcNow.AddSeconds(70)

  function Get-Nodes($root) {
    return $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
  }
  function Get-Name($element) {
    return ($element.Current.Name -replace '&', '').Trim().TrimEnd(':', [char]0xff1a)
  }
  function Wait-For($probe, $seconds = 12) {
    $until = [DateTime]::UtcNow.AddSeconds($seconds)
    while ([DateTime]::UtcNow -lt $until -and [DateTime]::UtcNow -lt $deadline) {
      $found = & $probe
      if ($null -ne $found -and $found -ne $false) { return $found }
      Start-Sleep -Milliseconds 200
    }
    throw 'Navicat control was not available before the timeout'
  }
  function Invoke-Control($element) {
    $pattern = $null
    if ($element.TryGetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern) -and
        $pattern.Current.ExpandCollapseState -ne [Windows.Automation.ExpandCollapseState]::LeafNode) {
      $pattern.Expand()
    } elseif ($element.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
      $pattern.Invoke()
    } else { throw 'Navicat control does not expose an accessible action' }
  }
  function Find-Action($root, $name) {
    return Get-Nodes $root | Where-Object {
      -not $_.Current.IsOffscreen -and $_.Current.IsEnabled -and
      $_.Current.ControlType -in @([Windows.Automation.ControlType]::Button, [Windows.Automation.ControlType]::SplitButton, [Windows.Automation.ControlType]::MenuItem) -and
      (Get-Name $_) -match $name
    } | Select-Object -First 1
  }
  function Set-Field($dialog, $labelPattern, $value, $password = $false) {
    $nodes = @(Get-Nodes $dialog | Where-Object { -not $_.Current.IsOffscreen -and $_.Current.IsEnabled })
    $edits = @($nodes | Where-Object {
      $_.Current.ControlType -eq [Windows.Automation.ControlType]::Edit -or $_.Current.ClassName -match '^T(Buttoned)?Edit$'
    })
    $candidates = @()
    if ($password) {
      $candidates = @($edits | Where-Object { $_.Current.IsPassword })
      if ($candidates.Count -eq 0) { $labelPattern = '^(Password|密码|密碼|Пароль)$' }
    }
    if (-not $password -or $candidates.Count -eq 0) {
      $labels = @($nodes | Where-Object {
        $_.Current.ControlType -eq [Windows.Automation.ControlType]::Text -and (Get-Name $_) -match $labelPattern
      })
      foreach ($label in $labels) {
        $candidates += @($edits | Where-Object {
          ($password -or -not $_.Current.IsPassword) -and
          ($_.Current.LabeledBy -eq $label -or
            ([Math]::Abs(($_.Current.BoundingRectangle.Top + $_.Current.BoundingRectangle.Height / 2) -
                         ($label.Current.BoundingRectangle.Top + $label.Current.BoundingRectangle.Height / 2)) -le
               [Math]::Max(4, [Math]::Min($_.Current.BoundingRectangle.Height, $label.Current.BoundingRectangle.Height) / 2) -and
             $_.Current.BoundingRectangle.Left -ge $label.Current.BoundingRectangle.Right - 8))
        })
      }
    }
    $candidates = @($candidates | Sort-Object { $_.GetRuntimeId() -join '.' } -Unique)
    if ($candidates.Count -ne 1) { throw 'Navicat connection field is missing or ambiguous' }
    $pattern = $null
    $edit = $candidates[0]
    $written = $false
    if ($edit.TryGetCurrentPattern([Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
      try { $pattern.SetValue([string]$value); $written = $true } catch { }
    }
    if ($written) { return }
    if ($edit.Current.ProcessId -eq $processId -and $edit.Current.NativeWindowHandle -ne 0) {
      # Delphi's TEdit provider can omit ValuePattern. Address only the
      # already identified control in the selected Navicat process.
      $result = [UIntPtr]::Zero
      if ([NavicatControl]::SendMessageTimeout([IntPtr]$edit.Current.NativeWindowHandle, 12, [UIntPtr]::Zero, [string]$value, 2, 1000, [ref]$result) -eq [IntPtr]::Zero) {
        throw 'Navicat connection field rejected text input'
      }
    } else {
      throw 'Navicat connection field is not accessible'
    }
  }
  function Disable-SavePassword($dialog, $required = $true) {
    $checkboxes = @(Get-Nodes $dialog | Where-Object {
      $_.Current.ControlType -eq [Windows.Automation.ControlType]::CheckBox -and
      (Get-Name $_) -match '^(Save password|Remember password|保存密码|儲存密碼|保存密碼|Запомнить пароль|Сохранить пароль)$'
    })
    if ($checkboxes.Count -eq 0 -and -not $required) { return }
    if ($checkboxes.Count -ne 1) { throw 'Navicat save-password control is missing or ambiguous' }
    $pattern = $checkboxes[0].GetCurrentPattern([Windows.Automation.TogglePattern]::Pattern)
    if ($pattern.Current.ToggleState -ne [Windows.Automation.ToggleState]::Off) { $pattern.Toggle() }
    if ($pattern.Current.ToggleState -ne [Windows.Automation.ToggleState]::Off) { throw 'could not disable password saving' }
  }

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
    if ($process) { [Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle) }
  }
  $processId = $main.Current.ProcessId
  $windowPattern = $null
  if ($main.TryGetCurrentPattern([Windows.Automation.WindowPattern]::Pattern, [ref]$windowPattern) -and
      $windowPattern.Current.WindowVisualState -eq [Windows.Automation.WindowVisualState]::Minimized) {
    $windowPattern.SetWindowVisualState([Windows.Automation.WindowVisualState]::Normal)
  }
  function Get-Windows {
    return [Windows.Automation.AutomationElement]::RootElement.FindAll(
      [Windows.Automation.TreeScope]::Children,
      (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty, $processId)))
  }
  $before = @(Get-Windows | ForEach-Object { $_.Current.NativeWindowHandle })
  $connection = Find-Action $main '^(Connection|New connection|连接|新建连接|連線|新增連線|Соединение|Новое соединение)[.\s\u2026]*$'
  if (-not $connection) { throw 'Navicat new-connection action was not found' }
  Invoke-Control $connection
  $server = Wait-For {
    foreach ($window in @(Get-Windows)) {
      $action = Find-Action $window '^SQL\s*Server[.\s\u2026]*$'
      if ($action) { return $action }
    }
  }
  Invoke-Control $server
  $dialog = Wait-For {
    Get-Windows | Where-Object {
      $_.Current.NativeWindowHandle -notin $before -and $_.Current.Name -match 'SQL\s*Server'
    } | Select-Object -First 1
  }
  $authentication = @(Get-Nodes $dialog | Where-Object {
    $_.Current.ControlType -eq [Windows.Automation.ControlType]::ComboBox -and -not $_.Current.IsOffscreen
  } | Where-Object { (Get-Name $_) -match 'SQL\s*Server|Windows|验证|驗證|Authentication' })
  if ($authentication.Count -ne 1) { throw 'Navicat authentication selector is missing or ambiguous' }
  $authentication[0].GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Expand()
  $sqlAuthentication = Wait-For {
    foreach ($window in @(Get-Windows)) {
      $option = Get-Nodes $window | Where-Object {
        $_.Current.ControlType -eq [Windows.Automation.ControlType]::ListItem -and
        -not $_.Current.IsOffscreen -and (Get-Name $_) -match 'SQL\s*Server'
      } | Select-Object -First 1
      if ($option) { return $option }
    }
  }
  $sqlAuthentication.GetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern).Select()
  Set-Field $dialog '^(Connection name|连接名|連線名稱|Имя соединения)$' $request.name
  Set-Field $dialog '^(Host|Host name|Hostname|Server|主机|主機|服务器|伺服器|Хост|Сервер)$' $request.host
  Set-Field $dialog '^(Port|端口|連接埠|Порт)$' $request.port
  Set-Field $dialog '^(Initial database|Database|初始数据库|初始資料庫|数据库|資料庫|Начальная база данных|База данных)$' $request.database
  Set-Field $dialog '^(User name|Username|用户名|使用者名稱|用戶名|Имя пользователя|Пользователь)$' $request.username
  Disable-SavePassword $dialog
  $save = Find-Action $dialog '^(OK|Save|保存|确定|確定|儲存|ОК|Сохранить)$'
  if (-not $save) { throw 'Navicat save action was not found' }
  Invoke-Control $save
  $item = Wait-For {
    Get-Nodes $main | Where-Object {
      $_.Current.ControlType -eq [Windows.Automation.ControlType]::TreeItem -and $_.Current.Name -eq $request.name
    } | Select-Object -First 1
  }
  Invoke-Control $item
  $connected = Wait-For {
    $prompts = @(Get-Windows | Where-Object { $_.Current.NativeWindowHandle -notin $before })
    foreach ($prompt in $prompts) {
      # A different database can prompt in the same Navicat process. Only
      # release the secret to a prompt carrying our unique connection name.
      if (-not $prompt.Current.Name.Contains($request.name) -and
          @(Get-Nodes $prompt | Where-Object { $_.Current.Name.Contains($request.name) }).Count -eq 0) { continue }
      $passwords = @(Get-Nodes $prompt | Where-Object {
        $_.Current.ControlType -eq [Windows.Automation.ControlType]::Edit -and $_.Current.IsPassword -and -not $_.Current.IsOffscreen
      })
      if ($passwords.Count -eq 1) {
        Set-Field $prompt '' $request.password $true
        Disable-SavePassword $prompt $false
        $ok = Find-Action $prompt '^(OK|Connect|确定|確定|连接|連線|ОК|Подключить)$'
        if (-not $ok) { throw 'Navicat password confirmation action was not found' }
        Invoke-Control $ok
      }
    }
    $children = $item.FindAll([Windows.Automation.TreeScope]::Children,
      (New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::TreeItem)))
    foreach ($database in $children) {
      $databaseName = $database.Current.Name
      if (($request.database -and $databaseName -eq $request.database) -or
          (-not $request.database -and $databaseName -and $databaseName -notmatch '^(Loading|Connecting|Databases|加载中|连接中|数据库|資料庫)[.\s\u2026]*$')) {
        return $true
      }
    }
  } 25
  [Console]::Out.WriteLine('OK')
} catch {
  # UI and exception messages can contain connection information. Return a fixed
  # error; leave Navicat's own dialog available for the user to inspect.
  [Console]::Error.WriteLine('Navicat SQL Server setup failed. Check the connection dialog, client version, accessibility and matching privilege levels.')
  exit 1
} finally {
  if ($locked) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}
`;

export function launchNavicatSQLServer(connection, start = spawn, platform = process.platform) {
  if (platform !== "win32") {
    throw new Error("The Windows Navicat SQL Server adapter can only run on Windows");
  }
  if (
    !connection.executable ||
    !connection.name ||
    !connection.host ||
    !connection.username ||
    typeof connection.password !== "string" ||
    !connection.password ||
    !/^\d+$/.test(String(connection.port)) ||
    Number(connection.port) < 1 ||
    Number(connection.port) > 65535
  ) {
    throw new Error("Navicat SQL Server connection information is incomplete or invalid");
  }
  return new Promise<void>((resolve, reject) => {
    const child = start(
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
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      fail();
    }, 90000);
    function fail() {
      clearTimeout(timer);
      reject(
        new Error(
          "Navicat SQL Server connection failed. Check Navicat's dialog, use version 16/17/18, and run both applications at the same privilege level."
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
    child.stdin?.end(`${JSON.stringify({ script: navicatSQLServerScript, connection })}\n`);
  });
}
