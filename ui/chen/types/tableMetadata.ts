export type ChenTableMetadataSection = "columns" | "primaryKey" | "foreignKeys" | "indexes" | "constraints" | "ddl";

export interface ChenTableMetadataCapabilities {
  columns: boolean;
  primaryKey: boolean;
  foreignKeys: boolean;
  indexes: boolean;
  constraints: boolean;
  ddl: boolean;
}

export interface ChenTableMetadataColumn {
  name: string;
  ordinal: number;
  nativeType: string;
  jdbcType: number;
  size: number | null;
  scale: number | null;
  nullable: boolean;
  defaultValue: string | null;
  comment: string | null;
}

export interface ChenTablePrimaryKey {
  name: string;
  columns: string[];
}

export interface ChenTableForeignKey {
  name: string;
  columns: string[];
  referencedCatalog: string | null;
  referencedSchema: string | null;
  referencedTable: string;
  referencedColumns: string[];
}

export interface ChenTableIndexPart {
  ordinal: number;
  columnName: string | null;
  expression: string | null;
  sortOrder: string | null;
  included: boolean;
}

export interface ChenTableIndex {
  name: string;
  unique: boolean;
  method: string | null;
  parts: ChenTableIndexPart[];
  definition: string | null;
}

export interface ChenTableConstraint {
  name: string;
  type: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK";
  columns: string[];
  referencedCatalog: string | null;
  referencedSchema: string | null;
  referencedTable: string | null;
  referencedColumns: string[];
  definition: string | null;
}

export interface ChenTableMetadata {
  catalog: string | null;
  schema: string;
  name: string;
  kind: "table";
  capabilities: ChenTableMetadataCapabilities;
  loadedSections: ChenTableMetadataSection[];
  columns: ChenTableMetadataColumn[];
  primaryKey: ChenTablePrimaryKey | null;
  foreignKeys: ChenTableForeignKey[];
  indexes: ChenTableIndex[];
  constraints: ChenTableConstraint[];
  ddl: string | null;
}
