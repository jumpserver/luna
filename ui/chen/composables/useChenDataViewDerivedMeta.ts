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
  inferred?: boolean;
}

// Derived preview metadata only. These values are inferred from the current
// result set and are not authoritative backend table metadata.
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

  function metaList(tab: ChenDataViewConsoleTab, ...keys: string[]) {
    for (const key of keys) {
      const value = tab.meta?.[key];
      if (Array.isArray(value))
        return value.filter((item): item is Record<string, any> => Boolean(item && typeof item === "object"));
    }
    return [];
  }

  function tableLabelForProperties(tab: ChenDataViewConsoleTab) {
    return tab.meta?.table || tab.meta?.title || tab.title;
  }

  function dataViewBasicInfo(tab: ChenDataViewConsoleTab) {
    return [
      { label: "Name", value: tableLabelForProperties(tab) },
      { label: "Schema", value: tab.meta?.schema || "public" },
      { label: "Type", value: "Table" },
      { label: "Database", value: profileDbType.value || protocol.value || "-" },
      { label: "Rows (preview)", value: String(tab.data?.data?.length || 0) }
    ];
  }

  function dataViewColumns(tab: ChenDataViewConsoleTab) {
    const metadataColumns = metaList(tab, "columns", "fields");
    if (metadataColumns.length) {
      return metadataColumns.map(
        (column): ChenDataViewColumnPreview => ({
          name: String(column.name || column.columnName || column.column_name || "-"),
          type: String(column.type || column.dataType || column.data_type || "-"),
          nullable:
            column.nullable === true || column.isNullable === true || String(column.nullable).toUpperCase() === "YES"
              ? "YES"
              : "NO",
          key: column.primaryKey === true || column.isPrimaryKey === true ? "PK" : String(column.key || "")
        })
      );
    }

    const fields = tab.data?.fields || [];
    return fields.map(
      (field, index): ChenDataViewColumnPreview => ({
        name: field.name,
        type: field.type || "-",
        nullable: field.nullable === false ? "NO" : "YES",
        key: field.primaryKey === true || field.isPrimaryKey === true || index === 0 ? "PK" : ""
      })
    );
  }

  function dataViewIndexes(tab: ChenDataViewConsoleTab) {
    const first = tab.data?.fields?.[0]?.name || "id";
    return [{ name: `${tableLabelForProperties(tab)}_pkey`, columns: first, unique: "YES", method: "btree" }];
  }

  function dataViewForeignKeys(tab: ChenDataViewConsoleTab) {
    const metadataForeignKeys = metaList(tab, "foreignKeys", "foreign_keys");
    if (metadataForeignKeys.length) {
      return metadataForeignKeys.map((foreignKey, index): ChenDataViewForeignKeyPreview => {
        const column =
          foreignKey.column || foreignKey.localColumn || foreignKey.local_column || foreignKey.columns?.[0];
        const targetTable =
          foreignKey.referencedTable ||
          foreignKey.referenced_table ||
          foreignKey.targetTable ||
          foreignKey.target_table;
        const targetColumn =
          foreignKey.referencedColumn ||
          foreignKey.referenced_column ||
          foreignKey.targetColumn ||
          foreignKey.target_column;
        return {
          name: String(foreignKey.name || `fk_${index + 1}`),
          column: String(column || "-"),
          references: String(foreignKey.references || `${targetTable || "-"}(${targetColumn || "-"})`)
        };
      });
    }

    const candidate = tab.data?.fields?.find((field) => /_id$/i.test(field.name));
    if (!candidate) return [];
    return [
      {
        name: `fk_${candidate.name}`,
        column: candidate.name,
        references: `${candidate.name.replace(/_id$/i, "")}(id)`,
        inferred: true
      }
    ];
  }

  function dataViewConstraints(tab: ChenDataViewConsoleTab) {
    const first = tab.data?.fields?.[0]?.name || "id";
    return [
      { name: `${tableLabelForProperties(tab)}_pkey`, type: "PRIMARY KEY", definition: `PRIMARY KEY (${first})` }
    ];
  }

  function dataViewDDL(tab: ChenDataViewConsoleTab) {
    const tableName = tableLabelForProperties(tab);
    const schema = tab.meta?.schema || "public";
    const fields = tab.data?.fields || [];
    const body = fields.length
      ? fields.map((field, index) => `  ${field.name} text${index === 0 ? " primary key" : ""}`).join(",\n")
      : "  id text primary key";
    return `CREATE TABLE ${schema}.${tableName} (\n${body}\n);`;
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
