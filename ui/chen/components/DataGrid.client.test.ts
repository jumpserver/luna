import { describe, expect, it } from "vitest";
import { computed } from "vue";
import dataGridSource from "~/chen/components/DataGrid.client.vue?raw";
import {
  acceptChenSaveChangesPreviewResult,
  applyChenDataViewCellChange,
  beginChenDataViewRequest,
  buildChenSaveChangesPayload,
  chenDataViewRows,
  createChenDataViewEditState
} from "~/chen/utils/dataViewEditing";

function displayedDataGridRows(props: Record<string, unknown>) {
  const declaration = dataGridSource.match(/const rowData = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0];
  if (!declaration) throw new Error("DataGrid rowData computation not found");
  const rowData = new Function("computed", "props", "chenDataViewRows", `${declaration}; return rowData;`)(
    computed,
    props,
    chenDataViewRows
  );
  return rowData.value;
}

describe("Chen DataGrid save preview", () => {
  it("keeps pending cell values displayed while the save confirmation is open", () => {
    const state = createChenDataViewEditState();
    const data = {
      editable: true,
      fields: [
        {
          name: "id",
          sourceColumn: "id",
          sourceTable: "products",
          sourceSchema: "public",
          primaryKey: true,
          editable: false
        },
        {
          name: "price",
          sourceColumn: "price",
          sourceTable: "products",
          sourceSchema: "public",
          type: "DECIMAL",
          editable: true
        }
      ],
      data: [{ id: 1, price: "22.40" }]
    };
    const price = data.fields[1]!;

    applyChenDataViewCellChange(state, data, data.data[0]!, price, "22.40", "33.33");
    const payload = buildChenSaveChangesPayload(
      { title: "products", schema: "public", table: "products" },
      data,
      state
    );
    const request = beginChenDataViewRequest(state, "preview", payload);

    expect(request).not.toBeNull();
    expect(
      acceptChenSaveChangesPreviewResult(state, {
        success: true,
        dataView: "products",
        changeCount: 1
      })
    ).toBe("confirm");
    expect(state.activeRequest?.kind).toBe("confirm");
    expect(displayedDataGridRows({ dataset: data, editState: state, editMode: "none" })[0]?.price).toBe("33.33");
    expect(data.data[0]?.price).toBe("22.40");
  });
});
