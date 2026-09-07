export interface ChenSchemaOverviewCapabilities {
  tableRows: boolean;
  tableSize: boolean;
  tableEngine: boolean;
  tableCharacterSet: boolean;
  tableCollation: boolean;
  tableComment: boolean;
  viewComment: boolean;
  statistics: boolean;
  indexes: boolean;
  ddl: boolean;
  diagram: boolean;
  diagramRelationships: boolean;
}

export type ChenSchemaMetadataSection = "tables" | "views" | "statistics" | "indexes" | "ddl" | "diagram";

export interface ChenSchemaOverviewStatistic {
  schema: string;
  table: string;
  estimatedRows: number | null;
  totalSizeBytes: number | null;
}

export interface ChenSchemaOverviewTable {
  name: string;
  schema: string;
  estimatedRows: number | null;
  totalSizeBytes: number | null;
  engine: string | null;
  characterSet: string | null;
  collation: string | null;
  comment: string | null;
}

export interface ChenSchemaOverviewView {
  name: string;
  schema: string;
  type: string;
  comment: string | null;
}

export interface ChenSchemaOverviewIndex {
  name: string;
  schema: string;
  table: string;
  columns: string[];
  unique: boolean | null;
  method: string | null;
  definition: string | null;
}

export interface ChenSchemaDiagramColumn {
  name: string;
  ordinal: number;
  nativeType: string;
  nullable: boolean;
}

export interface ChenSchemaDiagramForeignKey {
  name: string;
  columns: string[];
  referencedSchema: string | null;
  referencedTable: string | null;
  referencedColumns: string[];
}

export interface ChenSchemaDiagramTable {
  schema: string;
  name: string;
  columns: ChenSchemaDiagramColumn[];
  primaryKey: string[];
  foreignKeys: ChenSchemaDiagramForeignKey[];
}

export interface ChenSchemaOverview {
  catalog: string | null;
  schema: string;
  capabilities: ChenSchemaOverviewCapabilities;
  loadedSections: ChenSchemaMetadataSection[];
  tables: ChenSchemaOverviewTable[];
  views: ChenSchemaOverviewView[];
  statistics: ChenSchemaOverviewStatistic[];
  indexes: ChenSchemaOverviewIndex[];
  diagram: ChenSchemaDiagramTable[];
  ddl: string | null;
}
