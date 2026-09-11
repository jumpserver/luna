import type { PermOrgItem } from "~/types";

import { describe, expect, it } from "vitest";
import {
  getFallbackOrganization,
  getOrganizationAvatarText,
  recordedOrganizationForBootstrap,
  resolveOrganizationSelection,
  selectWorkbenchOrganizations
} from "~/utils/organization";

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

  it("keeps the persisted organization ahead of Core current org", () => {
    const persistedOrg = organization("persisted");

    expect(recordedOrganizationForBootstrap(persistedOrg, organization("core-current", true))).toBe(persistedOrg);
  });

  it("uses Core current org when nothing is persisted", () => {
    const coreCurrentOrg = organization("core-current", true);

    expect(recordedOrganizationForBootstrap({ id: "" }, coreCurrentOrg)).toBe(coreCurrentOrg);
    expect(recordedOrganizationForBootstrap(null, coreCurrentOrg)).toBe(coreCurrentOrg);
  });
});

describe("selectWorkbenchOrganizations", () => {
  it("reads workbench_orgs and drops duplicate ids", () => {
    const first = organization("org-a");

    expect(
      selectWorkbenchOrganizations({
        workbench_orgs: [first, { ...first, name: "Org A" }, organization("org-b")],
        console_orgs: [organization("console-only")]
      })
    ).toEqual([first, organization("org-b")]);
  });

  it("unwraps nested results payloads", () => {
    const org = organization("nested");

    expect(
      selectWorkbenchOrganizations({
        workbench_orgs: { results: [org] }
      })
    ).toEqual([org]);
  });

  it("returns an empty list when workbench_orgs is missing", () => {
    expect(selectWorkbenchOrganizations({ console_orgs: [organization("console-only")] })).toEqual([]);
    expect(selectWorkbenchOrganizations(null)).toEqual([]);
  });
});

describe("organization avatar text", () => {
  it("uses one Han character and keeps two-character Latin initials", () => {
    expect(getOrganizationAvatarText("开发团队")).toBe("开");
    expect(getOrganizationAvatarText("Acme")).toBe("Ac");
  });
});
