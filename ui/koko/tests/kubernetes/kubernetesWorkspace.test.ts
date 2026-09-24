import { describe, expect, it } from "vitest";
import kubernetesWorkspace from "../../workspaces/KubernetesWorkspace.vue?raw";

describe("kubernetes workspace click typing", () => {
  it("wraps UButton assignment clicks so they do not return boolean", () => {
    expect(kubernetesWorkspace).toContain('@click="void (resourceTreeOpen = false)"');
    expect(kubernetesWorkspace).toContain('@click="void (resourceTreeOpen = true)"');
  });

  it("hides the idle empty placeholder while the connection progress overlay is showing", () => {
    expect(kubernetesWorkspace).toContain('v-if="!terminalTabs.length && !connectingOverlay"');
    expect(kubernetesWorkspace).toContain("koko.kubernetes.empty");
  });

  it("keeps the themed terminal edge-to-edge with FitAddon-aware text spacing", () => {
    expect(kubernetesWorkspace).toMatch(
      /\.kubernetes-terminal :deep\(\.terminal\)\s*\{[^}]*height:\s*100%;[^}]*padding:\s*8px 2px 4px 8px;/
    );
    expect(kubernetesWorkspace).not.toMatch(/\.xterm-scrollable-element\s*\{[^}]*padding:/);
    expect(kubernetesWorkspace).not.toContain("background-color: transparent !important");
  });

  it("keeps Ctrl+C as an interrupt and copies only on an explicit chord", () => {
    expect(kubernetesWorkspace).toContain("isTerminalCopyChord(event)");
    expect(kubernetesWorkspace).not.toContain("event.key.toLowerCase() === KeyboardKey.C && terminal.hasSelection()");
  });

  it("marks post-connection protocol and transport failures as dismissible", () => {
    expect(kubernetesWorkspace).toContain("const connectorConnected = ref(false)");
    expect(kubernetesWorkspace).toContain("{ dismissible: connectorConnected.value }");
    expect(kubernetesWorkspace).toContain("const stopFailureListener = terminalSocket.onFailure((failure) =>");
  });
});
