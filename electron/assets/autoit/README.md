# AutoItX Windows resources

These unmodified third-party binaries come from [jumpserver/client](https://github.com/jumpserver/client/tree/7b03884d54994600391fda1ab1717f2da43aea28/go-client/pkg/autoit), pinned to commit `7b03884d54994600391fda1ab1717f2da43aea28`.
AutoItX remains subject to its vendor's license; the upstream repository's license must not be assumed to relicense these binaries. See [AutoIt](https://www.autoitscript.com/site/autoit/).

| File | Calling process architecture | SHA-256 |
| --- | --- | --- |
| AutoItX3.dll | Windows x86 | a26fddee7674f74730d28d553220566bac64c4f877c5f33b5be6899202307845 |
| AutoItX3_x64.dll | Windows x64 | a9af515ba2eaae9ffc9ef81748d2553f2f85d3dabb1cb0a8887180214c05433a |

There is no ARM64 DLL in this upstream directory. Choose by the architecture of the process loading the DLL, not the target application's architecture. A native ARM64 process cannot load either file directly.

## Resource paths

- Source/development: `electron/assets/autoit/`.
- Windows staging: `.electron-resources/bin/autoit/`.
- Windows installed application: `process.resourcesPath/bin/autoit/`.

`scripts/prepare-electron-resources.mjs` copies this directory only on Windows. Electron Forge's existing `bin` extra resource includes it outside `app.asar`. macOS and Linux builds do not include it.

The Navicat Node plugin loads these DLLs through a PowerShell C# bridge for Navicat 17.0.13. It executes the nine operations in `plugins/windows/windows.navicat17/scripts/autoit-steps.json` in order. This is an exact copy of `launch.steps` fetched from the upstream `dev` connect.json on 2026-10-26 (Git blob `9e5f50a8d22a792108533e73578eba9c8592af89`); it is bundled locally, not fetched at runtime. There is no version gate or other-version compatibility branch. SSMS is unchanged.

Exit codes 21–29 identify the failing step; 11–13 identify DLL loading, serialization and main-window discovery failures. Success means the nine-step autofill completed, not that database authentication was independently verified. No extra checkbox toggles or connection-tree checks are inserted. Password text stays on stdin and is written literally to the clicked password control; controls are restricted to the selected Navicat process.

## Upstream calling sequence

See [goautoit.go](https://github.com/jumpserver/client/blob/7b03884d54994600391fda1ab1717f2da43aea28/go-client/pkg/autoit/goautoit.go), [awaken_windows.go](https://github.com/jumpserver/client/blob/7b03884d54994600391fda1ab1717f2da43aea28/go-client/pkg/awaken/awaken_windows.go), and [Navicat steps](https://github.com/jumpserver/client/blob/7b03884d54994600391fda1ab1717f2da43aea28/plugins/windows/windows.navicat17/connect.json).

1. The Windows Go helper loads the matching DLL beside its executable using `syscall.NewLazyDLL`, then resolves `AU3_Run`, `AU3_WinWaitActive`, `AU3_ControlSend`, `AU3_ControlSetText`, `AU3_ControlClick`, and `AU3_Send` (plus focus/text/activation helpers).
2. Navicat starts without a URI argument. The step runner waits for `TNavicatMainForm`, sends Ctrl+U, enters the URI in `TTextHintMemo`, selects the connection option, fills the password in `TButtonedEdit`, and confirms.
3. The URI builder supplies Oracle service name, SQL Server authentication/initial database, and PostgreSQL initial database fields. Password entry is a separate control operation.
4. SSMS uses configured AutoIt steps to fill its connection dialog. RealVNC also uses a dedicated AutoIt authentication path in the upstream Go code.

The upstream coordinate `1OO,10` contains letters, not zeros. The original Go executor ignores `strconv.Atoi` errors and uses x=0, y=10. The runner preserves both the JSON and that behavior. It also retains the click on the password edit before setting text and the final button instance 2. `SendKey` uses AutoIt's `AU3_Send`; URI text uses `AU3_ControlSend`, with exactly the upstream `getNavicatURL` escaping of `^(){}~` applied once. Connection names use the suffix matched by `@(.+)$`, falling back to username. URI parameters are concatenated in upstream order without URL encoding or UUID names. The runner checks foreground-process ownership, bounds waits and stops on failure rather than continuing with later actions.

Windows GUI acceptance is still required for Navicat 17.0.13. The opt-in test below checks completion of these steps; inspect the resulting connection in Navicat to confirm authentication.

## Verify downloaded bytes

From this directory:

```sh
shasum -a 256 AutoItX3.dll AutoItX3_x64.dll
```

Compare with the table above. Binary checks and resource staging do not establish Windows DLL loading or Navicat connection success.

To run the opt-in Windows acceptance test, set `JMS_TEST_NAVICAT_CONNECTION_FILE` to a private JSON file containing `executable`, `protocol`, `host`, `port`, `username`, `password`, and `database`, then run `node --import tsx --test tests/navicat-sqlserver.test.ts` from `electron/`. The file must contain a valid JumpServer gateway session; this test opens a real connection.
