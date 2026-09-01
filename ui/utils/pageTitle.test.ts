import { describe, expect, it } from "vitest";

import { COMMUNITY_WORKSPACE_BRAND, formatWorkspaceTitle, resolveWorkspaceBrand } from "~/utils/pageTitle";

describe("resolveWorkspaceBrand", () => {
  it("keeps the community edition title fixed", () => {
    expect(
      resolveWorkspaceBrand({
        XPACK_LICENSE_IS_VALID: false,
        INTERFACE: { login_title: "Custom brand" }
      })
    ).toBe(COMMUNITY_WORKSPACE_BRAND);
  });

  it("uses the configured login title for the enterprise edition", () => {
    expect(
      resolveWorkspaceBrand({
        XPACK_LICENSE_IS_VALID: true,
        INTERFACE: { login_title: "Acme" }
      })
    ).toBe("Acme");
  });

  it("falls back to the community title when settings are unavailable or incomplete", () => {
    expect(resolveWorkspaceBrand(null)).toBe(COMMUNITY_WORKSPACE_BRAND);
    expect(resolveWorkspaceBrand({ XPACK_LICENSE_IS_VALID: true })).toBe(COMMUNITY_WORKSPACE_BRAND);
  });

  it("formats the title with the localized workspace label", () => {
    expect(formatWorkspaceTitle("JumpServer", "工作台")).toBe("Luna - JumpServer 工作台");
    expect(formatWorkspaceTitle("JumpServer", "Workspace")).toBe("Luna - JumpServer Workspace");
  });
});
