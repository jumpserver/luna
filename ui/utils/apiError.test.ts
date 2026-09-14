import { describe, expect, it } from "vitest";
import { compactApiErrorBody } from "./apiError";

describe("compactApiErrorBody", () => {
  it("keeps only a short HTML title without dumping scripts, styles or traceback", () => {
    const body = `<!DOCTYPE html><title>Server &amp; Proxy Error</title><style>css</style><script>js</script>${"<pre>traceback</pre>".repeat(
      1000
    )}`;
    expect(compactApiErrorBody(body)).toBe("HTML response omitted: Server & Proxy Error");
  });

  it("falls back to the heading or an omission marker", () => {
    expect(compactApiErrorBody("<h1>Internal <b>Server</b> Error</h1>")).toBe(
      "HTML response omitted: Internal Server Error"
    );
    expect(compactApiErrorBody("partial error page", "text/html; charset=utf-8")).toBe("HTML response omitted");
  });

  it("bounds plain-text errors and collapses line breaks", () => {
    expect(compactApiErrorBody("  upstream\n unavailable  ")).toBe("upstream unavailable");
    expect(compactApiErrorBody("x".repeat(2000))).toHaveLength(500);
    expect(compactApiErrorBody(`<title>${"x".repeat(2000)}</title>`)).toHaveLength(500);
  });

  it("preserves JSON error bodies for IPC callers", () => {
    const body = JSON.stringify({ code: "acl_error", detail: "Denied", fields: { name: ["Required"] } });
    expect(compactApiErrorBody(body)).toBe(body);
  });
});
