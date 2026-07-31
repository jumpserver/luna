import type { ChenConsoleState, ChenDataViewDataset, ChenPromptConsoleTab } from "~/chen/types";

export const CHEN_CONSOLE_SCROLLBACK_LINES = 5000;
const MAX_COLUMN_WIDTH = 40;

function isWideCharacter(codePoint: number) {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff))
  );
}

function displayWidth(value: string) {
  let width = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    width += isWideCharacter(codePoint) ? 2 : 1;
  }
  return width;
}

export function escapeChenConsoleText(value: unknown) {
  let text: string;
  if (value == null) {
    text = "NULL";
  } else if (typeof value === "object") {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  let escaped = "";
  for (const character of text) {
    if (character === "\u001B") {
      escaped += "\\x1b";
    } else if (character === "\r") {
      escaped += "\\r";
    } else if (character === "\n") {
      escaped += "\\n";
    } else if (character === "\t") {
      escaped += "\\t";
    } else {
      const codePoint = character.codePointAt(0) || 0;
      escaped += codePoint <= 0x1f || codePoint === 0x7f ? `\\x${codePoint.toString(16).padStart(2, "0")}` : character;
    }
  }
  return escaped;
}

function truncateCell(value: string, maxWidth: number) {
  if (displayWidth(value) <= maxWidth) return value;
  let output = "";
  let width = 0;
  for (const character of value) {
    const characterWidth = isWideCharacter(character.codePointAt(0) || 0) ? 2 : 1;
    if (width + characterWidth > maxWidth - 1) break;
    output += character;
    width += characterWidth;
  }
  return `${output}…`;
}

function padCell(value: string, width: number) {
  const truncated = truncateCell(value, width);
  return `${truncated}${" ".repeat(Math.max(0, width - displayWidth(truncated)))}`;
}

export function formatChenConsoleResult(dataset: ChenDataViewDataset, state: ChenConsoleState = {}) {
  const fields = dataset.fields || [];
  const rows = dataset.data || [];
  if (!fields.length) return `(0 rows)\n\n`;

  const values = rows.map((row) => fields.map((field) => escapeChenConsoleText(row[field.name])));
  const widths = fields.map((field, index) => {
    const contentWidth = values.reduce((width, row) => Math.max(width, displayWidth(row[index] || "")), 0);
    return Math.min(MAX_COLUMN_WIDTH, Math.max(displayWidth(field.name), contentWidth));
  });
  const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const formatRow = (row: string[]) => {
    return `| ${row.map((value, index) => padCell(value, widths[index] || 1)).join(" | ")} |`;
  };

  const lines = [
    border,
    formatRow(fields.map((field) => escapeChenConsoleText(field.name))),
    border,
    ...values.map(formatRow),
    border
  ];
  const total = typeof state.total === "number" ? state.total : rows.length;
  lines.push(
    total > rows.length
      ? `(${rows.length} rows shown, ${total} total)`
      : `(${rows.length} ${rows.length === 1 ? "row" : "rows"})`
  );

  return `${lines.join("\n")}\n\n`;
}

export function formatChenConsoleCommand(prompt: string, sql: string) {
  const lines = sql.replace(/\r\n?/g, "\n").split("\n");
  return `${lines
    .map((line, index) => {
      return `${index === 0 ? prompt : "    ->"} ${escapeChenConsoleText(line)}`;
    })
    .join("\n")}\n`;
}

export function appendChenConsoleTranscript(tab: ChenPromptConsoleTab, content: string) {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = `${tab.terminalOutput || ""}${normalized}`.split("\n");
  const maximumLength = CHEN_CONSOLE_SCROLLBACK_LINES + 1;
  if (lines.length > maximumLength) {
    lines.splice(0, lines.length - maximumLength);
  }
  tab.terminalOutput = lines.join("\n");
}

export function clearChenConsoleTranscript(tab: ChenPromptConsoleTab) {
  tab.terminalOutput = "";
}
