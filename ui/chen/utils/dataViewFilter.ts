import type { ChenDataViewField } from "~/chen/types";

import { formatChenSqlLiteral, quoteChenIdentifier } from "~/chen/utils/dataGridCopy";

export type ChenDataViewFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "is_null"
  | "is_not_null";

export const chenDataViewFilterOperators: Array<{
  label: string;
  value: ChenDataViewFilterOperator;
}> = [
  { label: "Equals (=)", value: "equals" },
  { label: "Not equal (!=)", value: "not_equals" },
  { label: "Contains", value: "contains" },
  { label: "Does not contain", value: "not_contains" },
  { label: "Greater than (>)", value: "greater_than" },
  { label: "Greater than or equal (>=)", value: "greater_than_or_equal" },
  { label: "Less than (<)", value: "less_than" },
  { label: "Less than or equal (<=)", value: "less_than_or_equal" },
  { label: "Is NULL", value: "is_null" },
  { label: "Is not NULL", value: "is_not_null" }
];

export function chenDataViewFilterNeedsValue(operator: ChenDataViewFilterOperator) {
  return operator !== "is_null" && operator !== "is_not_null";
}

function filterLiteral(dbType: string, field: ChenDataViewField, value: string) {
  const type = String(field.type || "").toLowerCase();
  if (/\b(?:tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|number|real|float|double)\b/.test(type)) {
    const normalized = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
      throw new Error("Enter a valid number for this column");
    }
    return normalized;
  }
  if (/\b(?:bool|boolean|bit)\b/.test(type)) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return formatChenSqlLiteral(dbType, true);
    if (normalized === "false" || normalized === "0") return formatChenSqlLiteral(dbType, false);
    throw new Error("Enter true, false, 1, or 0 for this column");
  }
  return formatChenSqlLiteral(dbType, value);
}

export function buildChenDataViewFilter(
  dbType: string,
  field: ChenDataViewField,
  operator: ChenDataViewFilterOperator,
  value: string
) {
  const column = quoteChenIdentifier(dbType, field.columnName || field.name);
  if (operator === "is_null") return `${column} IS NULL`;
  if (operator === "is_not_null") return `${column} IS NOT NULL`;

  if (operator === "contains" || operator === "not_contains") {
    const pattern = formatChenSqlLiteral(dbType, `%${value}%`);
    return `${column} ${operator === "not_contains" ? "NOT LIKE" : "LIKE"} ${pattern}`;
  }

  const sqlOperator: Record<
    Exclude<ChenDataViewFilterOperator, "contains" | "not_contains" | "is_null" | "is_not_null">,
    string
  > = {
    equals: "=",
    not_equals: "<>",
    greater_than: ">",
    greater_than_or_equal: ">=",
    less_than: "<",
    less_than_or_equal: "<="
  };
  return `${column} ${sqlOperator[operator]} ${filterLiteral(dbType, field, value)}`;
}
