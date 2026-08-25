export interface ChenSqlMetadataScope {
  nodeKey: string;
  context: string;
}

export interface ChenQualifiedRelation {
  catalog: string | null;
  schema: string;
  name: string;
  kind: "table" | "view" | "materialized_view";
}

export interface ChenSqlColumnMetadata {
  name: string;
  dataType: string | null;
  nullable: boolean;
}

export interface ChenRelationMetadataPage {
  items: ChenQualifiedRelation[];
  truncated: boolean;
}

export interface ChenRelationColumnsMetadata {
  relation: ChenQualifiedRelation;
  columns: ChenSqlColumnMetadata[];
}
