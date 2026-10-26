import type { GoCompletion } from "./api";

export function completionIsCurrent(
  result: GoCompletion,
  requestedVersion: number,
  currentVersion: number,
  documentLength: number,
  aborted: boolean,
  requestedOffset?: number,
  currentOffset?: number
) {
  return (
    !aborted &&
    result.document_version === requestedVersion &&
    currentVersion === requestedVersion &&
    Number.isInteger(result.from) &&
    Number.isInteger(result.to) &&
    result.from >= 0 &&
    result.to >= result.from &&
    result.to <= documentLength &&
    (requestedOffset === undefined ||
      (requestedOffset === currentOffset && result.from <= requestedOffset && requestedOffset <= result.to))
  );
}

// Monaco filters against the replaced text, including an opening identifier
// quote. Keep that quote in the filter while displaying the catalog name plainly.
export function completionFilterText(item: GoCompletion["items"][number], replacedPrefix: string) {
  const text = item.filter_text || item.label;
  const quote = replacedPrefix[0];
  if (quote === "[") return `[${text.replaceAll("]", "]]")}`;
  return quote === '"' || quote === "`" ? quote + text.replaceAll(quote, quote + quote) : text;
}

export function waitForCompletion(signal: AbortSignal, delay = 120): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve(true);
    }, delay);
    signal.addEventListener("abort", abort, { once: true });
  });
}
