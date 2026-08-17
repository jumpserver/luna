export type ChenUnrestrictedMutation = "UPDATE" | "DELETE";

interface SqlToken {
  depth: number;
  value: string;
}

const MAIN_COMMANDS = new Set(["DELETE", "INSERT", "MERGE", "SELECT", "UPDATE", "VALUES"]);

function skipQuoted(sql: string, start: number, closing: string) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === "\\") {
      index += 2;
      continue;
    }
    if (sql[index] !== closing) {
      index += 1;
      continue;
    }
    if (sql[index + 1] === closing) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return sql.length;
}

function sqlStatements(sql: string) {
  const statements: SqlToken[][] = [[]];
  let depth = 0;
  let index = 0;

  while (index < sql.length) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);

    if (char === "-" && next === "-") {
      index = sql.indexOf("\n", index + 2);
      if (index === -1) break;
      continue;
    }
    if (char === "#") {
      index = sql.indexOf("\n", index + 1);
      if (index === -1) break;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      index = skipQuoted(sql, index, char);
      continue;
    }
    if (char === "[") {
      index = skipQuoted(sql, index, "]");
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(index).match(/^\$[a-z_][\w$]*\$|^\$\$/i)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        index = end === -1 ? sql.length : end + tag.length;
        continue;
      }
    }
    if (char === "(") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      index += 1;
      continue;
    }
    if (char === ";" && depth === 0) {
      if (statements.at(-1)?.length) statements.push([]);
      index += 1;
      continue;
    }
    if (/[a-z_]/i.test(char)) {
      const word = sql.slice(index).match(/^[a-z_][\w$]*/i)?.[0] || char;
      statements.at(-1)?.push({ depth, value: word.toUpperCase() });
      index += word.length;
      continue;
    }
    index += 1;
  }

  return statements.filter((statement) => statement.length > 0);
}

function mainCommandIndex(tokens: SqlToken[]) {
  const first = tokens.findIndex((token) => token.depth === 0);
  if (first === -1 || tokens[first]?.value !== "WITH") return first;

  return tokens.findIndex((token, index) => index > first && token.depth === 0 && MAIN_COMMANDS.has(token.value));
}

/** Finds UPDATE/DELETE statements whose outer mutation has no WHERE clause. */
export function chenUnrestrictedMutations(sql: string): ChenUnrestrictedMutation[] {
  const mutations: ChenUnrestrictedMutation[] = [];

  for (const tokens of sqlStatements(sql)) {
    const commandIndex = mainCommandIndex(tokens);
    const mutationIndexes = tokens.flatMap((token, index) => {
      if (token.value !== "UPDATE" && token.value !== "DELETE") return [];
      const startsNestedStatement = token.depth > 0 && (tokens[index - 1]?.depth ?? -1) < token.depth;
      return index === commandIndex || startsNestedStatement ? [index] : [];
    });

    for (const mutationIndex of mutationIndexes) {
      const mutation = tokens[mutationIndex];
      if (!mutation || (mutation.value !== "UPDATE" && mutation.value !== "DELETE")) continue;
      const end = tokens.findIndex((token, index) => index > mutationIndex && token.depth < mutation.depth);
      const hasWhere = tokens.some(
        (token, index) =>
          index > mutationIndex &&
          (end === -1 || index < end) &&
          token.depth === mutation.depth &&
          token.value === "WHERE"
      );
      if (!hasWhere) mutations.push(mutation.value);
    }
  }

  return mutations;
}
