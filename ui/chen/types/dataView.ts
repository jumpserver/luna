export interface ChenDataViewField {
  name: string;
  label?: string;
  columnName?: string;
  schema?: string;
  table?: string;
  sourceSchema?: string;
  sourceTable?: string;
  sourceColumn?: string;
  type?: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  primaryKey?: boolean;
  editable?: boolean;
  insertable?: boolean;
  masked?: boolean;
  editReason?: string;
}

export interface ChenDataViewDataset {
  fields: ChenDataViewField[];
  data: Array<Record<string, any>>;
  editable?: boolean;
  editReason?: string;
}
