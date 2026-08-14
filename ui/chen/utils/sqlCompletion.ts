import type { SQLDialect, SQLNamespace } from "@codemirror/lang-sql";
import type { ChenQualifiedRelation, ChenSqlMetadataScope } from "~/chen/types/sqlMetadata";
import type { ChenSqlMetadataStore } from "~/chen/utils/sqlMetadata";

import { schemaCompletionSource } from "@codemirror/lang-sql";
import { columnsFor, relationIdentity } from "~/chen/utils/sqlMetadata";

export type ChenSqlCompletionSource = ReturnType<typeof schemaCompletionSource>;

export interface ChenSqlCompletionAnalysis {
  relationExpected: boolean;
  prefix: string;
  qualifier: string;
  references: Array<{ identifier: string; alias: string }>;
}

interface ChenCompletionSourceOptions {
  store: ChenSqlMetadataStore;
  scope: () => ChenSqlMetadataScope | null;
  dialect: () => SQLDialect;
}

const ALIAS_STOP_WORDS = new Set([
  "cross",
  "full",
  "group",
  "having",
  "inner",
  "join",
  "left",
  "limit",
  "on",
  "order",
  "outer",
  "right",
  "set",
  "union",
  "where"
]);

export function createChenCompletionSource(options: ChenCompletionSourceOptions): ChenSqlCompletionSource {
  return async (context) => {
    const scope = options.scope();
    if (!scope?.nodeKey || !scope.context) return null;

    let cancelled = false;
    context.addEventListener(
      "abort",
      () => {
        cancelled = true;
      },
      { onDocChange: true }
    );

    try {
      const analysis = analyzeChenSqlCompletion(context.state.doc.toString(), context.pos);
      if (analysis.relationExpected) {
        const page = await options.store.getRelations(scope, analysis.prefix, 100);
        if (cancelled) return null;
        return relationCompletion(page.items, scope.context, options.dialect())(context);
      }

      if (analysis.qualifier) {
        const aliases = new Map(
          analysis.references
            .filter((reference) => reference.alias)
            .map((reference) => [reference.alias.toLocaleLowerCase(), reference.identifier])
        );
        const identifier = aliases.get(analysis.qualifier.toLocaleLowerCase()) || analysis.qualifier;
        const lookup = await lookupRelation(options.store, scope, identifier);
        const relation = lookup.relation;
        if (cancelled) return null;

        if (relation) {
          const columns = await options.store.getColumns(scope, [relation]);
          if (cancelled) return null;
          return qualifiedColumnCompletion(
            relation,
            columnsFor(columns, relation),
            scope.context,
            options.dialect()
          )(context);
        }

        const schemaRelations = lookup.page.items.filter((item) => identifiersEqual(item.schema, analysis.qualifier));
        if (schemaRelations.length) {
          return relationCompletion(schemaRelations, scope.context, options.dialect())(context);
        }
        return null;
      }

      const referencedRelations = await resolveReferencedRelations(options.store, scope, analysis.references);
      if (cancelled) return null;
      if (referencedRelations.length) {
        const columns = await options.store.getColumns(scope, referencedRelations);
        if (cancelled) return null;
        return unqualifiedColumnCompletion(referencedRelations, columns, options.dialect())(context);
      }

      if (!context.explicit) return null;
      const page = await options.store.getRelations(scope, analysis.prefix, 100);
      if (cancelled) return null;
      return relationCompletion(page.items, scope.context, options.dialect())(context);
    } catch {
      // Metadata completion is optional. The lang-sql keyword source remains active.
      return null;
    }
  };
}

export function analyzeChenSqlCompletion(sql: string, position = sql.length): ChenSqlCompletionAnalysis {
  const statementStart = sql.lastIndexOf(";", position - 1) + 1;
  const nextSeparator = sql.indexOf(";", position);
  const statementEnd = nextSeparator === -1 ? sql.length : nextSeparator;
  const statement = sql.slice(statementStart, statementEnd);
  const beforeCursor = sql.slice(statementStart, position);
  const relationMatch = beforeCursor.match(/\b(?:from|join|update|into)\s+((?:[a-z_][\w$]*\.)?[a-z_][\w$]*)?$/i);
  const qualifierMatch = beforeCursor.match(/(?:^|[^\w$])([a-z_][\w$]*)\.\s*[\w$]*$/i);
  const references: ChenSqlCompletionAnalysis["references"] = [];
  const relationPattern =
    /\b(?:from|join|update|into)\s+([a-z_][\w$]*(?:\s*\.\s*[a-z_][\w$]*)?)(?:\s+(?:as\s+)?([a-z_][\w$]*))?/gi;

  // ponytail: This intentionally handles simple relation references only. Replace
  // it with syntax-tree scope walking when CTEs, quoted identifiers, or comma joins
  // are added to the first supported completion set.
  for (const match of statement.matchAll(relationPattern)) {
    if (!match[1]) continue;
    const identifier = match[1].replace(/\s+/g, "");
    const alias = match[2] && !ALIAS_STOP_WORDS.has(match[2].toLocaleLowerCase()) ? match[2] : "";
    references.push({ identifier, alias });
  }

  return {
    relationExpected: Boolean(relationMatch),
    prefix: relationMatch?.[1] || currentIdentifierPrefix(beforeCursor),
    qualifier: relationMatch ? "" : qualifierMatch?.[1] || "",
    references
  };
}

