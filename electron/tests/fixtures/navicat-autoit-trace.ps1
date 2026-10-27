$ErrorActionPreference = 'Stop'
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type @'
using System;
using System.Collections.Generic;
public static class NavicatAutoIt {
  public static int Result;
  public static List<object[]> Events = new List<object[]>();
  static int Record(string name, params object[] args) {
    var entry = new object[args.Length + 1]; entry[0] = name; args.CopyTo(entry, 1);
    Events.Add(entry); return Result;
  }
  public static Func<string,string,int,int> WaitActive = (a,b,c) => Record("Wait",a,b,c);
  public static Func<string,string,string,string,int,int> ControlSend = (a,b,c,d,e) => Record("ControlSend",a,b,c,d,e);
  public static Func<string,string,string,string,int> ControlSetText = (a,b,c,d) => Record("ControlSetText",a,b,c,d);
  public static Func<string,string,string,string,int,int,int,int> ControlClick = (a,b,c,d,e,f,g) => Record("ControlClick",a,b,c,d,e,f,g);
  public static Action<string,int> Send = (a,b) => { Record("SendKey",a,b); };
}
'@
[NavicatAutoIt]::Result = $request.result
function Start-Sleep([int]$Milliseconds) { [NavicatAutoIt]::Events.Add([object[]]@('Sleep', $Milliseconds)) }
Invoke-Expression $request.script
$connectMap = @{}
foreach ($property in $request.info.PSObject.Properties) { $connectMap[$property.Name] = [string]$property.Value }
Invoke-UpstreamSteps $request.steps $connectMap
ConvertTo-Json -InputObject ([NavicatAutoIt]::Events.ToArray()) -Depth 10 -Compress
