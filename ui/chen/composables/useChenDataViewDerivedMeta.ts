import type { Ref } from "vue";
import type { ChenDataViewConsoleTab } from "~/chen/types";

export interface ChenDataViewColumnPreview {
  name: string;
  type: string;
  nullable: string;
  key: string;
}

export interface ChenDataViewForeignKeyPreview {
  name: string;
  column: string;
  references: string;
}

export interface ChenDataViewIndexPreview {
  name: string;
  columns: string;
  unique: string;
  method: string;
  definition: string;
  protected: boolean;
}

export function useChenDataViewDerivedMeta(profileDbType: Ref<string | undefined>, protocol: Ref<string | undefined>) {
  const dataViewPropertyTabs = [
    { id: "basic", label: "Basic Info" },
    { id: "columns", label: "Columns" },
    { id: "indexes", label: "Indexes" },
    { id: "foreignKeys", label: "Foreign Keys" },
    { id: "constraints", label: "Constraints" },
    { id: "ddl", label: "DDL" },
    { id: "diagram", label: "Diagram" }
  ] as const;

  function tableLabelForProperties(tab: ChenDataViewConsoleTab) {
    return tab.tableMetadata?.name || tab.meta?.table || tab.meta?.title || tab.title;
  }

  function dataViewBasicInfo(tab: ChenDataViewConsoleTab) {
    return [
      { label: "Name", value: tableLabelForProperties(tab) },
      { label: "Schema", value: tab.tableMetadata?.schema || tab.meta?.schema || "-" },
      { label: "Type", value: "Table" },
      { label: "Database", value: profileDbType.value || protocol.value || "-" },
      { label: "Rows (preview)", value: String(tab.data?.data?.length || 0) }
    ];
  }

  function dataViewColumns(tab: ChenDataViewConsoleTab): ChenDataViewColumnPreview[] {
    const primaryColumns = new Set(tab.tableMetadata?.primaryKey?.columns || []);
    return (tab.tableMetadata?.columns || []).map((column) => ({
      name: column.name,
      type: column.nativeType || "-",
      nullable: column.nullable ? "YES" : "NO",
      key: primaryColumns.has(column.name) ? "PK" : ""
    }));
  }

  function dataViewIndexes(tab: ChenDataViewConsoleTab): ChenDataViewIndexPreview[] {
    const protectedNames = new Set([
      ...(tab.tableMetadata?.constraints || []).map((constraint) => constraint.name),
      ...(tab.tableMetadata?.primaryKey ? [tab.tableMetadata.primaryKey.name] : [])
    ]);
    return (tab.tableMetadata?.indexes || []).map((index) => ({
      name: index.name,
      columns: index.parts
        .map((part) => {
          const value = part.columnName || part.expression || "-";
          return `${value}${part.sortOrder ? ` ${part.sortOrder}` : ""}${part.included ? " (included)" : ""}`;
        })
        .join(", "),
      unique: index.unique ? "YES" : "NO",
      method: index.method || "-",
      definition: index.definition || "",
      protected: protectedNames.has(index.name)
    }));
  }

  function dataViewForeignKeys(tab: ChenDataViewConsoleTab): ChenDataViewForeignKeyPreview[] {
    return (tab.tableMetadata?.foreignKeys || []).map((foreignKey) => {
      const target = [foreignKey.referencedSchema, foreignKey.referencedTable].filter(Boolean).join(".");
      return {
        name: foreignKey.name,
        column: foreignKey.columns.join(", "),
        references: `${target}(${foreignKey.referencedColumns.join(", ")})`
      };
    });
  }

  function dataViewConstraints(tab: ChenDataViewConsoleTab) {
    return (tab.tableMetadata?.constraints || []).map((constraint) => ({
      name: constraint.name,
      type: constraint.type,
      definition: constraint.definition || "-"
    }));
  }

  function dataViewDDL(tab: ChenDataViewConsoleTab) {
    return tab.tableMetadata?.ddl || "";
  }

  return {
    dataViewPropertyTabs,
    dataViewBasicInfo,
    dataViewColumns,
    dataViewConstraints,
    dataViewDDL,
    dataViewForeignKeys,
    dataViewIndexes,
    tableLabelForProperties
  };
}
