export interface SqlSourceRange {
  from: number;
  to: number;
}

// Source ranges come from the dialect parser on the server, in Monaco's UTF-16
// offsets. Include a terminator omitted by PostgreSQL's span, then trim outer
// whitespace. This never scans for separators or splits SQL itself.
export function statementAt(document: string, statements: SqlSourceRange[], offset: number): SqlSourceRange | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > document.length) return null;
  for (const statement of statements) {
    if (
      !Number.isInteger(statement.from) ||
      !Number.isInteger(statement.to) ||
      statement.from < 0 ||
      statement.to > document.length ||
      statement.from >= statement.to
    )
      return null;
  }
  let endMatch: SqlSourceRange | null = null;
  for (const statement of statements) {
    const parsedSource = document.slice(statement.from, statement.to);
    const end = statement.to + (document[statement.to] === ";" && !parsedSource.trimEnd().endsWith(";") ? 1 : 0);
    const source = document.slice(statement.from, end);
    const from = statement.from + source.length - source.trimStart().length;
    const to = end - source.length + source.trimEnd().length;
    if (from < to && offset >= from && offset < to) return { from, to };
    if (from < to && offset === to) endMatch = { from, to };
  }
  return endMatch;
}

export function analysisMatches(version: number, currentVersion: number, consoleId: string, currentConsoleId: string) {
  return version === currentVersion && consoleId === currentConsoleId;
}
