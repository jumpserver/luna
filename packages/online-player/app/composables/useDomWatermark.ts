import { Watermark } from "@watermark-design/dom";

export function useDomWatermark(
  host: MaybeRefOrGetter<HTMLElement | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
  options: MaybeRefOrGetter<object>
) {
  let watermark: Watermark | null = null;

  const destroyWatermark = () => {
    watermark?.destroy();
    watermark = null;
  };

  const applyWatermark = async () => {
    const el = toValue(host);
    const isEnabled = toValue(enabled);
    const nextOptions = toValue(options) as Record<string, unknown>;
    if (!el || !isEnabled || !nextOptions.content) {
      destroyWatermark();
      return;
    }

    const next = { ...nextOptions, parent: el };
    if (!watermark) {
      watermark = new Watermark(next);
      await watermark.create();
      return;
    }

    await watermark.changeOptions(next, "overwrite", true);
  };

  watch(
    () => [toValue(host), toValue(enabled), toValue(options)],
    () => void applyWatermark(),
    { flush: "post" }
  );
  onMounted(() => void applyWatermark());
  onBeforeUnmount(destroyWatermark);
}
