import { chenErrorCatalog } from "./errorCatalog";

type Translate = (key: string, values?: Record<string, string | number>) => string;
const messages = new Map<string, string>();
for (const [code, aliases] of Object.entries(chenErrorCatalog)) {
  messages.set(code, code);
  for (const message of aliases) messages.set(message, code);
}

// Database diagnostics are not product copy: keep identifiers, SQL positions and
// vendor details intact, alongside a localized explanation of the error class.
function databaseErrorCode(code: string): string | undefined {
  const categories: Record<string, readonly string[]> = {
    database_syntax: [
      "42601",
      "MYSQL_1064",
      "OCEANBASE_1064",
      "MSSQL_102",
      "MSSQL_156",
      "ORA_00900",
      "ORA_00933",
      "ORA_00936",
      "CLICKHOUSE_62"
    ],
    database_missing_table: ["42P01", "MYSQL_1146", "OCEANBASE_1146", "MSSQL_208", "ORA_00942", "CLICKHOUSE_60"],
    database_missing_column: ["42703", "MYSQL_1054", "OCEANBASE_1054", "MSSQL_207", "ORA_00904", "CLICKHOUSE_47"],
    database_duplicate: ["23505", "MYSQL_1062", "OCEANBASE_1062", "MSSQL_2601", "MSSQL_2627", "ORA_00001"],
    database_constraint: [
      "23502",
      "23503",
      "23514",
      "MYSQL_1048",
      "MYSQL_1451",
      "MYSQL_1452",
      "MSSQL_515",
      "MSSQL_547",
      "ORA_01400",
      "ORA_02291",
      "ORA_02292"
    ],
    database_permission: [
      "42501",
      "MYSQL_1044",
      "MYSQL_1045",
      "MYSQL_1142",
      "OCEANBASE_1044",
      "OCEANBASE_1142",
      "MSSQL_229",
      "ORA_01031",
      "CLICKHOUSE_497"
    ],
    database_type: [
      "22P02",
      "22003",
      "22007",
      "22008",
      "22001",
      "MYSQL_1366",
      "MYSQL_1406",
      "MSSQL_245",
      "MSSQL_8114",
      "ORA_01722",
      "ORA_12899"
    ],
    database_deadlock: ["40P01", "40001", "MYSQL_1213", "MYSQL_1205", "OCEANBASE_1213", "MSSQL_1205", "ORA_00060"],
    database_transaction_failed: ["25P02"]
  };
  for (const [category, codes] of Object.entries(categories)) if (codes.includes(code)) return category;
  if (/^(?:[0-9A-Z]{5}|(?:MYSQL|OCEANBASE|MSSQL|ORA|DM|CLICKHOUSE)_-?\d+|DB2_SQL_ERROR)$/.test(code))
    return "database_error";
}

/** Format HTTP errors, execution/export errors and SSE close reasons at the UI boundary. */
export function chenErrorText(cause: unknown, t: Translate, fallback = "unexpected_error"): string {
  const value =
    cause && typeof cause === "object"
      ? (cause as { code?: unknown; message?: unknown; reason?: unknown; status?: unknown })
      : {};
  const code = typeof value.code === "string" ? value.code : "";
  const raw = typeof cause === "string" ? cause : (value.message ?? value.reason);
  const message = typeof raw === "string" ? raw.trim() : "";
  const translate = (key: string, values?: Record<string, string | number>) => t(`Chen.Errors.${key}`, values);

  // Never lose the partial-execution warning or translate data quoted inside a
  // database error. This prefix is a defined Chen server diagnostic contract.
  const partial =
    /^(\d+) earlier statement\(s\) completed and may already have taken effect\. Do not automatically repeat the whole script\.\s*([\s\S]*)$/.exec(
      message
    );
  if (partial)
    return `${translate("partial_statements", { count: partial[1]! })}\n${chenErrorText(partial[2], t, code || "database_error")}`;
  if (message === "Database diagnostic details are hidden by the data masking policy")
    return translate("diagnostic_hidden");

  const native = databaseErrorCode(code);
  if (native) return `${translate(native)}${message ? `\n${translate("original_detail")} (${code}): ${message}` : ""}`;

  if (["execution_unknown", "edit_commit_unknown", "edit_rollback_unknown"].includes(code)) {
    const known = messages.get(message) === code;
    return `${translate(code)}${message && !known ? `\n${translate("original_detail")}: ${message}` : ""}`;
  }

  const matched = messages.get(message);
  if (matched) return translate(matched, { status: typeof value.status === "number" ? value.status : "—" });

  // Compatibility with plain-text validation from the table/index builders and
  // edit metadata. Only fixed templates are translated; names remain verbatim.
  const column = /^Column (.+): (.+)$/s.exec(message);
  if (column && messages.has(column[2]!))
    return translate("column_error", { name: column[1]!, message: chenErrorText(column[2], t) });
  const patterns: [RegExp, string][] = [
    [/^Column (.+) is read-only for this operation$/, "column_readonly"],
    [/^Column (.+) requires a value$/, "column_value_required"],
    [/^Column(?: name)? “(.+)” is duplicated$/, "column_duplicate"],
    [/^Column “(.+)” has an unsupported type$/, "column_type_unsupported"],
    [/^Column “(.+)” has an invalid length or precision$/, "column_size_invalid"],
    [/^Index method “(.+)” is not supported$/, "index_method_unsupported"]
  ];
  for (const [pattern, key] of patterns) {
    const match = pattern.exec(message);
    if (match) return translate(key, { name: match[1]! });
  }
  const identifier =
    /^(Table name|Column name|Index name|Name|Column (\d+) name) (is required|contains an unsupported control character)$/.exec(
      message
    );
  if (identifier) {
    const labels: Record<string, string> = {
      "Table name": "identifier_table",
      "Column name": "identifier_column",
      "Index name": "identifier_index",
      Name: "identifier_name"
    };
    const label = identifier[2]
      ? translate("identifier_column_number", { index: identifier[2] })
      : translate(labels[identifier[1]!]!);
    return translate(identifier[3] === "is required" ? "identifier_required" : "identifier_control", { label });
  }

  // Existing localized UI validation is already display-ready. Unknown driver
  // and future protocol errors get a localized heading, never [object Object].
  const uiMessages = [
    "Chen.NotSupported",
    "Chen.GoWriteSqlFileInvalid",
    "Chen.GoV1SessionClosed",
    "Chen.GoV1ExportUnavailable",
    "RightPanel.SQLAIUnavailableDescription"
  ];
  if (!code && message && uiMessages.some((key) => message === t(key))) return message;
  if (!code && /[\u3400-\u9fff]/u.test(message)) return message;
  const knownCode = Object.hasOwn(chenErrorCatalog, code);
  const summary = translate(
    knownCode ? code : Object.hasOwn(chenErrorCatalog, fallback) ? fallback : "unexpected_error",
    { status: typeof value.status === "number" ? value.status : "—" }
  );
  if (
    knownCode &&
    ![
      "sql_parse_error",
      "invalid_changes",
      "edit_unavailable",
      "script_partial_failure",
      "script_partial_cancel",
      "execution_unknown"
    ].includes(code)
  )
    return summary;
  return `${summary}${message ? `\n${translate("original_detail")}: ${message}` : code ? `\n${translate("error_code")}: ${code}` : ""}`;
}
