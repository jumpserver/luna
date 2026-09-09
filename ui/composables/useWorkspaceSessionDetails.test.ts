import { describe, expect, it } from "vitest";
import { formatSessionAccount } from "./useWorkspaceSessionDetails";

describe("formatSessionAccount", () => {
  it("collapses the redundant name(username) form", () => {
    expect(formatSessionAccount("root(root)")).toBe("root");
  });

  it("keeps a distinct account name and username", () => {
    expect(formatSessionAccount("运维账号(root)")).toBe("运维账号(root)");
  });

  it("passes through plain accounts and empty values", () => {
    expect(formatSessionAccount("root")).toBe("root");
    expect(formatSessionAccount("")).toBe("");
  });
});
