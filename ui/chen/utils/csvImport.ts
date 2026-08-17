import type { ChenDataViewField } from "~/chen/types";

export type ChenCsvEmptyValue = "empty-string" | "null";

export interface ChenParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseChenCsv(source: string): ChenParsedCsv {
  const text = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;

  const pushValue = () => {
    record.push(value);
    value = "";
    closedQuote = false;
  };
  const pushRecord = () => {
    pushValue();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (closedQuote && character !== "," && character !== "\n" && character !== "\r") {
      throw new Error(`Unexpected character after a quoted value at character ${index + 1}`);
    }
    if (character === '"') {
      if (value) throw new Error(`Unexpected quote at character ${index + 1}`);
      quoted = true;
    } else if (character === ",") {
      pushValue();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRecord();
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted value");
  if (value || record.length || !records.length) pushRecord();
  while (records.length > 1 && records.at(-1)?.every((cell) => cell === "")) records.pop();

  const headers = (records.shift() || []).map((header) => header.trim());
  if (!headers.length || headers.every((header) => !header)) throw new Error("CSV header row is empty");
  if (headers.some((header) => !header)) throw new Error("CSV contains an empty column header");

  const seen = new Set<string>();
  for (const header of headers) {
    const key = header.toLocaleLowerCase();
    if (seen.has(key)) throw new Error(`CSV column “${header}” is duplicated`);
    seen.add(key);
  }

  const rows = records.filter((row) => row.some((cell) => cell !== ""));
  rows.forEach((row, index) => {
    if (row.length !== headers.length) {
      throw new Error(`CSV row ${index + 2} has ${row.length} values; expected ${headers.length}`);
    }
  });
  if (!rows.length) throw new Error("CSV contains no data rows");
  return { headers, rows };
}

export function mapChenCsvRows(
  csv: ChenParsedCsv,
  fields: ChenDataViewField[],
  emptyValue: ChenCsvEmptyValue
): Array<Record<string, string | null>> {
  const aliases = new Map<string, ChenDataViewField[]>();
  for (const field of fields) {
    for (const alias of [field.name, field.label, field.columnName, field.sourceColumn]) {
      const key = alias?.trim().toLocaleLowerCase();
      if (!key) continue;
      const matches = aliases.get(key) || [];
      if (!matches.includes(field)) matches.push(field);
      aliases.set(key, matches);
    }
  }

  const mappedFields = csv.headers.map((header) => {
    const matches = aliases.get(header.toLocaleLowerCase()) || [];
    if (!matches.length) throw new Error(`CSV column “${header}” does not match an insertable table column`);
    if (matches.length > 1) throw new Error(`CSV column “${header}” matches more than one table column`);
    return matches[0]!;
  });
  if (new Set(mappedFields).size !== mappedFields.length) {
    throw new Error("Multiple CSV columns map to the same table column");
  }

  return csv.rows.map((row) =>
    Object.fromEntries(
      row.map((cell, index) => [mappedFields[index]!.name, cell === "" && emptyValue === "null" ? null : cell])
    )
  );
}
