import type { Toast } from "@nuxt/ui/dist/runtime/composables/useToast";

import { useToast as useNuxtUiToast } from "@nuxt/ui/dist/runtime/composables/useToast";

import { writeClipboardText } from "~/utils/clipboard";

const COPY_ACTION_ICONS = new Set(["i-lucide-copy", "lucide:copy"]);
const COPY_LABELS = new Set(["copy", "copied", "复制", "已复制"]);

function normalizeToastText(value: unknown) {
  return String(value ?? "").trim();
}

function buildToastCopyText(toast: Partial<Toast>) {
  const parts = [
    normalizeToastText(toast.title),
    normalizeToastText(toast.description)
  ].filter(Boolean);

  return parts.join("\n");
}

function hasCopyAction(toast: Partial<Toast>) {
  return (toast.actions ?? []).some((action) => {
    const label = String(action?.label ?? "").trim().toLowerCase();
    const icon = String(action?.icon ?? "").trim();
    return COPY_LABELS.has(label) || COPY_ACTION_ICONS.has(icon);
  });
}

export function useToast() {
  const toast = useNuxtUiToast();
  const { t, locale } = useI18n();

  const add = (input: Partial<Toast>) => {
    const copyText = buildToastCopyText(input);
    const shouldAddCopyAction = input.color === "error" && copyText && !hasCopyAction(input);

    if (!shouldAddCopyAction) {
      return toast.add(input);
    }

    return toast.add({
      ...input,
      actions: [
        ...(input.actions ?? []),
        {
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
        }
      ]
    });
  };

  return {
    ...toast,
    add
  };
}
