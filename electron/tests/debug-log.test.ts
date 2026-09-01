import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  activateDebugLogService,
  DebugLogService,
  electronLog,
  formatDebugLogArg,
  parsePersistedDebugLogEnabled
} from "../src/shared/debug-log.ts";

async function withLogsDir(context: { after: (fn: () => Promise<void>) => void }) {
  const logsDir = await mkdtemp(path.join(os.tmpdir(), "jms-debug-log-"));
  context.after(() => rm(logsDir, { recursive: true, force: true }));
  return logsDir;
}

function fakeConsole() {
  const messages: Array<[string, ...unknown[]]> = [];
  return {
    messages,
    console: {
      log: (...args: unknown[]) => messages.push(["log", ...args]),
      info: (...args: unknown[]) => messages.push(["info", ...args]),
      warn: (...args: unknown[]) => messages.push(["warn", ...args]),
      error: (...args: unknown[]) => messages.push(["error", ...args]),
      debug: (...args: unknown[]) => messages.push(["debug", ...args])
    }
  };
}

test("parses the persisted debugLog setting", () => {
  assert.equal(parsePersistedDebugLogEnabled(`{ "state": { "debugLog": true } }`), true);
  assert.equal(parsePersistedDebugLogEnabled(`{ "state": { "debugLog": false } }`), false);
  assert.equal(parsePersistedDebugLogEnabled("not-json"), false);
});

test("formats errors with their stack instead of empty objects", () => {
  const error = new Error("boom");
  assert.match(formatDebugLogArg(error), /boom/);
  assert.equal(formatDebugLogArg("plain"), "plain");
  assert.equal(formatDebugLogArg({ a: 1 }), '{"a":1}');
});

test("records console output to memory and file only when enabled", async (context) => {
  const logsDir = await withLogsDir(context);
  const { console: host, messages } = fakeConsole();
  const service = new DebugLogService({ logsDir, console: host, maxLines: 5 });
  await service.initialize();

  host.info("ignored before enable");
  service.setEnabled(true);
  host.info("hello", { a: 1 });
  host.warn(new Error("failed"));
  await service.flush();

  const text = service.read();
  assert.match(text, /\[electron\] \[info\] hello \{"a":1\}/);
  assert.match(text, /\[electron\] \[warn\].*failed/);
  assert.equal(await readFile(service.filePath, "utf8"), `${text}\n`);
  assert.equal(
    messages.some((entry) => entry[0] === "info" && entry[1] === "hello"),
    true
  );

  service.setEnabled(false);
  host.info("ignored after disable");
  await service.flush();
  assert.equal(service.read(), text);
});

test("trims to max lines and can clear the log file", async (context) => {
  const logsDir = await withLogsDir(context);
  const { console: host } = fakeConsole();
  const service = new DebugLogService({ logsDir, console: host, maxLines: 3 });
  await service.initialize();
  service.setEnabled(true);
  host.info("one");
  host.info("two");
  host.info("three");
  host.info("four");
  await service.flush();

  const text = service.read();
  assert.equal(text.includes("one"), false);
  assert.match(text, /two/);
  assert.match(text, /four/);
  assert.equal((await readFile(service.filePath, "utf8")).trim().split("\n").length, 3);

  await service.clear();
  assert.equal(service.read(), "");
  assert.equal(await readFile(service.filePath, "utf8"), "");
});

test("reloads previous log lines from disk", async (context) => {
  const logsDir = await withLogsDir(context);
  await writeFile(path.join(logsDir, "jumpserver-debug.log"), "old line\n");
  const service = new DebugLogService({ logsDir, console: fakeConsole().console });
  await service.initialize();
  assert.equal(service.read(), "old line");
});

test("info logs stay silent until the active debug log service is enabled", async (context) => {
  const logsDir = await withLogsDir(context);
  const { console: host } = fakeConsole();
  const service = new DebugLogService({ logsDir, console: host });
  await service.initialize();
  activateDebugLogService(service);

  const originalInfo = console.info;
  const originalWarn = console.warn;
  const captured: unknown[][] = [];
  console.info = (...args: unknown[]) => captured.push(["info", ...args]);
  console.warn = (...args: unknown[]) => captured.push(["warn", ...args]);
  context.after(() => {
    console.info = originalInfo;
    console.warn = originalWarn;
    service.setEnabled(false);
  });

  electronLog.info("hidden");
  electronLog.warn("always");
  assert.equal(
    captured.some((entry) => String(entry[1]).includes("hidden")),
    false
  );
  assert.equal(
    captured.some((entry) => String(entry[1]).includes("always")),
    true
  );

  service.setEnabled(true);
  electronLog.info("visible");
  assert.equal(
    captured.some((entry) => String(entry[1]).includes("visible")),
    true
  );
});
