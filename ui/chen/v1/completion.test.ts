import { afterEach, describe, expect, it, vi } from "vitest";
import { completionFilterText, completionIsCurrent, waitForCompletion } from "./completion";

afterEach(() => vi.useRealTimers());

describe("SQL completion context", () => {
  it("rejects a late result after moving the caret without editing SQL", () => {
    const result = { document_version: 7, from: 16, to: 20, items: [] };
    expect(completionIsCurrent(result, 7, 7, 30, false, 18, 18)).toBe(true);
    expect(completionIsCurrent(result, 7, 7, 30, false, 18, 25)).toBe(false);
  });

  it("requires the replacement token to contain the requested UTF16 position", () => {
    const result = { document_version: 2, from: 2, to: 6, items: [] };
    expect(completionIsCurrent(result, 2, 2, "😀name".length, false, 2, 2)).toBe(true);
    expect(completionIsCurrent(result, 2, 2, "😀name".length, false, 6, 6)).toBe(true);
    expect(completionIsCurrent(result, 2, 2, 12, false, 8, 8)).toBe(false);
    expect(completionIsCurrent({ ...result, from: 3.5 }, 2, 2, 12, false, 4, 4)).toBe(false);
  });

  it("filters a qualified JOIN candidate by its column name", () => {
    const item = { label: "orders.id", insert_text: 'orders."id"', kind: "column", filter_text: "id" };
    expect(completionFilterText(item, "i")).toBe("id");
    expect(completionFilterText({ ...item, filter_text: undefined }, "or")).toBe("orders.id");
  });

  it("matches quoted names including escaped identifier quotes without changing insertion text", () => {
    const pg = { label: 'Order "number"', insert_text: '"Order ""number"""', kind: "column" };
    const mysql = { label: "Order `number`", insert_text: "`Order ``number```", kind: "column" };
    expect(completionFilterText(pg, '"Ord')).toBe('"Order ""number""');
    expect(completionFilterText(mysql, "`Ord")).toBe("`Order ``number``");
    expect(pg.insert_text).toBe('"Order ""number"""');
    expect(mysql.insert_text).toBe("`Order ``number```");
    const sqlserver = { label: "Order ]number]", insert_text: "[Order ]]number]]]", kind: "column" };
    expect(completionFilterText(sqlserver, "[Ord")).toBe("[Order ]]number]]");
    expect(sqlserver.insert_text).toBe("[Order ]]number]]]");
  });
});

describe("SQL completion request coalescing", () => {
  it("does not wait or issue work for an already canceled request", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    await expect(waitForCompletion(controller.signal)).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the pending debounce immediately on edit or caret movement", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const waiting = waitForCompletion(controller.signal);
    controller.abort();
    await expect(waiting).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases the abort listener when a stable document is ready", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const waiting = waitForCompletion(controller.signal);
    await vi.advanceTimersByTimeAsync(120);
    await expect(waiting).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
