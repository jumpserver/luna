import assert from "node:assert/strict";
import test from "node:test";
import { ClipboardHistoryService } from "../src/desktop/clipboard-history.ts";

test("captures changed text, deduplicates exactly, and preserves deletion until the clipboard changes", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  let text = "first";
  const service = new ClipboardHistoryService(async () => text);
  context.after(() => service.stop());
  service.start();
  const first = (await service.read())[0];
  text = "second";
  context.mock.timers.tick(500);
  await service.capture();
  text = "first";
  context.mock.timers.tick(500);
  assert.deepEqual((await service.read())[0], { ...first, copiedAt: 2000 });
  assert.deepEqual(
    (await service.read()).map((item) => item.text),
    ["first", "second"]
  );

  service.remove(first.id);
  context.mock.timers.tick(500);
  assert.deepEqual(
    (await service.read()).map((item) => item.text),
    ["second"]
  );
  text = "first ";
  assert.deepEqual(
    (await service.read()).map((item) => item.text),
    ["first ", "second"]
  );
  await service.clear();
  context.mock.timers.tick(500);
  assert.deepEqual(await service.read(), []);
  text = " \t\r\n\u00a0\u3000";
  assert.deepEqual(await service.read(), []);
  text = " \tfirst line  \r\n second line \n";
  assert.equal((await service.read())[0].text, text);
});

test("limits item count, UTF-8 item size, and total stored bytes", async (context) => {
  let text = "";
  const service = new ClipboardHistoryService(async () => text);
  context.after(() => service.stop());
  service.start();
  await service.capture();
  for (let index = 0; index < 101; index++) {
    text = String(index);
    await service.capture();
  }
  assert.equal((await service.read()).length, 100);
  assert.equal((await service.read()).at(-1)?.text, "1");

  await service.clear();
  text = "界".repeat(90_000);
  assert.deepEqual(await service.read(), []);
  text = "x".repeat(256 * 1024 + 1);
  assert.deepEqual(await service.read(), []);
  for (let index = 0; index < 17; index++) {
    text = String(index).padStart(256 * 1024, "x");
    await service.capture();
  }
  assert.equal((await service.read()).length, 16);
  assert.equal(
    (await service.read()).reduce((total, item) => total + Buffer.byteLength(item.text), 0),
    4 * 1024 * 1024
  );
});

test("polls once per interval, pauses without losing history, retries errors, and stops", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let reads = 0;
  let text = "initial";
  let fails = false;
  const service = new ClipboardHistoryService(async () => {
    reads++;
    if (fails) throw new Error("Clipboard unavailable");
    return text;
  });
  context.after(() => service.stop());
  service.start();
  service.start();
  await service.capture();
  context.mock.timers.tick(500);
  await service.capture();
  assert.equal(reads, 2);
  service.setEnabled(false);
  text = "paused";
  context.mock.timers.tick(1000);
  assert.deepEqual(service.status(), { enabled: false });
  assert.equal((await service.read())[0].text, "initial");
  assert.equal(reads, 2);
  fails = true;
  service.setEnabled(true);
  await service.capture();
  assert.equal(reads, 3);
  fails = false;
  text = "resumed";
  context.mock.timers.tick(500);
  assert.equal((await service.read())[0].text, "resumed");
  service.stop();
  const stoppedReads = reads;
  context.mock.timers.tick(1000);
  await service.read();
  assert.equal(reads, stoppedReads);
});

test("shares a pending native read and discards it when paused or stopped", async (context) => {
  let resolveRead!: (text: string) => void;
  let reads = 0;
  const service = new ClipboardHistoryService(() => {
    reads++;
    return new Promise((resolve) => {
      resolveRead = resolve;
    });
  });
  context.after(() => service.stop());
  service.start();
  const history = service.read();
  assert.equal(reads, 1);
  service.setEnabled(false);
  resolveRead("paused content");
  assert.deepEqual(await history, []);
  service.setEnabled(true);
  const pending = service.capture();
  assert.equal(reads, 2);
  service.stop();
  resolveRead("stopped content");
  await pending;
  assert.deepEqual(await service.read(), []);
});
