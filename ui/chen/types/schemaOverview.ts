export interface ChenSchemaOverviewCapabilities {
  tableRows: boolean;
  tableSize: boolean;
  tableEngine: boolean;
  tableCharacterSet: boolean;
  tableCollation: boolean;
  tableComment: boolean;
  viewComment: boolean;
  indexes: boolean;
  ddl: boolean;
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

export interface ChenSchemaOverview {
  catalog: string | null;
  schema: string;
  capabilities: ChenSchemaOverviewCapabilities;
  tables: ChenSchemaOverviewTable[];
  views: ChenSchemaOverviewView[];
  indexes: ChenSchemaOverviewIndex[];
  ddl: string | null;
}
