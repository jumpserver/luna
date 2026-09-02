import { describe, expect, it } from "vitest";
import kubernetesWorkspace from "../../workspaces/KubernetesWorkspace.vue?raw";

describe("kubernetes workspace click typing", () => {
  it("wraps UButton assignment clicks so they do not return boolean", () => {
    expect(kubernetesWorkspace).toContain('@click="void (resourceTreeOpen = false)"');
    expect(kubernetesWorkspace).toContain('@click="void (resourceTreeOpen = true)"');
  });

  it("keeps the themed terminal edge-to-edge with FitAddon-aware text spacing", () => {
    expect(kubernetesWorkspace).toMatch(
      /\.kubernetes-terminal :deep\(\.terminal\)\s*\{[^}]*height:\s*100%;[^}]*padding:\s*6px 8px;/
    );
    expect(kubernetesWorkspace).not.toMatch(/\.xterm-scrollable-element\s*\{[^}]*padding:/);
    expect(kubernetesWorkspace).not.toContain("background-color: transparent !important");
  });
});
