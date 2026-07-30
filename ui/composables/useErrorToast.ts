import type { Toast } from "@nuxt/ui/dist/runtime/composables/useToast";

import { writeClipboardText } from "~/utils/clipboard";

interface ErrorToastOptions {
  title: string;
  description?: string;
  error?: unknown;
  icon?: string;
  duration?: number;
  progress?: boolean;
  actions?: Partial<Toast["actions"][number]>[];
}

const COPY_ACTION_ICONS = new Set(["i-lucide-copy", "lucide:copy"]);
const COPY_LABELS = new Set(["copy", "copied", "复制", "已复制"]);

function normalizeToastText(value: unknown) {
  return String(value ?? "").trim();
}

function resolveErrorDescription(error: unknown) {
  if (error instanceof Error) return error.message;
  return normalizeToastText(error);
}

function hasCopyAction(actions: Partial<Toast["actions"][number]>[] = []) {
  return actions.some((action) => {
    const label = normalizeToastText(action?.label).toLowerCase();
    const icon = normalizeToastText(action?.icon);
    return COPY_LABELS.has(label) || COPY_ACTION_ICONS.has(icon);
  });
}

export function useErrorToast() {
  const { t, locale } = useI18n();
  const toast = useToast();

  const addErrorToast = (options: ErrorToastOptions) => {
    const description = options.description ?? resolveErrorDescription(options.error);
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
            title: locale.value === "zh" ? "已复制" : "Copied",
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
