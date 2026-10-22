import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";
import { launchNavicatSQLServer, navicatSQLServerScript } from "../src/apps/navicat-sqlserver.ts";

const connection = {
  executable: String.raw`C:\Program Files\PremiumSoft\Navicat Premium 18\navicat.exe`,
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
  "installed Windows Navicat connects and lists the expected SQL Server database",
  {
    skip: process.platform !== "win32" || !process.env.JMS_TEST_NAVICAT_CONNECTION_FILE,
    timeout: 100000
  },
  async () => {
    const input = JSON.parse(await readFile(process.env.JMS_TEST_NAVICAT_CONNECTION_FILE!, "utf8"));
    await launchNavicatSQLServer({ ...input, name: `JMS_SQLServer_test_${randomUUID()}` });
  }
);

test(
  "PowerShell native adapter parses and its label expressions compile",
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
    foreach ($node in $ast.FindAll({param($n) $n -is [System.Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.Contains('^')},$true)) {
      try { [void][regex]::new($node.Value) } catch { [Console]::Error.WriteLine('Invalid label expression'); exit 1 }
    }
  `
      ],
      { input: navicatSQLServerScript, encoding: "utf8", timeout: 15000 }
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
  await launchNavicatSQLServer(
    connection,
    fakeStart((child, message) => {
      assert.deepEqual(message.connection, connection);
      assert.equal(message.script, navicatSQLServerScript);
      child.stdout.emit("data", "OK\r\n");
      child.emit("close", 0);
    }) as any,
    "win32"
  );
});

test("starting Navicat without confirmed connection is not reported as success", async () => {
  for (const code of [0, 1, null]) {
    await assert.rejects(
      launchNavicatSQLServer(
        connection,
        fakeStart((child) => {
          child.emit("close", code);
        }) as any,
        "win32"
      ),
      /Navicat SQL Server connection failed/
    );
  }
});

test("native launch errors cannot disclose credentials through spawnargs", async () => {
  await assert.rejects(
    launchNavicatSQLServer(
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

test("Navicat adapter rejects invalid inputs before launching an executable", () => {
  const start = () => {
    throw new Error("should not launch");
  };
  for (const override of [{ port: "0" }, { port: "65536" }, { port: "1433;bad" }, { password: "" }, { username: "" }]) {
    assert.throws(
      () => launchNavicatSQLServer({ ...connection, ...override }, start as any, "win32"),
      /incomplete or invalid/
    );
  }
  assert.throws(() => launchNavicatSQLServer(connection, start as any, "darwin"), /only run on Windows/);
});

test("Windows adapter gates supported versions and does not use the clipboard or save passwords", () => {
  assert.ok(navicatSQLServerScript.includes("@(16, 17, 18)"));
  assert.ok(navicatSQLServerScript.includes("Disable-SavePassword $dialog"));
  assert.ok(navicatSQLServerScript.includes("Disable-SavePassword $prompt $false"));
  assert.ok(navicatSQLServerScript.includes("$_.Current.NativeWindowHandle -notin $before"));
  assert.ok(navicatSQLServerScript.includes("$prompt.Current.Name.Contains($request.name)"));
  assert.ok(!/Set-Clipboard|SendKeys|navicat:\/\//i.test(navicatSQLServerScript));
});
