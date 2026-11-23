import { spawn } from "node:child_process";

const loginScript = String.raw`
# Starts SSMS 19, waits for its "Connect to Server" dialog, fills in the server,
# SQL Server Authentication, the login and the password, and clicks Connect.
#
# SSMS 18 removed the -P option. Started with -S and -U but without a saved password, SSMS
# tries to log in at once and fails, so the connection details are entered in the dialog.
# The controls are found by the names SSMS gives them and are driven with window messages.
$ErrorActionPreference = 'Stop'
$TimeoutSeconds = 120
$Password = ''
$logFile = Join-Path ([System.IO.Path]::GetTempPath()) 'jms-ssms-login.log'

# Window messages and combo box notification codes.
$WM_SETTEXT = 0x000C
$WM_GETTEXT = 0x000D
$WM_GETTEXTLENGTH = 0x000E
$WM_COMMAND = 0x0111
$BM_CLICK = 0x00F5
$CB_GETCOUNT = 0x0146
$CB_GETCURSEL = 0x0147
$CB_GETLBTEXT = 0x0148
$CB_GETLBTEXTLEN = 0x0149
$CB_FINDSTRING = 0x014C
$CB_SETCURSEL = 0x014E
$CBN_SELCHANGE = 1
$CBN_EDITCHANGE = 5
$CBN_EDITUPDATE = 6
$CBN_SELENDOK = 9

$nativeMethods = @'
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern int SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessage")]
public static extern int SendText(IntPtr window, uint message, IntPtr wParam, string text);
[DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessage")]
public static extern int ReadText(IntPtr window, uint message, IntPtr wParam, System.Text.StringBuilder text);
[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
[DllImport("user32.dll")]
public static extern IntPtr GetParent(IntPtr window);
[DllImport("user32.dll")]
public static extern int GetDlgCtrlID(IntPtr window);
[DllImport("user32.dll")]
public static extern bool IsWindowVisible(IntPtr window);
'@

function Write-Log([string]$Message) {
    if ($Password) { $Message = $Message.Replace($Password, '***') }
    $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
    try { Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 } catch { }
}

function Find-Elements($Container, $Property, $Value) {
    $condition = New-Object System.Windows.Automation.PropertyCondition($Property, $Value)
    return $Container.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
}

function Get-TypeName($Element) {
    return ($Element.Current.ControlType.ProgrammaticName -replace '^ControlType\.', '')
}

# Whether the control has a window of its own that is on screen. Hidden controls are listed
# among the elements too, and some kinds of control report "not off screen" while their
# window is hidden.
function Test-Shown($Element) {
    $info = $Element.Current
    $handle = [IntPtr]$info.NativeWindowHandle
    if ($handle -eq [IntPtr]::Zero -or $info.IsOffscreen) { return $false }
    return $native::IsWindowVisible($handle)
}

# The elements under $Container with this automation id that are on screen.
# For a Windows Forms control the automation id is the name of the control.
function Find-ById($Container, [string]$AutomationId) {
    $property = [System.Windows.Automation.AutomationElement]::AutomationIdProperty
    foreach ($element in (Find-Elements $Container $property $AutomationId)) {
        try {
            if (Test-Shown $element) { $element }
        } catch { }
    }
}

# The top-level windows of a process.
function Get-ProcessWindows([int]$ProcessId) {
    $property = [System.Windows.Automation.AutomationElement]::ProcessIdProperty
    $condition = New-Object System.Windows.Automation.PropertyCondition($property, $ProcessId)
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    return $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
}

# The connect dialog is the window around a password box that is on screen.
# Returns nothing while the dialog is not up.
function Find-ConnectDialog([int]$ProcessId) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    foreach ($window in (Get-ProcessWindows $ProcessId)) {
        $box = @(Find-ById $window 'password')[0]
        if (-not $box) { continue }
        $dialog = $window
        $path = @()
        $ancestor = $walker.GetParent($box)
        while ($ancestor -and -not [System.Windows.Automation.Automation]::Compare($ancestor, $root)) {
            $type = Get-TypeName $ancestor
            $path += ('{0}:{1}' -f $type, $ancestor.Current.AutomationId)
            if ($type -eq 'Window') { $dialog = $ancestor; break }
            $ancestor = $walker.GetParent($ancestor)
        }
        return @{ Dialog = $dialog; PasswordBox = $box; Path = ($path -join ' < ') }
    }
    return $null
}

# Waits until the control is on screen and can be used. Gives up at once if two controls
# of this name are on screen, as there is no telling which one the dialog reads.
function Wait-Control($Dialog, [string]$AutomationId) {
    $state = 'was not found'
    for ($i = 0; $i -lt 20; $i++) {
        $elements = @(Find-ById $Dialog $AutomationId)
        if ($elements.Count -eq 0 -and $AutomationId -eq 'connect') {
            # "Connect", or the same in Chinese, in case the button goes by another id.
            $caption = '^(Connect|' + [string][char]0x8FDE + [char]0x63A5 + ')'
            $property = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
            $buttonType = [System.Windows.Automation.ControlType]::Button
            $elements = @(foreach ($candidate in (Find-Elements $Dialog $property $buttonType)) {
                try {
                    if ((Test-Shown $candidate) -and $candidate.Current.Name -match $caption) { $candidate }
                } catch { }
            })
        }
        if ($elements.Count -gt 1) { throw "more than one '$AutomationId' control is shown" }
        if ($elements.Count -eq 1) {
            if ($elements[0].Current.IsEnabled) { return $elements[0] }
            $state = 'is disabled'
        }
        Start-Sleep -Milliseconds 250
    }
    throw "the '$AutomationId' control $state"
}

function Get-Handle($Element) {
    $handle = [IntPtr]$Element.Current.NativeWindowHandle
    if ($handle -eq [IntPtr]::Zero) {
        throw ("the '{0}' control has no window handle" -f $Element.Current.AutomationId)
    }
    return $handle
}

function Get-ControlText($Element) {
    $handle = Get-Handle $Element
    $length = $native::SendMessage($handle, $WM_GETTEXTLENGTH, [IntPtr]::Zero, [IntPtr]::Zero)
    $buffer = New-Object System.Text.StringBuilder ($length + 1)
    [void]$native::ReadText($handle, $WM_GETTEXT, [IntPtr]($length + 1), $buffer)
    return $buffer.ToString()
}

# Tells the dialog about a change in a combo box the way the combo box itself does:
# with WM_COMMAND messages to the window above it.
function Send-ComboNotification([IntPtr]$Combo, [int[]]$Codes) {
    $parent = $native::GetParent($Combo)
    $id = $native::GetDlgCtrlID($Combo) -band 0xFFFF
    foreach ($code in $Codes) {
        [void]$native::SendMessage($parent, $WM_COMMAND, [IntPtr](($code -shl 16) -bor $id), $Combo)
    }
}

# Puts text into a text box or into the text part of a combo box. Returns 1 if it was taken.
function Set-ControlText($Element, [string]$Text) {
    $handle = Get-Handle $Element
    $result = $native::SendText($handle, $WM_SETTEXT, [IntPtr]::Zero, $Text)
    # A text box reports the new text to the dialog by itself. A combo box does that only
    # for typed text, so report it here.
    if ((Get-TypeName $Element) -eq 'ComboBox') {
        Send-ComboNotification $handle $CBN_EDITUPDATE, $CBN_EDITCHANGE
    }
    return $result
}

# The position of "SQL Server Authentication" in the authentication box, -1 if it is not
# there. The entry starts with "SQL Server" in the Chinese SSMS too.
function Find-SqlAuthentication([IntPtr]$Combo) {
    return $native::SendText($Combo, $CB_FINDSTRING, [IntPtr](-1), 'SQL Server')
}

function Get-ComboEntries([IntPtr]$Combo) {
    $count = $native::SendMessage($Combo, $CB_GETCOUNT, [IntPtr]::Zero, [IntPtr]::Zero)
    for ($i = 0; $i -lt $count; $i++) {
        $length = $native::SendMessage($Combo, $CB_GETLBTEXTLEN, [IntPtr]$i, [IntPtr]::Zero)
        if ($length -lt 0) { continue }
        $buffer = New-Object System.Text.StringBuilder ($length + 1)
        [void]$native::ReadText($Combo, $CB_GETLBTEXT, [IntPtr]$i, $buffer)
        $buffer.ToString()
    }
}

function Select-SqlAuthentication($Combo) {
    $handle = Get-Handle $Combo
    $index = Find-SqlAuthentication $handle
    if ($index -lt 0) {
        throw ("no 'SQL Server' entry in the authentication box; entries: " + ((Get-ComboEntries $handle) -join ' | '))
    }
    if ($native::SendMessage($handle, $CB_GETCURSEL, [IntPtr]::Zero, [IntPtr]::Zero) -eq $index) { return }
    [void]$native::SendMessage($handle, $CB_SETCURSEL, [IntPtr]$index, [IntPtr]::Zero)
    # Report the change the way a click on the entry does. The dialog then unlocks the
    # login and password boxes.
    Send-ComboNotification $handle $CBN_SELENDOK, $CBN_SELCHANGE
}

# Says what the dialog shows instead of the wanted server, authentication and login.
# Returns nothing if all three are as wanted.
function Get-Mismatch($Dialog, $Expected) {
    foreach ($id in 'serverInstance', 'userName') {
        $box = @(Find-ById $Dialog $id)[0]
        if (-not $box) { return "the '$id' box is not shown any more" }
        $shown = Get-ControlText $box
        if ($shown.Trim() -ne $Expected[$id]) {
            return ("the '{0}' box shows '{1}' instead of '{2}'" -f $id, $shown, $Expected[$id])
        }
    }
    $box = @(Find-ById $Dialog 'comboBoxAuthentication')[0]
    if (-not $box) { return 'the authentication box is not shown any more' }
    $combo = Get-Handle $box
    $index = Find-SqlAuthentication $combo
    if ($index -lt 0 -or $native::SendMessage($combo, $CB_GETCURSEL, [IntPtr]::Zero, [IntPtr]::Zero) -ne $index) {
        return 'the authentication box does not show SQL Server Authentication'
    }
}

# Lists the open windows of SSMS in the log.
function Write-OpenWindows([int]$ProcessId) {
    try {
        $property = [System.Windows.Automation.AutomationElement]::ControlTypeProperty
        $windowType = [System.Windows.Automation.ControlType]::Window
        foreach ($window in (Get-ProcessWindows $ProcessId)) {
            Write-Log ('  open window "{0}" class={1}' -f $window.Current.Name, $window.Current.ClassName)
            foreach ($inner in (Find-Elements $window $property $windowType)) {
                Write-Log ('    window inside "{0}" class={1}' -f $inner.Current.Name, $inner.Current.ClassName)
            }
        }
    } catch {
        Write-Log ("  the windows could not be listed: {0}" -f $_.Exception.Message)
    }
}

# Lists the controls of the dialog in the log, to tell why a step failed.
function Write-DialogDump($Dialog, [string]$Path) {
    Write-Log ('--- dialog "{0}", password box inside: {1}' -f $Dialog.Current.Name, $Path)
    $listed = 'Button', 'ComboBox', 'Edit', 'CheckBox'
    $count = 0
    $all = [System.Windows.Automation.Condition]::TrueCondition
    foreach ($element in $Dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, $all)) {
        $type = Get-TypeName $element
        if ($listed -notcontains $type) { continue }
        $info = $element.Current
        $handle = [IntPtr]$info.NativeWindowHandle
        $visible = 'n/a'
        if ($handle -ne [IntPtr]::Zero) { $visible = $native::IsWindowVisible($handle) }
        Write-Log ('  {0} id={1} "{2}" enabled={3} offscreen={4} visible={5}' -f $type, $info.AutomationId, $info.Name, $info.IsEnabled, $info.IsOffscreen, $visible)
        $count++
        if ($count -ge 40) { break }
    }
}

$found = $null
try {
    $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
    try { $context = $reader.ReadToEnd() | ConvertFrom-Json }
    catch { throw 'invalid connection JSON' }
    finally { $reader.Dispose() }
    if ($context.protocol -ne 'sqlserver') { throw 'SSMS 19 requires SQL Server' }
    if ($context.command) { throw 'SSMS 19 cannot open command payloads' }
    $Ssms = [string]$context.executable
    $Server = [string]$context.host
    $Port = [string]$context.port
    $User = [string]$context.username
    $Password = [string]$context.value
    $Database = [string]$context.dbname
    $context = $null

    if (-not $Ssms -or -not (Test-Path -LiteralPath $Ssms -PathType Leaf)) { throw "SSMS program not found: $Ssms" }
    if ($Server -notmatch '^[A-Za-z0-9._:-]+$') { throw 'unexpected characters in the server address' }
    if ($Port -notmatch '^[0-9]{1,5}$' -or [int]$Port -lt 1 -or [int]$Port -gt 65535) { throw 'the port must be between 1 and 65535' }
    if ($User -notmatch '^[A-Za-z0-9._@-]+$') { throw 'unexpected characters in the login name' }
    if (-not $Password -or $Password.Contains([string][char]0)) { throw 'the password is empty or contains a null character' }

    $target = "$Server,$Port"

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $Ssms
    $startInfo.Arguments = '-nosplash'
    $startInfo.UseShellExecute = $false
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $version = ''
    try { $version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($Ssms).FileVersion } catch { }
    Write-Log ("=== {0} started SSMS {1} pid={2} server={3} login={4} powershell={5}" -f (Get-Date -Format 'yyyy-MM-dd'), $version, $process.Id, $target, $User, $PSVersionTable.PSVersion)
    if ($Database) { Write-Log 'note: this version does not fill in the database name' }

    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    $native = Add-Type -Namespace JmsSsms -Name Native -MemberDefinition $nativeMethods -PassThru

    # Wait for the connect dialog, and until its password box has stayed the same one for
    # a second: a dialog that is still being built may replace its controls.
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $previous = $null
    $stable = 0
    $lastError = 'none'
    while ($stable -lt 2) {
        if ($process.HasExited) { throw 'SSMS exited before the connect dialog appeared' }
        if ((Get-Date) -ge $deadline) {
            Write-OpenWindows $process.Id
            throw "the connect dialog was not ready within $TimeoutSeconds seconds (last error: $lastError)"
        }
        Start-Sleep -Milliseconds 500
        $found = $null
        try { $found = Find-ConnectDialog $process.Id } catch { $lastError = $_.Exception.Message }
        $same = $false
        if ($found -and $previous) {
            try { $same = [System.Windows.Automation.Automation]::Compare($found.PasswordBox, $previous.PasswordBox) } catch { }
        }
        if ($same) { $stable++ } else { $stable = 0 }
        $previous = $found
    }
    $dialog = $found.Dialog
    Write-Log ('connect dialog "{0}" found' -f $dialog.Current.Name)

    # Fill in the server, the authentication and the login, then look at what the dialog
    # shows: the password must not go to another server or login. A dialog that is still
    # loading may put its remembered values back, so this is tried up to three times.
    $expected = @{ serverInstance = $target; userName = $User }
    for ($attempt = 1; ; $attempt++) {
        [void](Set-ControlText (Wait-Control $dialog 'serverInstance') $target)
        Select-SqlAuthentication (Wait-Control $dialog 'comboBoxAuthentication')
        [void](Set-ControlText (Wait-Control $dialog 'userName') $User)
        $mismatch = Get-Mismatch $dialog $expected
        if (-not $mismatch) { break }
        if ($attempt -ge 3) { throw "$mismatch, the password was not filled in" }
        Write-Log "$mismatch, filling in again"
        Start-Sleep -Milliseconds 500
    }
    Write-Log 'server, authentication and login filled in'

    $passwordBox = Wait-Control $dialog 'password'
    if ((Set-ControlText $passwordBox $Password) -ne 1) {
        throw 'the password box did not take the password'
    }
    Write-Log 'password filled in'

    $connectButton = Wait-Control $dialog 'connect'
    # Look once more, in case the dialog changed the server or login in the meantime.
    $mismatch = Get-Mismatch $dialog $expected
    if ($mismatch) {
        [void](Set-ControlText $passwordBox '')
        throw "$mismatch, the password was taken out again and Connect was not clicked"
    }
    if (-not $native::PostMessage((Get-Handle $connectButton), $BM_CLICK, [IntPtr]::Zero, [IntPtr]::Zero)) {
        throw 'the click on the Connect button could not be sent'
    }
    # ponytail: success means the request was queued, not authenticated; add an SSMS connection-state check if needed.
    Write-Log 'Connect request queued; handoff complete'
} catch {
    Write-Log ("FAILED: {0}" -f $_.Exception.Message)
    if ($found) {
        try {
            Write-DialogDump $found.Dialog $found.Path
        } catch {
            Write-Log ("the dialog could not be listed: {0}" -f $_.Exception.Message)
        }
    }
    exit 1
}
`;

// Forward the connection JSON unchanged; credentials never become command-line arguments.
// ponytail: stay below Windows' 32767-character command line limit; stream the script if it grows.
const child = spawn(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `& {${loginScript}}
exit 0`
  ],
  // Bound native/UI Automation calls too: their blocking time is outside the PowerShell polling loops.
  { windowsHide: true, stdio: ["inherit", "ignore", "ignore"], timeout: 180_000 }
);
child.once("error", () => {
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
