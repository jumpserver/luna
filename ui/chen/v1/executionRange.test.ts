import { describe, expect, it } from "vitest";
import { analysisMatches, statementAt } from "./executionRange";

describe("parser-backed current SQL range", () => {
  it("uses server spans rather than splitting strings, comments or dollar bodies", () => {
    const first = "DO $body$ BEGIN PERFORM ';'; END; $body$";
    const document = `${first};\nSELECT 2;`;
    const ranges = [
      { from: 0, to: first.length },
      { from: first.length + 1, to: document.length }
    ];
    const match = statementAt(document, ranges, document.indexOf("PERFORM"));
    expect(document.slice(match!.from, match!.to)).toBe(`${first};`);
    const next = statementAt(document, ranges, document.indexOf("SELECT"));
    expect(document.slice(next!.from, next!.to)).toBe("SELECT 2;");
  });

  it("does not execute a neighboring statement from blank lines or trailing whitespace", () => {
    const document = "  SELECT 1;\n\n  SELECT 2;\n  ";
    const ranges = [
      { from: 0, to: 10 },
      { from: 11, to: document.length }
    ];
    expect(statementAt(document, ranges, 1)).toBeNull();
    expect(statementAt(document, ranges, 12)).toBeNull();
    expect(statementAt(document, ranges, document.length)).toBeNull();
    expect(statementAt(document, ranges, 10)).toEqual({ from: 2, to: 11 });
  });

  it("includes PostgreSQL's omitted terminator and supports the caret immediately after it", () => {
    const document = "SELECT 1;";
    const ranges = [{ from: 0, to: 8 }];
    expect(statementAt(document, ranges, document.length)).toEqual({ from: 0, to: 9 });
    expect(statementAt(`${document}  `, ranges, 10)).toBeNull();
    expect(statementAt(`${document};`, ranges, 10)).toBeNull();
  });

  it("prefers the next statement when its first character touches the previous terminator", () => {
    const document = "SELECT 1;SELECT 2;";
    const ranges = [
      { from: 0, to: 8 },
      { from: 9, to: 17 }
    ];
    expect(statementAt(document, ranges, 9)).toEqual({ from: 9, to: 18 });
  });

  it("keeps exact UTF-16 boundaries with CJK and surrogate pairs", () => {
    const document = "SELECT '中文🙂'; SELECT `other;column`;";
    const start = document.indexOf("SELECT", 1);
    const ranges = [
      { from: 0, to: start - 1 },
      { from: start, to: document.length }
    ];
    expect(statementAt(document, ranges, document.indexOf("🙂"))).toEqual({ from: 0, to: start - 1 });
    expect(statementAt(document, ranges, document.indexOf("column"))).toEqual({ from: start, to: document.length });
  });

  it("rejects malformed parser offsets instead of selecting a partial SQL fragment", () => {
    for (const range of [
      { from: -1, to: 4 },
      { from: 0, to: 99 },
      { from: 4, to: 1 },
      { from: 0.5, to: 4 }
    ]) {
      expect(statementAt("SELECT 1", [range], 3)).toBeNull();
    }
    expect(statementAt("SELECT 1", [], 3)).toBeNull();
    expect(statementAt(" ", [{ from: 0, to: 1 }], 0)).toBeNull();
  });

  it("rejects analysis from an older edit or a reconnected console", () => {
    expect(analysisMatches(4, 4, "one", "one")).toBe(true);
    expect(analysisMatches(3, 4, "one", "one")).toBe(false);
    expect(analysisMatches(4, 4, "old", "new")).toBe(false);
  });
});
