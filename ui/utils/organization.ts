import type { PermOrgItem } from "~/types";

const DEFAULT_ORGANIZATION: PermOrgItem = {
  id: "00000000-0000-0000-0000-000000000002",
  name: "Default",
  is_root: false,
  is_default: true,
  is_system: false
};

export const getDefaultOrganization = (orgs: PermOrgItem[]) =>
  orgs.find((org) => org.id === DEFAULT_ORGANIZATION.id) || { ...DEFAULT_ORGANIZATION };

export const getOrganizationAvatarText = (name: string) => {
  const characters = Array.from(name.trim());
  const length = /^\p{Script=Han}$/u.test(characters[0] || "") ? 1 : 2;

  return characters.slice(0, length).join("");
};

export const getFallbackOrganization = (orgs: PermOrgItem[]) => orgs.find((org) => org.is_default) || orgs[0] || null;

const normalizeOrgList = (value: unknown): PermOrgItem[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is PermOrgItem => {
      return (
        !!item &&
        typeof item === "object" &&
        typeof (item as PermOrgItem).id === "string" &&
        typeof (item as PermOrgItem).name === "string"
      );
    });
  }

  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  if (Array.isArray(record.results)) return normalizeOrgList(record.results);
  if (Array.isArray(record.data)) return normalizeOrgList(record.data);
  if (record.results && typeof record.results === "object") return normalizeOrgList(record.results);
  if (record.data && typeof record.data === "object") return normalizeOrgList(record.data);

  return [];
};

export const selectWorkbenchOrganizations = (permissionOrgData: unknown): PermOrgItem[] => {
  const record =
    permissionOrgData && typeof permissionOrgData === "object" ? (permissionOrgData as Record<string, unknown>) : {};
  const orgs = normalizeOrgList(record.workbench_orgs);
  return orgs.filter((org, index, self) => index === self.findIndex((item) => item.id === org.id));
};

export const recordedOrganizationForBootstrap = (
  persistedOrg?: Partial<PermOrgItem> | null,
  coreCurrentOrg?: Partial<PermOrgItem> | null
) => (persistedOrg?.id ? persistedOrg : coreCurrentOrg) || null;

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
