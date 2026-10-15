<script setup lang="ts">
import { transferFileBreadcrumbItems, transferFileDisplayPath } from "#koko/composables/sftp/file-manager/selectors";

const props = defineProps<{
  source: { name: string; relativeDir?: string };
}>();

const fullPath = computed(() => transferFileDisplayPath(props.source));
const items = computed(() => transferFileBreadcrumbItems(props.source).map((label) => ({ label })));
</script>

<template>
  <span v-if="items.length" class="min-w-0 flex-1 overflow-hidden">
    <UTooltip :text="fullPath">
      <UBreadcrumb
        class="min-w-0 max-w-full"
        :items="items"
        :ui="{
          root: 'min-w-0 max-w-full',
          list: 'min-w-0 flex-nowrap overflow-hidden gap-0.5',
          item: 'min-w-0',
          link: 'cursor-default py-0 text-xs',
          linkLabel: 'max-w-20 truncate',
          separatorIcon: 'size-3'
        }"
      />
    </UTooltip>
  </span>
  <span v-else class="min-w-0 truncate">{{ source.name }}</span>
</template>
