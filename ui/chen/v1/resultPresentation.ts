// Presentation only: execution boundaries and source SQL always come from the server.
// Prefer a table name only when the statement has one unambiguous FROM source.
export function queryResultTitle(sql: string) {
  const identifier =
    '(?:"(?:[^"\\r\\n]|"")*"|`(?:[^`\\r\\n]|``)*`|\\[(?:[^\\]\\r\\n]|\\]\\])*\\]|[\\p{L}_][\\p{L}\\p{N}_$]*)';
  const tokens =
    sql.match(
      new RegExp(
        `--[^\\r\\n]*|/\\*[\\s\\S]*?\\*/|'(?:[^']|'')*'|(?<dollar>\\$[a-z_][\\w$]*\\$|\\$\\$)[\\s\\S]*?\\k<dollar>|${identifier}|[^\\s]`,
        "gu"
      )
    ) || [];
  const words = tokens.filter((token) => !token.startsWith("--") && !token.startsWith("/*"));
  const keyword = (token: string | undefined) => (token && /^[a-z]+$/i.test(token) ? token.toUpperCase() : "");
  const from = words.findIndex((token) => keyword(token) === "FROM");
  const unambiguous =
    keyword(words[0]) === "SELECT" &&
    from > 0 &&
    words.filter((token) => keyword(token) === "SELECT").length === 1 &&
    words.filter((token) => keyword(token) === "FROM").length === 1 &&
    !words.some((token) => ["JOIN", "UNION", "INTERSECT", "EXCEPT"].includes(keyword(token) || ""));
  if (unambiguous) {
    const namePattern = new RegExp(`^${identifier}$`, "u");
    let end = from + 1;
    let name = words[end];
    if (name && namePattern.test(name) && !["ONLY", "LATERAL", "UNNEST"].includes(keyword(name) || "")) {
      while (words[end + 1] === "." && words[end + 2] && namePattern.test(words[end + 2]!)) {
        end += 2;
        name = words[end]!;
      }
      const rest = words.slice(end + 1);
      const boundary = rest.findIndex((token) =>
        ["WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "FETCH", "FOR", ";"].includes(keyword(token) || token)
      );
      const sourceTail = boundary < 0 ? rest : rest.slice(0, boundary);
      if (!sourceTail.some((token) => [",", "("].includes(token))) {
        const quoted = name[0];
        return quoted === '"' || quoted === "`"
          ? name.slice(1, -1).replaceAll(quoted + quoted, quoted)
          : quoted === "["
            ? name.slice(1, -1).replaceAll("]]", "]")
            : name;
      }
    }
  }
  const compact = sql.replace(/\s+/g, " ").trim();
  return compact.length > 64 ? `${compact.slice(0, 63)}…` : compact || "SQL";
}
