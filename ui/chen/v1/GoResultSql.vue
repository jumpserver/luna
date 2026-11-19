<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{ sql: string; canCopy: boolean; startedAt?: string; executionId?: string }>();
const { t } = useI18n();
const preview = useTemplateRef("preview");
const clipped = ref(false);
const open = ref(false);
function measure() {
  const el = preview.value;
  clipped.value = !!el && el.scrollWidth > el.clientWidth;
}
useResizeObserver(preview, measure);
watch(
  () => props.sql,
  () => {
    open.value = false;
    measure();
  },
  { flush: "post" }
);
function preventCopy(event: ClipboardEvent) {
  if (!props.canCopy) event.preventDefault();
}
</script>

<template>
  <UTooltip
    v-if="sql"
    :disabled="!clipped || open"
    :content="{ side: 'bottom', align: 'start' }"
    :ui="{
      content:
        'block h-auto max-h-[min(45vh,var(--reka-tooltip-content-available-height))] max-w-[min(48rem,calc(100vw-1rem))] overflow-auto p-2'
    }"
  >
    <button
      type="button"
      data-result-sql
      class="min-w-0 truncate rounded-sm px-1 py-0.5 text-left font-ui-mono text-xs text-muted hover:bg-elevated hover:text-highlighted focus-visible:outline-primary"
      :aria-label="t('Chen.GoV1ResultSource')"
      aria-haspopup="dialog"
      @click="open = true"
    >
      <span ref="preview" class="block truncate">{{ sql }}</span>
    </button>
    <template #content>
      <pre class="whitespace-pre-wrap wrap-anywhere font-ui-mono text-xs" @copy="preventCopy">{{ sql }}</pre>
    </template>
  </UTooltip>
  <UModal v-model:open="open" :title="t('Chen.GoV1ResultSource')" :ui="{ content: 'sm:max-w-3xl' }">
    <template #body>
      <time v-if="startedAt" class="mb-2 block text-xs text-muted" :datetime="startedAt" :title="executionId">
        {{ new Date(startedAt).toLocaleString() }}
      </time>
      <pre
        class="max-h-[65vh] overflow-auto whitespace-pre-wrap wrap-anywhere font-ui-mono text-sm"
        :class="{ 'select-none': !canCopy }"
        @copy="preventCopy"
        @cut="preventCopy"
        >{{ sql }}</pre>
    </template>
  </UModal>
</template>
