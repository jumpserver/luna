import type { Toast } from "@nuxt/ui/composables";

type ErrorToastAction = NonNullable<Toast["actions"]>[number];

interface ErrorToastOptions {
  id?: Toast["id"];
  title: string;
  description?: string;
  error?: unknown;
  icon?: string;
  duration?: number;
  progress?: boolean;
  actions?: ErrorToastAction[];
}

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

function localizeErrorDescription(description: string, translate: (key: string) => string) {
  const apiMessage = description.replace(/^ApiRequestError:\s*/i, "").trim();
  if (/^Personal credential not found\.?$/i.test(apiMessage)) {
    return translate("ConnectError.PersonalCredentialNotFound");
  }
  return description;
}

export function useErrorToast() {
  const { t } = useI18n();
  const toast = useToast();

  const addErrorToast = (options: ErrorToastOptions) => {
    const description = localizeErrorDescription(
      normalizeErrorText(options.description ?? resolveErrorDescription(options.error)),
      t
    );
    const actions = [...(options.actions ?? [])];

    return toast.add({
      ...(options.id != null ? { id: options.id } : {}),
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
