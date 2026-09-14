import type { PermOrgItem } from "~/types";
import { describe, expect, it, vi } from "vitest";
import {
  buildAdminConnectSessionPath,
  syncSessionWindowOrganization,
  toAdminAssetItem
} from "./useSessionWindowConnect";

vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: vi.fn() }));
vi.mock("~/shared/desktop/bridge", () => ({ desktopInvoke: vi.fn(), desktopOs: {} }));
vi.mock("~/composables/useApiRequest", () => ({
  getAccountDetail: vi.fn(),
  getAssetDetailRequest: vi.fn(),
  getConsoleAssetDetail: vi.fn()
}));
vi.mock("~/utils/connection", () => ({
  hasReusableSavedConnection: vi.fn(),
  isSavedConnectionAvailable: vi.fn()
}));

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

describe("admin connect from Lina", () => {
  it("maps console query params onto the session window path", () => {
    expect(
      buildAdminConnectSessionPath({
        asset: "asset-1",
        account: "account-1",
        protocol: "ssh",
        org_id: "org-1"
      })
    ).toBe("/session/asset-1?protocol=ssh&account=account-1&accountId=account-1&accountMode=hosted&admin=1&org=org-1");
  });

  it("returns empty when Lina query is incomplete", () => {
    expect(buildAdminConnectSessionPath({ asset: "asset-1", protocol: "ssh" })).toBe("");
  });

  it("injects the console account so auto-connect can resolve it", () => {
    const asset = toAdminAssetItem(
      "asset-1",
      {
        name: "web-1",
        address: "10.0.0.1",
        protocols: [{ name: "ssh", port: 22, public: true }]
      },
      { id: "account-1", name: "root", username: "root", secret_type: { value: "password" } },
      "org-1"
    );

    expect(asset).toMatchObject({
      id: "asset-1",
      name: "web-1",
      org_id: "org-1",
      permedProtocols: [{ name: "ssh", port: 22, public: true }],
      permedAccounts: [{ id: "account-1", name: "root", username: "root", secret_type: "password" }]
    });
  });
});
