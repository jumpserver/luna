import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchNavicat,
  getNavicatURL,
  launchNavicatConnection,
  autoItDirectory,
  navicatAutoItSteps,
  navicatAutomationScript
} from "../../plugins/windows/windows.navicat17/scripts/launch.mjs";

const connection = {
  executable: String.raw`C:\Program Files\PremiumSoft\Navicat Premium 17\navicat.exe`,
  name: "JMS_SQLServer_test",
  host: "gateway.example.test",
  port: "5525",
  username: "11111111-1111-1111-1111-111111111111",
  password: `secret with \" ' $() \\ * 中文\r\nsecond line`,
  database: "database with spaces"
};

// Opt-in Windows acceptance check. Supply a private JSON file with executable,
// host, port, username, password and database; no credentials enter test argv.
test(
  "installed Windows Navicat completes the upstream nine-step autofill",
  {
    skip: process.platform !== "win32" || !process.env.JMS_TEST_NAVICAT_CONNECTION_FILE,
    timeout: 100000
  },
  async () => {
    const input = JSON.parse(await readFile(process.env.JMS_TEST_NAVICAT_CONNECTION_FILE!, "utf8"));
    await launchNavicat({
      ...input,
      protocol: input.protocol || "sqlserver",
      value: input.password,
      dbname: input.database
    });
  }
);

