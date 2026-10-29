import type { ChenGridPreferences } from "~/chen/composables/useChenGridPreferences";
import { formatChenGridValue } from "~/chen/composables/useChenGridPreferences";
import type { GoCopySelection, GoRows } from "./api";
import type { ChenGridCell, ChenGridSelection } from "~/chen/utils/dataGridSelection";
import { formatChenTsv } from "~/chen/utils/dataGridCopy";
import {
  finishChenGridSelection,
  isChenGridCellSelected,
  startChenGridSelection
} from "~/chen/utils/dataGridSelection";

export function resultContextSelection(selection: ChenGridSelection, columns: string[], cell: ChenGridCell) {
  return isChenGridCellSelected(selection, columns, cell)
    ? finishChenGridSelection(selection)
    : finishChenGridSelection(startChenGridSelection(cell));
}

function baseResultType(type: string): string {
  let normalized = type
    .toLowerCase()
    .trim()
    .replace(/^unsigned\s+/, "");
  // ClickHouse can wrap both scalars and arrays. Keep the original type in
  // the header tooltip while classifying its contained value for presentation.
  for (let depth = 0; depth < 16; depth++) {
    const wrapper = /^(?:nullable|lowcardinality)\s*\(([\s\S]*)\)$/.exec(normalized);
    if (!wrapper) break;
    normalized = wrapper[1]!.trim();
  }
  return normalized;
}

