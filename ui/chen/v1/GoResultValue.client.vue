<script setup lang="ts">
import prettyBytes from "pretty-bytes";
import { writeClipboardText } from "~/utils/clipboard";
import MonacoValueViewer from "./MonacoValueViewer.client.vue";
import { formatResultHex, resultBinaryHex, resultJsonFormat, resultValuePart, resultValueText } from "./resultGrid";

const props = defineProps<{
  cell: { name: string; type: string; row: number; value: unknown };
  canCopy: boolean;
}>();
const open = defineModel<boolean>("open", { required: true });
const { t, locale } = useI18n();
const toast = useToast();
const viewer = ref<InstanceType<typeof MonacoValueViewer>>();
const fullscreen = ref(false);
const wrap = ref(true);
const prettyJson = ref(true);
const hexMode = ref(true);
const partIndex = ref(0);
const rawText = computed(() => resultValueText(props.cell.value));
const binaryHex = computed(() => resultBinaryHex(props.cell.value, props.cell.type));
const jsonFormat = computed(() => {
  if (binaryHex.value !== null || props.cell.value == null) return { text: null, limited: false };
  if (!/^jsonb?$/i.test(props.cell.type) && !/^\s*[[{]/.test(rawText.value)) return { text: null, limited: false };
  return resultJsonFormat(rawText.value);
});
const source = computed(() => {
  if (binaryHex.value !== null && hexMode.value) return binaryHex.value;
  return prettyJson.value && jsonFormat.value.text !== null ? jsonFormat.value.text : rawText.value;
});
const part = computed(() => resultValuePart(source.value, partIndex.value));
const valueText = computed(() =>
  binaryHex.value !== null && hexMode.value ? formatResultHex(part.value.text, part.value.start / 2) : part.value.text
);
const sizeLabel = computed(() => {
  if (props.cell.value == null) return "";
  const binary = binaryHex.value !== null;
  const bytes = binary ? binaryHex.value!.length / 2 : new Blob([rawText.value]).size;
  return t(binary ? "Chen.GoV1ValueBinarySize" : "Chen.GoV1ValueTextSize", {
    size: prettyBytes(bytes, { binary: true, locale: locale.value })
  });
});
watch([prettyJson, hexMode, () => props.cell], () => {
  partIndex.value = 0;
});
function preventCopy(event: ClipboardEvent) {
  if (props.canCopy) return;
  event.preventDefault();
  event.stopPropagation();
}
async function copyValue() {
  if (!props.canCopy) return;
  try {
    await writeClipboardText(rawText.value);
    toast.add({ title: t("Chen.SelectionCopied"), color: "success" });
  } catch {
    toast.add({ title: t("Common.CopyFailed"), color: "error" });
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="cell.name"
    :description="`${cell.type} · ${t('Chen.RowNumber')} ${cell.row} · ${t('Chen.GoV1GridReadOnly')}`"
    :fullscreen="fullscreen"
    :ui="{
      content: fullscreen ? 'flex flex-col' : 'flex h-[80vh] max-h-[900px] flex-col sm:max-w-5xl',
      body: 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 sm:p-0'
    }"
  >
    <template #body>
      <div class="flex min-h-0 flex-1 flex-col" @copy.capture="preventCopy">
        <div class="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-default px-3 py-2">
          <UBadge v-if="cell.value == null" color="neutral" variant="soft">NULL</UBadge>
          <UBadge v-else-if="cell.value === ''" color="neutral" variant="soft">
            {{ t("Chen.GoV1GridEmptyString") }}
          </UBadge>
          <span v-if="sizeLabel" class="mr-auto text-xs text-muted">{{ sizeLabel }}</span>
          <UButton
            v-if="jsonFormat.text !== null"
            :label="t(prettyJson ? 'Chen.GoV1GridRawValue' : 'Chen.GoV1GridPrettyJson')"
            color="neutral"
            variant="soft"
            size="xs"
            @click="prettyJson = !prettyJson"
          />
          <UButton
            v-if="binaryHex !== null"
            :label="t(hexMode ? 'Chen.GoV1GridRawValue' : 'Chen.GoV1ValueHex')"
            color="neutral"
            variant="soft"
            size="xs"
            @click="hexMode = !hexMode"
          />
          <UButton
            icon="i-lucide-wrap-text"
            :label="t('Chen.GoV1ValueWrap')"
            :aria-pressed="wrap"
            :variant="wrap ? 'soft' : 'ghost'"
            color="neutral"
            size="xs"
            @click="wrap = !wrap"
          />
          <UButton
            icon="i-lucide-search"
            :label="t('Chen.GoV1ValueFind')"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="viewer?.find()"
          />
          <UButton
            icon="i-lucide-copy"
            :label="t('Chen.GoV1GridCopyValue')"
            :disabled="!canCopy"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="copyValue"
          />
          <UButton
            :icon="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
            :aria-label="t(fullscreen ? 'Chen.GoV1ValueCollapse' : 'Chen.GoV1ValueExpand')"
            :title="t(fullscreen ? 'Chen.GoV1ValueCollapse' : 'Chen.GoV1ValueExpand')"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="fullscreen = !fullscreen"
          />
        </div>
        <p v-if="jsonFormat.limited" class="shrink-0 px-3 pt-2 text-xs text-muted" role="status">
          {{ t("Chen.GoV1ValueFormatLimit") }}
        </p>
        <div class="min-h-0 flex-1 py-2">
          <MonacoValueViewer
            ref="viewer"
            :value="valueText"
            :json="jsonFormat.text !== null"
            :wrap="wrap"
            :can-copy="canCopy"
            :label="cell.name"
          />
        </div>
        <div class="flex shrink-0 items-center gap-2 border-t border-default px-3 py-2 text-xs text-muted">
          <template v-if="part.total > 1">
            <span class="min-w-0 flex-1">{{ t("Chen.GoV1ValueChunked") }}</span>
            <UButton
              icon="i-lucide-chevron-left"
              :disabled="part.index === 0"
              :aria-label="t('Chen.GoV1ValuePreviousPart')"
              :title="t('Chen.GoV1ValuePreviousPart')"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="partIndex = part.index - 1"
            />
            <span class="shrink-0 tabular-nums">
              {{ t("Chen.GoV1ValuePart", { index: part.index + 1, total: part.total }) }}
            </span>
            <UButton
              icon="i-lucide-chevron-right"
              :disabled="part.index === part.total - 1"
              :aria-label="t('Chen.GoV1ValueNextPart')"
              :title="t('Chen.GoV1ValueNextPart')"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="partIndex = part.index + 1"
            />
          </template>
          <span v-else>{{ t("Chen.GoV1ValueComplete") }}</span>
        </div>
      </div>
    </template>
  </UModal>
</template>
