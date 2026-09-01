import { desktopInvoke } from "~/shared/desktop/bridge";
import { writeClipboardText } from "~/utils/clipboard";
import { isDesktopRuntime } from "~/utils/runtime";

const MAX_LINES = 2000;
const methods = ["log", "info", "warn", "error", "debug"] as const;
type ConsoleMethod = (typeof methods)[number];

const originalConsole: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};
let hooked = false;
const lines: string[] = [];

const formatArg = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const pushLine = (level: string, args: unknown[]) => {
  const time = new Date().toISOString();
  const message = args.map(formatArg).join(" ");
  lines.push(`${time} [renderer] [${level}] ${message}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
};

const mergeLogText = (...chunks: string[]) =>
  chunks
    .flatMap((chunk) => chunk.split(/\r?\n/))
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .join("\n");

export const installDebugLogHook = () => {
  if (!import.meta.client || hooked) return;
  hooked = true;

  for (const method of methods) {
    originalConsole[method] = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      originalConsole[method]?.(...args);
      pushLine(method, args);
    };
  }
};

export const uninstallDebugLogHook = () => {
  if (!hooked) return;
  for (const method of methods) {
    const original = originalConsole[method];
    if (original) console[method] = original as typeof console.log;
  }
  hooked = false;
};

export const useDebugLog = () => {
  const { debugLog, setDebugLog } = useSettingManager();
  const toast = useToast();
  const { t } = useI18n();

  const readDesktopLogs = async () => {
    if (!isDesktopRuntime()) return "";
    try {
      return (await desktopInvoke<string>("debug_log_read")) || "";
    } catch {
      return "";
    }
  };

  const combinedLogText = async () => mergeLogText(lines.join("\n"), await readDesktopLogs());

  const clearLogs = async () => {
    lines.length = 0;
    if (isDesktopRuntime()) {
      await desktopInvoke("debug_log_clear").catch(() => undefined);
    }
    toast.add({ title: t("Setting.LogsCleared"), color: "success" });
  };

  const copyLogs = async () => {
    const text = await combinedLogText();
    if (!text) {
      toast.add({ title: t("Setting.LogsEmpty"), color: "neutral" });
      return;
    }
    await writeClipboardText(text);
    toast.add({ title: t("Setting.LogsCopied"), color: "success" });
  };

  const downloadLogs = async () => {
    if (!import.meta.client) return;
    const text = await combinedLogText();
    if (!text) {
      toast.add({ title: t("Setting.LogsEmpty"), color: "neutral" });
      return;
    }
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jumpserver-debug-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return {
    debugLog,
    setDebugLog,
    clearLogs,
    copyLogs,
    downloadLogs
  };
};
