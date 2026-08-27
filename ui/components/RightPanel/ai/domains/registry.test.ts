import { describe, expect, it } from "vitest";
import { aiPanelDomainRegistry, createAiViewItemBuilders, resolveAiTimelineRenderer } from "./registry";

describe("AI panel domain registry", () => {
  it("registers one adapter, builder, and renderer for every workspace domain", () => {
    const ids = aiPanelDomainRegistry.map(({ adapter }) => adapter.id);
    const builderDomains = createAiViewItemBuilders().map(({ domain }) => domain);

    expect(ids).toEqual(["sql", "terminal"]);
    expect(builderDomains).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
    expect(resolveAiTimelineRenderer("shared")).toBeTruthy();
    for (const id of ids) expect(resolveAiTimelineRenderer(id)).toBeTruthy();
  });
});
