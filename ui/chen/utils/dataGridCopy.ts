import type { ChenDataViewField } from "~/chen/types";

type ChenDataRow = Record<string, any>;

function formatChenTsvValue(value: unknown) {
  const text = value == null ? "NULL" : String(value);
  if (!/[\t\r\n"]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function formatChenTsv(rows: ChenDataRow[], fields: Pick<ChenDataViewField, "name">[]) {
  return rows.map((row) => fields.map((field) => formatChenTsvValue(row[field.name])).join("\t")).join("\n");
}
