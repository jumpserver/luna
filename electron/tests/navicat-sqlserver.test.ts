import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  launchNavicat,
  launchNavicatSQLServer,
  navicatSQLServerScript
} from "../../plugins/windows/windows.navicat17/scripts/launch.mjs";

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

test("Navicat plugin creates unique SQL Server names and maps the standard script context", async () => {
  const names = [];
  for (let index = 0; index < 2; index++) {
    await launchNavicat(
      {
        ...connection,
        protocol: "sqlserver",
        name: "SQLServer",
        value: connection.password,
        dbname: connection.database
      },
      fakeStart((child, message) => {
        assert.equal(message.connection.password, connection.password);
        assert.equal(message.connection.database, connection.database);
        assert.ok(message.connection.name.startsWith("JMS_SQLServer_"));
        names.push(message.connection.name);
        child.stdout.emit("data", "OK\n");
        child.emit("close", 0);
      }),
      "win32"
    );
  }
  assert.notEqual(names[0], names[1]);
});

test("Navicat plugin preserves URL launches for other databases and rejects arbitrary URLs", async () => {
  for (const protocol of ["mysql", "mariadb", "oracle", "postgresql"]) {
    const aliases = { mariadb: "mysql", oracle: "ora", postgresql: "pgsql" };
    const url = `navicat://conn.${aliases[protocol] || protocol}?Conn.Name=example`;
    const result = launchNavicat(
      { ...connection, protocol, url },
      (executable, args, options) => {
        assert.equal(executable, connection.executable);
        assert.deepEqual(args, [url]);
        assert.equal(options.detached, true);
        const child = Object.assign(new EventEmitter(), { unref() {} });
        setImmediate(() => child.emit("spawn"));
        return child;
      },
      "win32"
    );
    await result;
  }
  assert.throws(
    () => launchNavicat({ ...connection, protocol: "mysql", url: "file:///untrusted" }, undefined, "win32"),
    /URL is invalid/
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

test("Navicat script entry rejects invalid stdin without disclosing connection details", () => {
  const scriptPath = fileURLToPath(
    new URL("../../plugins/windows/windows.navicat17/scripts/launch.mjs", import.meta.url)
  );
  const result = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify({ ...connection, protocol: "sqlserver", port: 0, value: connection.password }),
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
