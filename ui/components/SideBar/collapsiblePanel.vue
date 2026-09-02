<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    icon?: string;
    exclusiveGroup?: string;
    preferredHeight?: number;
    minHeight?: number;
    maxHeight?: string;
    fillAvailable?: boolean;
    hideChrome?: boolean;
    workspaceTour?: string;
  }>(),
  {
    preferredHeight: 200,
    minHeight: 112,
    maxHeight: "50%",
    hideChrome: false
  }
);

const emit = defineEmits<{
  toggle: [];
}>();

const panelStyle = computed(() => {
  if (props.hideChrome) {
    return {
      height: "auto",
      minHeight: 0,
      flexGrow: 1
    };
  }

  return props.open
    ? props.fillAvailable
      ? {
          height: "auto",
          minHeight: `${props.minHeight}px`,
          flexGrow: 1
        }
      : {
          height: `min(${props.preferredHeight}px, ${props.maxHeight})`,
          minHeight: `min(${props.minHeight}px, ${props.maxHeight})`
        }
    : { height: "32px" };
});
</script>

<template>
  <section
    class="group flex flex-col overflow-hidden"
    :class="hideChrome ? 'min-h-0 flex-1' : 'min-h-8 shrink-0 border-t border-gray-200 dark:border-white/10'"
    :style="panelStyle"
  >
    <button
      v-if="!hideChrome"
      type="button"
      class="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 px-2.5 text-left text-sm font-medium text-gray-700 dark:text-gray-200"
      :data-workspace-tour="workspaceTour"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="sidebar-icon transition-transform duration-150"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <div class="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <slot name="actions" />
      </div>
    </button>

    <div v-if="open || hideChrome" class="min-h-0 flex-1 overflow-y-auto">
      <slot />
    </div>
  </section>
</template>
