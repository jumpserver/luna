// Run with node ui/chen/v1/executionRange.check.mts.
import assert from "node:assert/strict";
import { statementAt, statementFoldingRanges } from "./executionRange.ts";

const statement = "SELECT\n  *\nfrom\n  mysql.time_zone\nwhere\n  Time_zone_id = 1;";
const lineAt = (document: string) => (offset: number) => document.slice(0, offset).split("\n").length;

const document = `${statement}\n\nSELECT 2;\n`;
const ranges = [
  { from: 0, to: statement.length - 1 },
  { from: statement.length, to: document.length }
];
assert.deepEqual(statementFoldingRanges(document, ranges, lineAt(document)), [{ start: 1, end: 6 }]);
assert.deepEqual(statementAt(document, ranges, statement.length - 1), { from: 0, to: statement.length });

const sharedLine = `${statement} SELECT\n  'a;b';`;
assert.deepEqual(
  statementFoldingRanges(
    sharedLine,
    [
      { from: 0, to: statement.length },
      { from: statement.length, to: sharedLine.length }
    ],
    lineAt(sharedLine)
  ),
  [
    { start: 1, end: 5 },
    { start: 6, end: 7 }
  ]
);