test(
  "PowerShell adapter parses and its native bridge and label expressions compile",
  {
    skip: process.platform !== "win32" && !process.env.JMS_TEST_PWSH_EXECUTABLE
  },
  () => {
    const result = spawnSync(
      process.env.JMS_TEST_PWSH_EXECUTABLE || "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        String.raw`
    $tokens=$null; $errors=$null
    $ast=[System.Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors)
    if ($errors.Count) { $errors|ForEach-Object{[Console]::Error.WriteLine($_.ToString())}; exit 1 }
    foreach ($node in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.Contains('public static class Navicat')},$true)) {
      try { Add-Type -TypeDefinition $node.Value -ErrorAction Stop } catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }
    }
    foreach ($node in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.Contains('^')},$true)) {
      try { [void][regex]::new($node.Value) } catch { [Console]::Error.WriteLine('Invalid label expression'); exit 1 }
    }
  `
      ],
      { input: navicatAutomationScript, encoding: "utf8", timeout: 15000 }
    );
    assert.equal(result.status, 0, result.stderr);
  }
);

function fakeStart(onInput) {
  return (executable, args, options) => {
    assert.match(executable, /\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i);
    assert.ok(args.includes("-STA"));
    assert.ok(args.join(" ").length < 2048, "must not exceed the Windows command-line limit");
    assert.ok(!args.join(" ").includes(connection.password));
    assert.ok(!args.join(" ").includes(connection.username));
    assert.ok(!args.join(" ").includes(connection.executable));
    assert.equal(options.env, undefined, "credentials must not enter the process environment");
    assert.equal(options.windowsHide, true);
    const child: any = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.kill = () => {};
    let input = "";
    child.stdin.on("data", (value) => {
      input += value;
    });
    child.stdin.on("finish", () => onInput(child, JSON.parse(input)));
    return child;
  };
}

test("Navicat helper receives literal credentials over stdin, not executable arguments", async () => {
  await launchNavicatConnection(
    connection,
    fakeStart((child, message) => {
      assert.deepEqual(message.connection, { ...connection, steps: navicatAutoItSteps });
      assert.equal(message.script, navicatAutomationScript);
      child.stdout.emit("data", "OK\r\n");
      child.emit("close", 0);
    }) as any,
    "win32"
  );
});

test("Navicat URL follows the upstream naming, protocol fields and escaping exactly", () => {
  const base = { name: "asset@name", protocol: "mysql", host: "gateway", port: "5525", username: "token", dbname: "db" };
  assert.equal(getNavicatURL(base), "navicat://conn.mysql?Conn.Host=gateway&Conn.Name=name&Conn.Port=5525&Conn.Username=token");
  for (const name of ["asset", "asset@", "asset@name\n", ""]) {
    assert.equal(getNavicatURL({ ...base, name }), "navicat://conn.mysql?Conn.Host=gateway&Conn.Name=token&Conn.Port=5525&Conn.Username=token");
  }
  assert.equal(getNavicatURL({ ...base, name: "a@b@c" }), "navicat://conn.mysql?Conn.Host=gateway&Conn.Name=b@c&Conn.Port=5525&Conn.Username=token");
  assert.equal(getNavicatURL({ ...base, name: "a@中文 &+=!#% ^(){}~" }), "navicat://conn.mysql?Conn.Host=gateway&Conn.Name=中文 &+=!#% {^}{(}{)}{{}{}}{~}&Conn.Port=5525&Conn.Username=token");
  assert.equal(getNavicatURL({ ...base, protocol: "mariadb" }), "navicat://conn.mariadb?Conn.Host=gateway&Conn.Name=name&Conn.Port=5525&Conn.Username=token");
  assert.equal(getNavicatURL({ ...base, protocol: "oracle" }), "navicat://conn.ora?Conn.Host=gateway&Conn.Name=name&Conn.Port=5525&Conn.Username=token&Conn.ServiceName=db&Conn.ServiceNameType=ServiceName&Conn.ConnectionMode=Basic");
  assert.equal(getNavicatURL({ ...base, protocol: "sqlserver" }), "navicat://conn.mssql?Conn.Host=gateway&Conn.Name=name&Conn.Port=5525&Conn.Username=token&Conn.AuthenticationType=Default&Conn.InitialDatabase=db");
  assert.equal(getNavicatURL({ ...base, protocol: "postgresql" }), "navicat://conn.pgsql?Conn.Host=gateway&Conn.Name=name&Conn.Port=5525&Conn.Username=token&Conn.InitialDatabase=db");
});

test("every database passes the upstream URI unchanged to AutoIt and keeps the password separate", async () => {
  for (const protocol of ["mysql", "mariadb", "oracle", "postgresql", "sqlserver"]) {
    const context = { ...connection, protocol, name: "asset@name & 中文^(){}~+!#", value: connection.password, dbname: connection.database, url: "file:///ignored" };
    await launchNavicat(context, fakeStart((child, message) => {
      assert.equal(message.connection.url, getNavicatURL(context));
      assert.equal(message.connection.password, connection.password);
      assert.equal(message.connection.database, connection.database);
      assert.ok(!message.connection.url.includes(connection.password));
      assert.equal(message.connection.autoit_dir, autoItDirectory());
      child.stdout.emit("data", "OK\n");
      child.emit("close", 0);
    }), "win32");
  }
  assert.ok(!navicatAutomationScript.includes("[regex]::Replace"), "do not escape the URI twice");
  assert.throws(() => launchNavicat({ ...connection, protocol: "unknown" }, undefined, "win32"), /protocol is invalid/);
});

test("AutoIt resources resolve from source and packaged layouts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "jms-autoit-"));
  try {
    assert.equal(autoItDirectory(root), path.join(root, "electron/assets/autoit"));
    await mkdir(path.join(root, "bin/autoit"), { recursive: true });
    assert.equal(autoItDirectory(root), path.join(root, "bin/autoit"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("automation failures preserve only allowlisted stage codes", async () => {
  for (const [output, expectedCode] of [
    ["ERROR:23", 23],
    ["ERROR:28", 28],
    ["ERROR:999", 1],
    [connection.password, 1]
  ] as const) {
    await assert.rejects(
      launchNavicatConnection(
        connection,
        fakeStart((child) => {
          child.stdout.emit("data", output);
          child.emit("close", 1);
        }),
        "win32"
      ),
      (error: any) => {
        assert.equal(error.exitCode, expectedCode);
        assert.ok(!error.message.includes(connection.password));
        if (expectedCode === 23) assert.match(error.message, /step 3: enter URI/);
        return true;
      }
    );
  }
});

test("starting Navicat without completing the autofill is not reported as success", async () => {
  for (const code of [0, 1, null]) {
    await assert.rejects(
      launchNavicatConnection(
        connection,
        fakeStart((child) => {
          child.emit("close", code);
        }) as any,
        "win32"
      ),
      /Navicat connection failed/
    );
  }
});

test("native launch errors cannot disclose credentials through spawnargs", async () => {
  await assert.rejects(
    launchNavicatConnection(
      connection,
      fakeStart((child) => {
        child.emit("error", new Error(connection.password));
      }) as any,
      "win32"
    ),
    (error: Error) => {
      assert.ok(!error.message.includes(connection.password));
      return true;
    }
  );
});

test("Navicat script entry rejects invalid stdin without disclosing connection details", () => {
  const scriptPath = fileURLToPath(
    new URL("../../plugins/windows/windows.navicat17/scripts/launch.mjs", import.meta.url)
  );
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify({
      ...connection,
      protocol: "sqlserver",
      port: 0,
      value: connection.password
    }),
    encoding: "utf8",
    timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Navicat connection failed/);
  for (const value of [connection.password, connection.username, connection.host]) {
    assert.ok(!result.stderr.includes(value));
  }
  assert.throws(
    () => launchNavicat({ ...connection, command: "unrelated command" }, undefined, "win32"),
    /cannot open command/
  );
});

test("Navicat adapter rejects invalid inputs before launching an executable", () => {
  const start = () => {
    throw new Error("should not launch");
  };
  for (const override of [
    { port: "0" },
    { port: "65536" },
    { port: "1433;bad" },
    { password: "" },
    { username: "" },
    { password: "a\0b" },
    { database: "a\0b" }
  ]) {
    assert.throws(
      () => launchNavicatConnection({ ...connection, ...override }, start as any, "win32"),
      /incomplete or invalid/
    );
  }
  assert.throws(() => launchNavicatConnection(connection, start as any, "darwin"), /only run on Windows/);
});

test("autofill steps exactly match the upstream connect.json fetched on 2026-10-26", () => {
  // Freeze the exact cmd/type/element sequence, including the upstream 1OO typo.
  assert.equal(createHash("sha256").update(JSON.stringify(navicatAutoItSteps)).digest("hex"), "b0ca609f598267cc181996824d0fdbf7f6c3cc69c38b83c7960513160c300278");
  assert.equal(navicatAutoItSteps.length, 9);
  assert.equal(navicatAutoItSteps[5].type, "1OO,10");
  assert.equal(navicatAutoItSteps[8].element, "[CLASS:TButton; INSTANCE:2]");
});

test("17.0.13 runner executes the step table without version gates or extra UI actions", () => {
  assert.ok(!/FileVersionInfo|FileMajorPart|FileMinorPart|FileBuildPart/.test(navicatAutomationScript));
  assert.ok(navicatAutomationScript.includes("foreach ($step in $request.steps)"));
  assert.ok(!/Disable-SavePassword|Find-Connection|TreeItem|Find-Action/.test(navicatAutomationScript));
  for (const api of ["AU3_WinWaitActive", "AU3_Send", "AU3_ControlSend", "AU3_ControlSetTextByHandle", "AU3_ControlClickByHandle"])
    assert.ok(navicatAutomationScript.includes(api));
  assert.ok(navicatAutomationScript.includes("GetWindowThreadProcessId"));
  assert.ok(navicatAutomationScript.includes("::IsChild"));
  assert.ok(navicatAutomationScript.includes("Get-FileHash -LiteralPath $dllPath"));
  assert.ok(navicatAutomationScript.includes("[void][int]::TryParse($coordinates[0], [ref]$x)"));
});

test("synchronous native failures are sanitized", async () => {
  await assert.rejects(
    launchNavicatConnection(
      connection,
      () => {
        throw new Error(connection.password);
      },
      "win32"
    ),
    (error: Error) => {
      assert.ok(!error.message.includes(connection.password));
      return true;
    }
  );
});

test("automation timeout terminates the helper and rejects the connection", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let killed = 0;
  const pending = launchNavicatConnection(
    connection,
    fakeStart((child) => {
      child.kill = () => {
        killed++;
      };
    }),
    "win32"
  );
  const rejected = assert.rejects(pending, /Navicat connection failed/);
  // Let the stdin stream finish before advancing the helper deadline.
  await new Promise(setImmediate);
  context.mock.timers.tick(90000);
  await rejected;
  assert.equal(killed, 1);
});
