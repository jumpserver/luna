import { describe, expect, it } from "vitest";
import kubernetesWorkspace from "../../workspaces/KubernetesWorkspace.vue?raw";

describe("kubernetes workspace click typing", () => {
  it("wraps UButton assignment clicks so they do not return boolean", () => {
    expect(kubernetesWorkspace).toContain('@click="void (resourceTreeOpen = false)"');
    expect(kubernetesWorkspace).toContain('@click="void (resourceTreeOpen = true)"');
  });
});
