import { expect, it } from "vitest";
import popover from "./terminalAiCommandPopover.vue?raw";

it("limits quick approval to one alert and restores the composer after output", () => {
  expect(popover).toContain("const quickApproval = computed(() => (visibleApprovals.value.length === 1");
  expect(popover).toContain("isTerminalAiApprovalShortcut(event, isMacOS.value)");
  expect(popover).toContain('void decideApproval(quickApproval.value.id, "approve")');
  expect(popover).toContain("if (wasOpen && wasLocked) focusInput()");
  expect(popover).toContain('const historyShortcutLabel = computed(() => (isMacOS.value ? "⌘ ⇧ K" : "Ctrl ⇧ K"));');
  expect(popover).toContain('const approvalShortcutLabel = computed(() => (isMacOS.value ? "⌘ ↵" : "Ctrl ↵"));');
  expect(popover).toContain('v-if="quickApproval?.id === approval.id"');
  expect(popover).toContain("{{ approvalShortcutLabel }}");
});
