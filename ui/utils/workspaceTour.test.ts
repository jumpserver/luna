import { describe, expect, it } from "vitest";
import enMessages from "../../i18n/locales/en.json";
import zhMessages from "../../i18n/locales/zh.json";
import { buildWorkspaceTourSteps, WORKSPACE_TOUR_STORAGE_KEY } from "~/utils/workspaceTour";

const translate = (messages: unknown) => (key: string) => {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, messages);
  if (typeof value !== "string") throw new TypeError(`Missing translation: ${key}`);
  return value;
};

describe("workspace tour", () => {
  it("covers the outer workspace chrome in both languages", () => {
    const chineseSteps = buildWorkspaceTourSteps(translate(zhMessages));
    const englishSteps = buildWorkspaceTourSteps(translate(enMessages));

    expect(WORKSPACE_TOUR_STORAGE_KEY).toBe("luna:workspace-tour:v1");
    expect(chineseSteps).toHaveLength(3);
    expect(englishSteps).toHaveLength(chineseSteps.length);
    expect(chineseSteps.map((step) => step.element)).toEqual([
      '[data-workspace-tour="assets"]',
      '[data-workspace-tour="node"]',
      '[data-workspace-tour="add-session"]'
    ]);
    expect(chineseSteps[0]?.popover?.title).toBe("右击资产 → 连接");
    expect(englishSteps[0]?.popover?.title).toBe("Right-click asset → Connect");
    expect(chineseSteps[2]?.popover?.side).toBe("bottom");
  });

  it("keeps workspace tour translation trees aligned", () => {
    const leafKeys = (value: unknown, prefix = ""): string[] => {
      if (!value || typeof value !== "object") return [prefix];
      return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
    };

    expect(leafKeys(enMessages.WorkspaceTour).sort()).toEqual(leafKeys(zhMessages.WorkspaceTour).sort());
    expect(leafKeys(enMessages.WorkspaceEmpty).sort()).toEqual(leafKeys(zhMessages.WorkspaceEmpty).sort());
  });
});
