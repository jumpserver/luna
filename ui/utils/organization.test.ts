import { describe, expect, it } from "vitest";

import type { PermOrgItem } from "~/types";
import { getFallbackOrganization, resolveOrganizationSelection } from "~/utils/organization";

const organization = (id: string, isDefault = false): PermOrgItem => ({
  id,
  name: id,
  is_root: false,
  is_default: isDefault,
  is_system: false
});

describe("organization fallback", () => {
  it("keeps the recorded organization ahead of the default", () => {
    const recordedOrg = organization("recorded");

    expect(resolveOrganizationSelection([recordedOrg, organization("DEFAULT", true)], recordedOrg)).toMatchObject({
      id: "recorded"
    });
  });

  it("uses organization details from the available list for a recorded id", () => {
    const recordedOrg = organization("recorded");

    expect(resolveOrganizationSelection([recordedOrg], { id: "recorded" })).toMatchObject({
      id: "recorded",
      name: "recorded"
    });
  });

  it("prefers the default organization", () => {
    const defaultOrg = organization("DEFAULT", true);

    expect(resolveOrganizationSelection([organization("other"), defaultOrg], { id: "" })).toBe(defaultOrg);
  });

  it("falls back to the first organization when no default exists", () => {
    const firstOrg = organization("first");

    expect(getFallbackOrganization([firstOrg, organization("second")])).toBe(firstOrg);
  });

  it("returns null for an empty organization list", () => {
    expect(getFallbackOrganization([])).toBeNull();
  });
});