export function resultTypeBadge(type: string): string {
  const normalized = baseResultType(type);
  if (normalized.endsWith("[]") || normalized.startsWith("_") || /^(?:array|tuple|nested)\s*\(/.test(normalized))
    return "[]";
  if (
    /^(?:smallint|bigint|integer|u?int\d*|tinyint|mediumint|serial\d*|bigserial|smallserial|numeric|decimal\d*|decfloat|float\d*|binary_float|binary_double|double|real|number|smallmoney|money)(?:\b|\()/i.test(
      normalized
    )
  )
    return "123";
  if (/^(?:jsonb?|map|object)(?:\b|\()/i.test(normalized)) return "{}";
  if (normalized === "xml") return "<>";
  if (/^(?:bool|boolean)(?:\b|\()/i.test(normalized)) return "bool";
  if (
    /^(?:date\d*|smalldatetime|datetime\d*|datetimeoffset|timestamp|timestamptz|time|timetz|interval|year)(?:\b|\()/i.test(
      normalized
    )
  )
    return "date";
  if (/^(?:bytea|(?:tiny|medium|long)?blob|binary|varbinary|long\s+raw|raw|image|bit)(?:\b|\()/i.test(normalized))
    return "bin";
  if (normalized === "uuid") return "uuid";
  if (
    /^(?:n?char|n?varchar2?|character|n?text|tinytext|mediumtext|longtext|n?clob|dbclob|long|fixedstring|string|enum\d*|set|name)(?:\b|\()/i.test(
      normalized
    )
  )
    return "abc";
  return "";
}

export function resultFocusSelection(selection: ChenGridSelection, cell: ChenGridCell, expected: Set<string>) {
  // AG Grid delivers API focus events asynchronously. Consume expected events
  // without replacing the anchor, including older events from rapid Shift+arrows.
  if (expected.delete(`${cell.rowIndex}:${cell.colId}`)) return selection;
  if (selection.current?.rowIndex === cell.rowIndex && selection.current.colId === cell.colId) return selection;
  return finishChenGridSelection(startChenGridSelection(cell));
}

export const resultColumnId = (ordinal: number) => `column_${ordinal}`;

// Display order can differ from cache order after sorting, filtering or pinning.
// Send ordinal identities, never labels or browser-supplied cell values.
export function resultSQLSelection(
  rows: { __row?: unknown }[],
  columns: { id: string }[],
  source: GoRows
): GoCopySelection | null {
  const selectedRows = rows.map((row) => Number(row.__row) - 1);
  const selectedColumns = columns.map((column) =>
    source.columns.findIndex((_, index) => resultColumnId(index) === column.id)
  );
  if (
    !selectedRows.length ||
    !selectedColumns.length ||
    selectedRows.length > 500 ||
    selectedRows.some(
      (index) => !Number.isInteger(index) || index < source.offset || index >= source.offset + source.rows.length
    ) ||
    selectedColumns.some((index) => index < 0) ||
    new Set(selectedRows).size !== selectedRows.length ||
    new Set(selectedColumns).size !== selectedColumns.length
  )
    return null;
  return { rows: selectedRows, columns: selectedColumns };
}

export function resultGridRows(rows: GoRows) {
  return rows.rows.map((values, index) => ({
    __row: rows.offset + index + 1,
    ...Object.fromEntries(rows.columns.map((_, ordinal) => [resultColumnId(ordinal), values[ordinal] ?? null]))
  }));
}

export function resultValueText(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

type ResultDisplayPreferences = Pick<ChenGridPreferences, "nullDisplay" | "showEmptyStrings">;

export function resultDisplayText(value: unknown): string {
  if (value === "") return "''";
  if (value === "NULL") return '"NULL"';
  return resultValueText(value);
}

export const RESULT_VALUE_PART_LENGTH = 128 * 1024;
export const RESULT_JSON_FORMAT_LIMIT = 128 * 1024;
const RESULT_JSON_OUTPUT_LIMIT = 512 * 1024;

function safeTextBoundary(text: string, offset: number) {
  const code = text.charCodeAt(offset);
  const previous = text.charCodeAt(offset - 1);
  return code >= 0xdc00 && code <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff ? offset - 1 : offset;
}

export function resultValuePreview(value: unknown, limit = 240, preferences?: ResultDisplayPreferences): string {
  const text =
    preferences && (value == null || value === "") ? formatChenGridValue(value, preferences) : resultDisplayText(value);
  const end = safeTextBoundary(text, Math.min(text.length, limit));
  return (
    text
      .slice(0, end)
      .replace(/\r\n|\r|\n/g, " ↵ ")
      .replace(/\t/g, " ⇥ ") + (end < text.length ? "…" : "")
  );
}

export function resultValuePart(text: string, requested: number, size = RESULT_VALUE_PART_LENGTH) {
  const total = Math.max(1, Math.ceil(text.length / size));
  const index = Math.max(0, Math.min(total - 1, Math.floor(requested)));
  const start = safeTextBoundary(text, index * size);
  const end = safeTextBoundary(text, Math.min(text.length, (index + 1) * size));
  return { index, total, start, end, text: text.slice(start, end) };
}

export function resultBinaryHex(value: unknown, type: string): string | null {
  // The Go API encodes actual binary driver values as 0x-prefixed hex. Text that
  // merely starts with 0x must remain text (and BIT strings are not this encoding).
  if (!/^(?:bytea|(?:tiny|medium|long)?blob|(?:var)?binary|long\s+raw|raw|image)(?:\b|\()/i.test(baseResultType(type)))
    return null;
  if (typeof value !== "string" || !/^0x(?:[a-f\d]{2})*$/i.test(value)) return null;
  return value.slice(2);
}

export function formatResultHex(hex: string, byteOffset = 0): string {
  const lines: string[] = [];
  for (let index = 0; index < hex.length; index += 32) {
    const pairs = hex.slice(index, index + 32).match(/../g) || [];
    const bytes = pairs.join(" ").padEnd(47, " ");
    const ascii = pairs
      .map((pair) => {
        const byte = Number.parseInt(pair, 16);
        return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
      })
      .join("");
    lines.push(`${(byteOffset + index / 2).toString(16).padStart(8, "0")}  ${bytes}  |${ascii}|`);
  }
  return lines.join("\n");
}

export function resultJsonFormat(text: string): { text: string | null; limited: boolean } {
  // ponytail: format at most 128 Ki UTF-16 units into at most 512 Ki units.
  // Larger values stay in the paged raw viewer; worker formatting can lift this cap.
  if (text.length > RESULT_JSON_FORMAT_LIMIT) return { text: null, limited: true };
  try {
    JSON.parse(text);
  } catch {
    return { text: null, limited: false };
  }
  // Preserve the original number and string tokens, including integers beyond 2^53.
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g) || [];
  let depth = 0;
  let length = 0;
  const parts: string[] = [];
  const newline = () => `\n${"  ".repeat(Math.min(32, depth))}`;
  for (const [index, token] of tokens.entries()) {
    let part = token;
    if (token === "{" || token === "[") {
      depth++;
      if (tokens[index + 1] !== (token === "{" ? "}" : "]")) part += newline();
    } else if (token === "}" || token === "]") {
      depth--;
      if (tokens[index - 1] !== (token === "}" ? "{" : "[")) part = newline() + token;
    } else if (token === ",") part += newline();
    else if (token === ":") part = ": ";
    length += part.length;
    if (length > RESULT_JSON_OUTPUT_LIMIT) return { text: null, limited: true };
    parts.push(part);
  }
  return { text: parts.join(""), limited: false };
}

export function formatResultJson(text: string): string {
  return resultJsonFormat(text).text ?? text;
}

export function resultSelectionTsv(
  rows: Record<string, unknown>[],
  columns: { id: string; name: string }[],
  withHeaders = false
) {
  const fields = columns.map((column) => ({ name: column.id }));
  const values = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.id, resultValueText(row[column.id])]))
  );
  if (withHeaders) values.unshift(Object.fromEntries(columns.map((column) => [column.id, column.name])));
  return formatChenTsv(values, fields);
}

// Database drivers preserve large numeric values as strings. Compare decimal digits
// without converting through Number, which could silently collapse distinct values.
function decimal(value: unknown) {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match || !(match[2] || match[3])) return null;
  const exponent = Number(match[4] || 0);
  if (!Number.isSafeInteger(exponent)) return null;
  const all = (match[2] || "") + (match[3] || "");
  const digits = all.replace(/^0+/, "");
  return {
    sign: digits ? (match[1] === "-" ? -1 : 1) : 0,
    position: (match[2]?.length || 0) + exponent - (all.length - digits.length),
    digits
  };
}

export function compareResultValues(left: unknown, right: unknown, numeric: boolean): number {
  if (left == null || right == null) return left == null ? (right == null ? 0 : -1) : 1;
  if (numeric) {
    const a = decimal(left);
    const b = decimal(right);
    if (a && b) {
      if (a.sign !== b.sign) return a.sign - b.sign;
      if (!a.sign) return 0;
      if (a.position !== b.position) return Math.sign(a.position - b.position) * a.sign;
      const size = Math.max(a.digits.length, b.digits.length);
      const first = a.digits.padEnd(size, "0");
      const second = b.digits.padEnd(size, "0");
      return (first < second ? -1 : first > second ? 1 : 0) * a.sign;
    }
  }
  return resultValueText(left).localeCompare(resultValueText(right));
}
