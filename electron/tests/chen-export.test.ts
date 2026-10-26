import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chenExportTarget, saveChenDownload } from "../src/desktop/chen-export";

test("download tickets go only to a registered Chen connector and fixed route", () => {
  const origins = new Set(["https://chen.example.test"]);
  const url = "jms-app://app/chen/api/v1/downloads?__jms_chen_endpoint=https%3A%2F%2Fchen.example.test";
  assert.equal(chenExportTarget(url, origins), "https://chen.example.test/chen/api/v1/downloads");
  for (const bad of [
    url.replace("downloads", "sessions"),
    url.replace("chen.example", "evil.example"),
    url.replace("jms-app:", "https:"),
    `${url}#fragment`
  ])
    assert.throws(() => chenExportTarget(bad, origins));
});

test("native streaming writes all chunks without collecting the body into a Blob", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chen-export-test-"));
  try {
    let chunk = 0;
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          if (chunk++ < 32) controller.enqueue(new TextEncoder().encode("中文😀".repeat(1024)));
          else controller.close();
        }
      })
    );
    for (const name of ["blob", "arrayBuffer"])
      Object.defineProperty(response, name, {
        value: async () => {
          throw new Error("must not buffer");
        }
      });
    const destination = path.join(directory, "result.csv");
    await saveChenDownload(response, destination);
    assert.equal(await readFile(destination, "utf8"), "中文😀".repeat(32 * 1024));
    assert.deepEqual(await readdir(directory), ["result.csv"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("interrupted download removes partial data and preserves an existing destination", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "chen-export-test-"));
  try {
    const destination = path.join(directory, "result.xlsx");
    await writeFile(destination, "previous complete file");
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          setTimeout(() => controller.error(new Error("interrupted")), 10);
        }
      })
    );
    await assert.rejects(saveChenDownload(response, destination), /interrupted/);
    assert.equal(await readFile(destination, "utf8"), "previous complete file");
    assert.deepEqual(await readdir(directory), ["result.xlsx"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
