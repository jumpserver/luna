import { expect, it } from "vitest";

import en from "../../../../../i18n/locales/en.json";
import zh from "../../../../../i18n/locales/zh.json";
import {
  terminalAiAclKey,
  terminalAiBackgroundReasonKey,
  terminalAiErrorKey,
  terminalAiExecutionKey,
  terminalAiProgressKey
} from "./terminalAiPresentation";

it("maps Terminal AI protocol values to localized presentation keys", () => {
  expect(terminalAiExecutionKey("pty")).toBe("RightPanel.AICurrentPty");
  expect(terminalAiExecutionKey("background_exec")).toBe("RightPanel.AIBackgroundExecution");
  expect(terminalAiExecutionKey("future_executor")).toBeUndefined();

  expect(terminalAiProgressKey({ state: "tool_running" })).toBe("RightPanel.AIProgressReadingTerminal");
  expect(
    terminalAiProgressKey({
      state: "executing",
      text: "命令正在当前 PTY 中执行，可直接在终端交互…"
    })
  ).toBe("RightPanel.AIProgressExecutingPty");
  expect(terminalAiProgressKey({ state: "executing" })).toBe("RightPanel.AIProgressExecuting");
  expect(terminalAiProgressKey({ code: "summarizing", state: "future_state" })).toBe(
    "RightPanel.AIProgressSummarizing"
  );
  expect(terminalAiProgressKey({ state: "idle" })).toBeUndefined();

  expect(terminalAiBackgroundReasonKey("disabled_by_rules", "ignored legacy text")).toBe(
    "RightPanel.AIBackgroundDisabledByRules"
  );
  expect(terminalAiBackgroundReasonKey("", "background executor is initializing")).toBe(
    "RightPanel.AIBackgroundInitializing"
  );
  expect(terminalAiBackgroundReasonKey("", "low-level connection failure")).toBe("RightPanel.AIBackgroundUnavailable");

  expect(terminalAiErrorKey("send_failed", "ignored legacy text")).toBe("RightPanel.AISendFailed");
  expect(terminalAiErrorKey("", "Terminal AI failed")).toBe("RightPanel.AIFailed");
  expect(terminalAiErrorKey("", "provider diagnostic")).toBeUndefined();

  expect(terminalAiAclKey("waiting_for_review")).toBe("RightPanel.AICommandAclWaitingReview");
  expect(terminalAiAclKey("notify_and_warn")).toBe("RightPanel.AICommandAclNotifyAndWarn");
});

it("defines every Terminal AI presentation key in both locales", () => {
  const keys = [
    "RightPanel.AICurrentPty",
    "RightPanel.AIBackgroundExecution",
    "RightPanel.AIProgressAnalyzing",
    "RightPanel.AIProgressExecuting",
    "RightPanel.AIProgressExecutingPty",
    "RightPanel.AIProgressPlanning",
    "RightPanel.AIProgressSummarizing",
    "RightPanel.AIProgressReadingTerminal",
    "RightPanel.AIBackgroundDisabledByRules",
    "RightPanel.AIBackgroundInitializing",
    "RightPanel.AIBackgroundUnavailable",
    "RightPanel.AIBackgroundPtyOnly",
    "RightPanel.AIApprovalFailed",
    "RightPanel.AIErrorApprovalRejected",
    "RightPanel.AIFailed",
    "RightPanel.AIInterruptFailed",
    "RightPanel.AIErrorInvalidMessage",
    "RightPanel.AIPolicyFailed",
    "RightPanel.AIErrorResponseActive",
    "RightPanel.AISendFailed",
    "RightPanel.AIUnavailableForTerminal",
    "RightPanel.AICommandAclAccepted",
    "RightPanel.AIStatusApproved",
    "RightPanel.AICommandAclNotifyAndWarn",
    "RightPanel.AIStatusRejected",
    "RightPanel.AICommandAclReview",
    "RightPanel.AICommandAclWaitingReview",
    "RightPanel.AICommandAclWarning",
    "RightPanel.AIExitCode"
  ];

  for (const key of keys) {
    expect(en).toHaveProperty(key);
    expect(zh).toHaveProperty(key);
  }
});
