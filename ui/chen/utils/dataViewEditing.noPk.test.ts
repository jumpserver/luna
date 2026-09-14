import { describe, expect, it } from "vitest";

import {
  chenDataViewMissingPrimaryKey,
  CHEN_EDIT_REASON_NO_PRIMARY_KEY
} from "~/chen/utils/dataViewEditing";

describe("chenDataViewMissingPrimaryKey", () => {
  it("detects the backend no-primary-key edit reason", () => {
    expect(
      chenDataViewMissingPrimaryKey({
        fields: [{ name: "name", editReason: CHEN_EDIT_REASON_NO_PRIMARY_KEY }],
        data: []
      })
    ).toBe(true);
  });

  it("detects loaded table metadata without a primary key", () => {
    expect(
      chenDataViewMissingPrimaryKey(
        { fields: [{ name: "name" }], data: [] },
        { tableMetadata: { loadedSections: ["primaryKey"], primaryKey: null } }
      )
    ).toBe(true);
  });

  it("does not flag views or incomplete metadata", () => {
    expect(
      chenDataViewMissingPrimaryKey(
        { fields: [{ name: "name" }], data: [] },
        { isView: true, tableMetadata: { loadedSections: ["primaryKey"], primaryKey: null } }
      )
    ).toBe(false);
    expect(
      chenDataViewMissingPrimaryKey(
        { fields: [{ name: "name" }], data: [] },
        { tableMetadata: { loadedSections: ["columns"], primaryKey: null } }
      )
    ).toBe(false);
  });
});
