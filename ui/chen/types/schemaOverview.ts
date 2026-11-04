export interface ChenSchemaDiagramColumn {
  name: string;
  ordinal: number | null;
  nativeType: string | null;
  nullable: boolean | null;
}

export interface ChenSchemaDiagramForeignKey {
  referencedId?: string;
  incomplete?: boolean;
  ordinals?: (number | null)[];
  name: string;
  columns: string[];
  referencedSchema: string | null;
  referencedTable: string | null;
  referencedColumns: string[];
}

export interface ChenSchemaDiagramTable {
  openable?: boolean;
  object?: {
    database: string;
    schema: string;
    name: string;
    kind: "table" | "view";
    object_type?: string;
    comment?: string;
  };
  // Explicit scoped identities override the legacy schema/name identity.
  id?: string;
  database?: string;
  metadataStatus?: "Current" | "NotLoaded" | "External" | "Unknown";
  schema: string;
  name: string;
  columns: ChenSchemaDiagramColumn[];
  primaryKey: string[];
  foreignKeys: ChenSchemaDiagramForeignKey[];
}
