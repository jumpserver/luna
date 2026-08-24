import type { Toast } from "@nuxt/ui/composables";

import { writeClipboardText } from "~/utils/clipboard";

type ErrorToastAction = NonNullable<Toast["actions"]>[number];

interface ErrorToastOptions {
  title: string;
  description?: string;
  error?: unknown;
  icon?: string;
  duration?: number;
  progress?: boolean;
  actions?: ErrorToastAction[];
}

const COPY_ACTION_ICONS = new Set(["i-lucide-copy", "lucide:copy"]);
const COPY_LABELS = new Set(["copy", "copied", "复制", "已复制"]);

export function normalizeErrorText(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || !/[<&]/.test(raw)) return raw;

  const withBreaks = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n");
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(withBreaks, "text/html");
    document.querySelectorAll("script, style, noscript, template").forEach((element) => element.remove());
    return (document.body.textContent || "")
      .replace(/\u00A0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return withBreaks
    .replace(/<(?:script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|template)>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeToastText(value: unknown) {
  return normalizeErrorText(value);
}

function resolveErrorDescription(error: unknown) {
  if (error instanceof Error) return error.message;
  return normalizeToastText(error);
}

function hasCopyAction(actions: ErrorToastAction[] = []) {
  return actions.some((action) => {
    const label = normalizeToastText(action?.label).toLowerCase();
    const icon = normalizeToastText(action?.icon);
    return COPY_LABELS.has(label) || COPY_ACTION_ICONS.has(icon);
  });
}

export function useErrorToast() {
  const { t } = useI18n();
  const toast = useToast();

  const addErrorToast = (options: ErrorToastOptions) => {
    const description = normalizeErrorText(options.description ?? resolveErrorDescription(options.error));
    const actions = [...(options.actions ?? [])];
    const copyText = [options.title, description].filter(Boolean).join("\n");

    if (copyText && !hasCopyAction(actions)) {
      actions.push({
        label: t("Common.Copy"),
        icon: "i-lucide-copy",
        color: "neutral",
        variant: "soft",
        onClick: async () => {
          await writeClipboardText(copyText);
          toast.add({
            title: t("Common.CopySuccess"),
            color: "success",
            duration: 1200
          });
        }
      });
    }

    return toast.add({
      title: options.title,
      description,
      color: "error",
      ...(options.icon ? { icon: options.icon } : {}),
      ...(options.duration != null ? { duration: options.duration } : {}),
      ...(options.progress != null ? { progress: options.progress } : {}),
      ...(actions.length ? { actions } : {})
    });
  };

  return {
    addErrorToast
  };
}
