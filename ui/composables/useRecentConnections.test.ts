import { describe, expect, it, vi } from "vitest";
import { normalizeRecentConnections } from "~/composables/useRecentConnections";

vi.mock("~/store/modules/userInfo", () => ({ useUserInfoStore: vi.fn() }));

const asset = (id: string, orgId: string) => ({ id, org_id: orgId });

describe("recent connections", () => {
  it("merges persisted connections across organizations and keeps the newest asset snapshot", () => {
    const connections = normalizeRecentConnections([
      asset("asset-1", "org-b"),
      asset("asset-2", "org-b"),
      asset("asset-1", "org-a")
    ]);

    expect(connections).toEqual([asset("asset-1", "org-b"), asset("asset-2", "org-b")]);
  });
});