async function resolveReferencedRelations(
  store: ChenSqlMetadataStore,
  scope: ChenSqlMetadataScope,
  references: ChenSqlCompletionAnalysis["references"]
) {
  const relations = await Promise.all(
    references.map((reference) => resolveRelation(store, scope, reference.identifier))
  );
  return [...new Map(relations.filter(Boolean).map((relation) => [relationIdentity(relation!), relation!])).values()];
}

async function resolveRelation(store: ChenSqlMetadataStore, scope: ChenSqlMetadataScope, identifier: string) {
  return (await lookupRelation(store, scope, identifier)).relation;
}

async function lookupRelation(store: ChenSqlMetadataStore, scope: ChenSqlMetadataScope, identifier: string) {
  const parts = identifier.split(".");
  const name = parts.at(-1) || "";
  if (!name) return { relation: null, page: { items: [], truncated: false } };
  const relationPrefix = parts.length > 1 ? parts.slice(-2).join(".") : name;
  const page = await store.getRelations(scope, relationPrefix, 100);
  const candidates = page.items.filter(
    (relation) =>
      identifiersEqual(relation.name, name) &&
      (parts.length < 2 || identifiersEqual(relation.schema, parts.at(-2) || ""))
  );
  if (candidates.length <= 1) return { relation: candidates[0] || null, page };
  const defaultSchema = defaultSchemaFor(candidates, scope.context);
  const relation =
    (defaultSchema ? candidates.find((candidate) => identifiersEqual(candidate.schema, defaultSchema)) : undefined) ||
    candidates[0];
  return { relation, page };
}

function relationCompletion(relations: ChenQualifiedRelation[], context: string, dialect: SQLDialect) {
  const schema = relationNamespace(relations);
  return schemaCompletionSource({
    dialect,
    schema,
    defaultSchema: defaultSchemaFor(relations, context)
  });
}

function qualifiedColumnCompletion(
  relation: ChenQualifiedRelation,
  columns: Array<{ name: string; dataType: string | null; nullable: boolean }>,
  context: string,
  dialect: SQLDialect
) {
  const schema: Record<string, Record<string, SQLNamespace>> = {
    [relation.schema]: {
      [relation.name]: columns.map((column) => ({
        label: column.name,
        type: "property",
        detail: column.dataType || undefined
      }))
    }
  };
  return schemaCompletionSource({ dialect, schema, defaultSchema: defaultSchemaFor([relation], context) });
}

function unqualifiedColumnCompletion(
  relations: ChenQualifiedRelation[],
  columnsByRelation: Awaited<ReturnType<ChenSqlMetadataStore["getColumns"]>>,
  dialect: SQLDialect
) {
  const columns = new Map<string, { label: string; type: string; detail: string }>();
  for (const relation of relations) {
    for (const column of columnsFor(columnsByRelation, relation)) {
      const existing = columns.get(column.name);
      const relationLabel = relation.name;
      columns.set(column.name, {
        label: column.name,
        type: "property",
        detail: existing ? `${existing.detail}, ${relationLabel}` : relationLabel
      });
    }
  }
  return schemaCompletionSource({ dialect, schema: [...columns.values()] });
}

function relationNamespace(relations: ChenQualifiedRelation[]) {
  const schema: Record<string, Record<string, SQLNamespace>> = {};
  for (const relation of relations) {
    const namespace = schema[relation.schema] || (schema[relation.schema] = {});
    namespace[relation.name] = [];
  }
  return schema;
}

function defaultSchemaFor(relations: ChenQualifiedRelation[], context: string) {
  const contextName = context.split(".").at(-1) || context;
  const contextSchema = relations.find((relation) => identifiersEqual(relation.schema, contextName))?.schema;
  if (contextSchema) return contextSchema;
  const dbo = relations.find((relation) => identifiersEqual(relation.schema, "dbo"))?.schema;
  if (dbo) return dbo;
  const schemas = new Set(relations.map((relation) => relation.schema));
  return schemas.size === 1 ? relations[0]?.schema : undefined;
}

function currentIdentifierPrefix(statement: string) {
  return statement.match(/[a-z_][\w$]*$/i)?.[0] || "";
}

function identifiersEqual(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}
