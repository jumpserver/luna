import type { PermOrgItem } from "~/types";

export const getFallbackOrganization = (orgs: PermOrgItem[]) => orgs.find((org) => org.is_default) || orgs[0] || null;

export const resolveOrganizationSelection = (
  orgs: PermOrgItem[],
  recordedOrg?: Partial<PermOrgItem> | null
): PermOrgItem | null => {
  const recordedId = typeof recordedOrg?.id === "string" ? recordedOrg.id : "";
  const matchedOrg = orgs.find((org) => org.id === recordedId);

  if (matchedOrg) {
    return {
      ...matchedOrg,
      comment: recordedOrg?.comment || matchedOrg.comment
    };
  }

  if (recordedId && typeof recordedOrg?.name === "string" && recordedOrg.name) {
    return {
      id: recordedId,
      name: recordedOrg.name,
      is_root: recordedOrg.is_root === true,
      is_default: recordedOrg.is_default === true,
      is_system: recordedOrg.is_system === true,
      comment: recordedOrg.comment
    };
  }

  return getFallbackOrganization(orgs);
};
