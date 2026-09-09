import type { PermOrgItem } from "~/types";
import { describe, expect, it, vi } from "vitest";

vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: vi.fn() }));
vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: vi.fn(), desktopOs: {} }));
vi.mock("~/utils", () => ({ transformAssetDetail: vi.fn() }));
vi.mock("~/utils/connection", () => ({
  hasReusableSavedConnection: vi.fn(),
  isSavedConnectionAvailable: vi.fn()
}));

import { syncSessionWindowOrganization } from "./useSessionWindowConnect";

const organization = (id: string): PermOrgItem => ({
  id,
  name: id,
  is_root: false,
  is_default: false,
  is_system: false
});

describe("syncSessionWindowOrganization", () => {
  it("writes the query org back before connecting", async () => {
    const setCurrentOrg = vi.fn();
    const syncDesktopOrg = vi.fn().mockResolvedValue(undefined);
    const target = organization("org-a");

    await syncSessionWindowOrganization("org-a", {
      organizations: [target, organization("org-b")],
      currentOrgId: "org-b",
      setCurrentOrg,
      syncDesktopOrg
    });

    expect(setCurrentOrg).toHaveBeenCalledWith(target);
    expect(syncDesktopOrg).toHaveBeenCalledWith("org-a");
  });

  it("still syncs the desktop session when the org is already selected", async () => {
    const setCurrentOrg = vi.fn();
    const syncDesktopOrg = vi.fn().mockResolvedValue(undefined);

    await syncSessionWindowOrganization("org-a", {
      organizations: [organization("org-a")],
      currentOrgId: "org-a",
      setCurrentOrg,
      syncDesktopOrg
    });

    expect(setCurrentOrg).not.toHaveBeenCalled();
    expect(syncDesktopOrg).toHaveBeenCalledWith("org-a");
  });

  it("syncs an unmatched query org to the desktop session only", async () => {
    const setCurrentOrg = vi.fn();
    const syncDesktopOrg = vi.fn().mockResolvedValue(undefined);

    await syncSessionWindowOrganization("org-a", {
      organizations: [organization("org-b")],
      currentOrgId: "org-b",
      setCurrentOrg,
      syncDesktopOrg
    });

    expect(setCurrentOrg).not.toHaveBeenCalled();
    expect(syncDesktopOrg).toHaveBeenCalledWith("org-a");
  });
});
