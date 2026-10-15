// oxlint-disable no-control-regex
import { normalizeErrorText } from "~/composables/useErrorToast";

const MAX_CONNECTION_FAILURE_LINES = 10;
const MAX_CONNECTION_FAILURE_LENGTH = 2_000;

export function normalizeConnectionFailure(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const text = normalizeErrorText(
    raw
      .replace(/\u001B\][\s\S]*?(?:\u0007|\u001B\\)/gu, "")
      .replace(/\u001B\[[\d;? ]*[A-Za-z~]/gu, "")
      .replace(/\r\n?/gu, "\n")
      .replace(/[^\n]*[\u0000-\u0008\u000B-\u001F\u007F-\u009F][^\n]*/gu, (line) =>
        line
          .split(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]+/u)
          .map((part) => part.replace(/^[\d.\s]+(?=[A-Za-z]{2}|[\u3400-\u9FFF])/u, ""))
          .filter((part) => /[A-Za-z]{2,}|[\u3400-\u9FFF]/u.test(part))
          .join("\n")
      )
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
  );
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-MAX_CONNECTION_FAILURE_LINES);

  return lines.join("\n").slice(-MAX_CONNECTION_FAILURE_LENGTH);
}
