import { describe, expect, it } from "vitest";
import { resolveAiPanelTarget } from "./target";

const base = {
  workspaceMode: "assets" as const,
  paneId: "workspace-pane",
  ownerFileTargetId: "",
  ownerFileTargetAllowed: true,
  globalFileTargetId: "global-file-pane",
  compactFileTargetId: "compact-file-pane",
  preferCompactFileAi: false
};

describe("AI panel target routing", () => {
  it("routes the files workspace to its scoped SFTP target", () => {
    expect(resolveAiPanelTarget({ ...base, workspaceMode: "files" })).toBe("global-file-pane");
  });

  it("routes a file-manager owner to its selected nested SFTP target", () => {
    expect(resolveAiPanelTarget({ ...base, ownerFileTargetId: "nested-file-pane" })).toBe("nested-file-pane");
  });

  it("ignores a stale File AI owner when the pane now hosts another domain", () => {
    expect(
      resolveAiPanelTarget({
        ...base,
        ownerFileTargetId: "stale-file-pane",
        ownerFileTargetAllowed: false
      })
    ).toBe("workspace-pane");
  });

  it("uses compact SFTP only when it is the selected AI context", () => {
    expect(resolveAiPanelTarget({ ...base, preferCompactFileAi: true })).toBe("compact-file-pane");
    expect(resolveAiPanelTarget(base)).toBe("workspace-pane");
  });

  it("does not fall back to another workspace when the selected file context is unavailable", () => {
    expect(
      resolveAiPanelTarget({
        ...base,
        workspaceMode: "files",
        globalFileTargetId: ""
      })
    ).toBe("");
    expect(
      resolveAiPanelTarget({
        ...base,
        compactFileTargetId: "",
        preferCompactFileAi: true
      })
    ).toBe("");
  });
});
