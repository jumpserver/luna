export interface SqlSourceRange {
  from: number;
  to: number;
}

function isSourceRange(document: string, { from, to }: SqlSourceRange) {
  return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to <= document.length && from < to;
}

// Source ranges come from the dialect parser on the server, in Monaco's UTF-16
// offsets. Include a terminator omitted by PostgreSQL's span, then trim outer
// whitespace. This never scans for separators or splits SQL itself.
function trimStatement(document: string, statement: SqlSourceRange): SqlSourceRange {
  const parsedSource = document.slice(statement.from, statement.to);
  const end = statement.to + (document[statement.to] === ";" && !parsedSource.trimEnd().endsWith(";") ? 1 : 0);
  const source = document.slice(statement.from, end);
  return {
    from: statement.from + source.length - source.trimStart().length,
    to: end - source.length + source.trimEnd().length
  };
}

export function statementAt(document: string, statements: SqlSourceRange[], offset: number): SqlSourceRange | null {
  if (!Number.isInteger(offset) || offset < 0 || offset > document.length) return null;
  if (statements.some((statement) => !isSourceRange(document, statement))) return null;
  let endMatch: SqlSourceRange | null = null;
  for (const statement of statements) {
    const { from, to } = trimStatement(document, statement);
    if (from < to && offset >= from && offset < to) return { from, to };
    if (from < to && offset === to) endMatch = { from, to };
  }
  return endMatch;
}

export function statementFoldingRanges(
  document: string,
  statements: SqlSourceRange[],
  lineAt: (offset: number) => number
) {
  if (statements.some((statement) => !isSourceRange(document, statement))) return [];
  const ranges = statements
    .map((statement) => trimStatement(document, statement))
    .filter(({ from, to }) => from < to)
    .sort((a, b) => a.from - b.from);
  return ranges.flatMap(({ from, to }, index) => {
    const start = lineAt(from);
    let end = lineAt(to - 1);
    const next = ranges[index + 1];
    // Keep a shared line visible so folding can't hide the start of the next statement.
    if (next) end = Math.min(end, lineAt(next.from) - 1);
    return end > start ? [{ start, end }] : [];
  });
}

export function analysisMatches(version: number, currentVersion: number, consoleId: string, currentConsoleId: string) {
  return version === currentVersion && consoleId === currentConsoleId;
}
