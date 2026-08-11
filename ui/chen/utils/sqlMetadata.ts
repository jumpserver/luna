import type {
  ChenQualifiedRelation,
  ChenRelationColumnsMetadata,
  ChenRelationMetadataPage,
  ChenSqlColumnMetadata,
  ChenSqlMetadataScope
} from "~/chen/types/sqlMetadata";

export interface ChenSqlMetadataClient {
  listRelations: (
    scope: ChenSqlMetadataScope,
    prefix: string,
    limit: number
  ) => Promise<ChenRelationMetadataPage>;
  listColumns: (
    scope: ChenSqlMetadataScope,
    relations: ChenQualifiedRelation[]
  ) => Promise<ChenRelationColumnsMetadata[]>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 30_000;

export class ChenSqlMetadataStore {
  private readonly client: ChenSqlMetadataClient;
  private readonly ttlMs: number;
  private generation = 0;
  private readonly relationCache = new Map<string, CacheEntry<ChenRelationMetadataPage>>();
  private readonly relationRequests = new Map<string, Promise<ChenRelationMetadataPage>>();
  private readonly columnCache = new Map<string, CacheEntry<ChenRelationColumnsMetadata>>();
  private readonly columnRequests = new Map<string, Promise<ChenRelationColumnsMetadata>>();

  constructor(client: ChenSqlMetadataClient, ttlMs = DEFAULT_TTL_MS) {
    this.client = client;
    this.ttlMs = ttlMs;
  }

  async getRelations(scope: ChenSqlMetadataScope, prefix = "", limit = 100) {
    const key = relationRequestKey(scope, prefix, limit);
    const cached = this.read(this.relationCache, key);
    if (cached) return cached;

    const pending = this.relationRequests.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const request: Promise<ChenRelationMetadataPage> = this.client
      .listRelations(scope, prefix, limit)
      .then((page) => {
        if (generation === this.generation) this.write(this.relationCache, key, page);
        return page;
      })
      .finally(() => {
        if (this.relationRequests.get(key) === request) this.relationRequests.delete(key);
      });
    this.relationRequests.set(key, request);
    return request;
  }

  async getColumns(scope: ChenSqlMetadataScope, relations: ChenQualifiedRelation[]) {
    const uniqueRelations = uniqueBy(relations, relationIdentity);
    const result = new Map<string, ChenRelationColumnsMetadata>();
    const missing: ChenQualifiedRelation[] = [];
    const waits: Array<Promise<ChenRelationColumnsMetadata>> = [];

    for (const relation of uniqueRelations) {
      const key = columnCacheKey(scope, relation);
      const cached = this.read(this.columnCache, key);
      if (cached) {
        result.set(relationIdentity(cached.relation), cached);
        continue;
      }
      const pending = this.columnRequests.get(key);
      if (pending) waits.push(pending);
      else missing.push(relation);
    }

    if (missing.length) {
      const generation = this.generation;
      const batch = this.client.listColumns(scope, missing).then((items) => {
        const byIdentity = new Map(items.map((item) => [relationIdentity(item.relation), item]));
        for (const relation of missing) {
          if (!byIdentity.has(relationIdentity(relation))) {
            throw new Error(`Chen metadata response omitted ${relation.schema}.${relation.name}`);
          }
        }
        return byIdentity;
      });

      for (const relation of missing) {
        const key = columnCacheKey(scope, relation);
        const request: Promise<ChenRelationColumnsMetadata> = batch
          .then((items) => {
            const item = items.get(relationIdentity(relation))!;
            if (generation === this.generation) this.write(this.columnCache, key, item);
            return item;
          })
          .finally(() => {
            if (this.columnRequests.get(key) === request) this.columnRequests.delete(key);
          });
        this.columnRequests.set(key, request);
        waits.push(request);
      }
    }

    for (const item of await Promise.all(waits)) {
      result.set(relationIdentity(item.relation), item);
    }
    return result;
  }

  invalidate(nodeKey?: string) {
    this.generation += 1;
    if (!nodeKey) {
      this.clearEntries();
      return;
    }
    const prefix = `${nodeKey}\u0000`;
    deleteMatching(this.relationCache, prefix);
    deleteMatching(this.relationRequests, prefix);
    deleteMatching(this.columnCache, prefix);
    deleteMatching(this.columnRequests, prefix);
  }

  clear() {
    this.generation += 1;
    this.clearEntries();
  }

  private clearEntries() {
    this.relationCache.clear();
    this.relationRequests.clear();
    this.columnCache.clear();
    this.columnRequests.clear();
  }

  private read<T>(cache: Map<string, CacheEntry<T>>, key: string) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt > Date.now()) return entry.value;
    cache.delete(key);
    return null;
  }

  private write<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
    cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export function relationIdentity(relation: ChenQualifiedRelation) {
  return [relation.catalog || "", relation.schema, relation.name, relation.kind].join("\u0000");
}

export function columnsFor(
  columnsByRelation: Map<string, ChenRelationColumnsMetadata>,
  relation: ChenQualifiedRelation
): ChenSqlColumnMetadata[] {
  return columnsByRelation.get(relationIdentity(relation))?.columns || [];
}

function relationRequestKey(scope: ChenSqlMetadataScope, prefix: string, limit: number) {
  return [scope.nodeKey, scope.context, prefix.toLocaleLowerCase(), limit].join("\u0000");
}

function columnCacheKey(scope: ChenSqlMetadataScope, relation: ChenQualifiedRelation) {
  return [scope.nodeKey, scope.context, relationIdentity(relation)].join("\u0000");
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}

function deleteMatching<T>(map: Map<string, T>, prefix: string) {
  for (const key of map.keys()) {
    if (key.startsWith(prefix)) map.delete(key);
  }
}
