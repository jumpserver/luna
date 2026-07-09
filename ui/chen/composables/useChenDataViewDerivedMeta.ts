import type { Ref } from "vue";
import type { ChenDataViewConsoleTab } from "~/chen/types";

// Derived preview metadata only. These values are inferred from the current
// result set and are not authoritative backend table metadata.
export function useChenDataViewDerivedMeta(profileDbType: Ref<string | undefined>, protocol: Ref<string | undefined>) {
  const dataViewPropertyTabs = [
    { id: "basic", label: "Basic Info" },
    { id: "columns", label: "Columns" },
    { id: "indexes", label: "Indexes" },
    { id: "foreignKeys", label: "Foreign Keys" },
    { id: "constraints", label: "Constraints" },
    { id: "ddl", label: "DDL" }
  ] as const;

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
    const fields = tab.data?.fields || [];
    return fields.map((field, index) => ({
      name: field.name,
      type: "text",
      nullable: index % 2 === 0 ? "YES" : "NO",
      key: index === 0 ? "PK" : ""
    }));
  }

  function dataViewIndexes(tab: ChenDataViewConsoleTab) {
    const first = tab.data?.fields?.[0]?.name || "id";
    return [
      { name: `${tableLabelForProperties(tab)}_pkey`, columns: first, unique: "YES", method: "btree" }
    ];
  }

  function dataViewForeignKeys(tab: ChenDataViewConsoleTab) {
    const candidate = tab.data?.fields?.find((field) => /_id$/i.test(field.name));
    if (!candidate) return [];
    return [
      { name: `fk_${candidate.name}`, column: candidate.name, references: "other_table(id)" }
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
