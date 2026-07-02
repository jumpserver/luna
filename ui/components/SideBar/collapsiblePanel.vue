<script setup lang="ts">
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  icon?: string
  exclusiveGroup?: string
  preferredHeight?: number
  minHeight?: number
  maxHeight?: string
}>(), {
  preferredHeight: 200,
  minHeight: 112,
  maxHeight: "50%"
});

const emit = defineEmits<{
  toggle: []
}>();

const panelStyle = computed(() => props.open
  ? {
      height: `min(${props.preferredHeight}px, ${props.maxHeight})`,
      minHeight: `min(${props.minHeight}px, ${props.maxHeight})`
    }
  : { height: "32px" });
</script>

<template>
  <section
    class="group flex min-h-8 shrink-0 flex-col overflow-hidden border-t border-gray-200 dark:border-white/10"
    :style="panelStyle"
  >
    <button
      type="button"
      class="flex h-8 shrink-0 items-center gap-1.5 px-3 text-left text-xs font-medium text-gray-700 dark:text-gray-200"
      :aria-expanded="open"
      @click="emit('toggle')"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0 transition-transform duration-150"
        :class="open ? 'rotate-90' : ''"
      />
      <span class="min-w-0 flex-1 truncate">{{ title }}</span>
      <div class="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <slot name="actions" />
      </div>
    </button>

    <div v-if="open" class="min-h-0 flex-1 overflow-y-auto">
      <slot />
    </div>
  </section>
</template>
